import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from auth import get_current_user
from database import db
from lib.email_service import send_new_purchase_order_email
from models import User, Supplier, SupplierCreate, PurchaseOrder, PurchaseOrderCreate

router = APIRouter(prefix="/api")


def _can_manage_purchases(user: User) -> bool:
    """Admin, manager, or any user explicitly granted approve_purchase permission."""
    return user.role in ("admin", "manager") or "approve_purchase" in (user.permissions or [])


# ==================== SUPPLIER ROUTES ====================

@router.get("/suppliers")
async def get_suppliers(current_user: User = Depends(get_current_user)):
    if not _can_manage_purchases(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(1000)
    return suppliers


@router.post("/suppliers", response_model=Supplier)
async def create_supplier(supplier_data: SupplierCreate, current_user: User = Depends(get_current_user)):
    if not _can_manage_purchases(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    supplier = Supplier(**supplier_data.model_dump())
    doc = supplier.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.suppliers.insert_one(doc)
    return supplier


@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, supplier_data: dict, current_user: User = Depends(get_current_user)):
    if not _can_manage_purchases(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = {k: v for k, v in supplier_data.items() if k not in ("id", "created_at")}
    result = await db.suppliers.update_one({"id": supplier_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    updated = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    return updated


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, current_user: User = Depends(get_current_user)):
    if not _can_manage_purchases(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier deleted successfully"}


# ==================== PURCHASE ORDER ROUTES ====================

@router.get("/purchase-orders")
async def get_purchase_orders(current_user: User = Depends(get_current_user)):
    if not _can_manage_purchases(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    pos = await db.purchase_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return pos


@router.post("/purchase-orders")
async def create_purchase_order(po_data: PurchaseOrderCreate, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    if not _can_manage_purchases(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    count = await db.purchase_orders.count_documents({})
    po_dict = po_data.model_dump()
    status = po_dict.pop("status", None) or "pending"
    po_dict["type"] = "external"  # always external — internal transfers use requisitions
    po = PurchaseOrder(**po_dict, status=status, po_number=f"PO{count + 1:06d}", created_by=current_user.id)
    doc = po.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.purchase_orders.insert_one(doc)
    doc.pop("_id", None)
    # Resolve supplier name for the email
    supplier = await db.suppliers.find_one({"id": po.supplier_id}, {"_id": 0, "name": 1})
    email_doc = {**doc, "supplier_name": supplier["name"] if supplier else "—", "created_by_name": current_user.name}
    background_tasks.add_task(send_new_purchase_order_email, email_doc)
    return doc


@router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, po_data: dict, current_user: User = Depends(get_current_user)):
    if not _can_manage_purchases(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    update_fields = {k: v for k, v in po_data.items() if k not in ("id", "created_at", "po_number")}
    result = await db.purchase_orders.update_one({"id": po_id}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if update_fields.get("status") == "received":
        po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
        if po:
            outlet_id = po.get("outlet_id") or ""
            for item in po.get("items", []):
                if item.get("product_id") and item.get("quantity"):
                    qty = int(item["quantity"])
                    stock_filter = {"product_id": item["product_id"], "store": "main"}
                    if outlet_id:
                        stock_filter["outlet_id"] = outlet_id
                    existing = await db.stock.find_one(stock_filter, {"_id": 0})
                    if existing:
                        await db.stock.update_one(stock_filter, {"$inc": {"quantity": qty}})
                    else:
                        await db.stock.insert_one({
                            "id": str(uuid.uuid4()),
                            "product_id": item["product_id"],
                            "outlet_id": outlet_id,
                            "store": "main",
                            "quantity": qty,
                            "min_quantity": 10,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        })

    updated = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    return updated


@router.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str, current_user: User = Depends(get_current_user)):
    if not _can_manage_purchases(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.purchase_orders.delete_one({"id": po_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return {"message": "Purchase order deleted"}
