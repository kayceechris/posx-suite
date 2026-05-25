from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone

from database import db
from models import User, Requisition, RequisitionCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/requisitions")
async def get_requisitions(
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    if status:
        query["status"] = status
    items = await db.requisitions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.get("/requisitions/{req_id}")
async def get_requisition(req_id: str, current_user: User = Depends(get_current_user)):
    item = await db.requisitions.find_one({"id": req_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return item


@router.post("/requisitions", response_model=Requisition)
async def create_requisition(data: RequisitionCreate, current_user: User = Depends(get_current_user)):
    req = Requisition(
        **data.model_dump(),
        created_by=current_user.id,
        created_by_name=current_user.name,
    )
    doc = req.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("fulfilled_at"):
        doc["fulfilled_at"] = doc["fulfilled_at"].isoformat()
    await db.requisitions.insert_one(doc)
    return req


@router.put("/requisitions/{req_id}/approve")
async def approve_requisition(req_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    req = await db.requisitions.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot approve a requisition with status '{req['status']}'")
    await db.requisitions.update_one({"id": req_id}, {"$set": {"status": "approved"}})
    return {"message": "Requisition approved"}


@router.put("/requisitions/{req_id}/reject")
async def reject_requisition(req_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    req = await db.requisitions.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    if req["status"] not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot reject a requisition with status '{req['status']}'")
    await db.requisitions.update_one({"id": req_id}, {"$set": {"status": "rejected"}})
    return {"message": "Requisition rejected"}


@router.put("/requisitions/{req_id}/fulfill")
async def fulfill_requisition(req_id: str, payload: dict = {}, current_user: User = Depends(get_current_user)):
    """
    Transfer stock from main store → from_store (kitchen or bar).
    Optional payload: { "overrides": { product_id: qty } } to partially fulfill.
    """
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    req = await db.requisitions.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    if req["status"] not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot fulfill a requisition with status '{req['status']}'")

    outlet_id = req["outlet_id"]
    from_store = req["from_store"]   # destination (kitchen/bar)
    overrides = (payload or {}).get("overrides") or {}

    updated_items = []
    for item in req["items"]:
        pid = item["product_id"]
        qty = int(overrides.get(pid, item["quantity_requested"]))
        if qty <= 0:
            updated_items.append({**item, "quantity_fulfilled": 0})
            continue

        # Deduct from main store
        await db.stock.update_one(
            {"product_id": pid, "outlet_id": outlet_id, "store": "main"},
            {"$inc": {"quantity": -qty}},
        )

        # Add to destination store (upsert)
        existing = await db.stock.find_one(
            {"product_id": pid, "outlet_id": outlet_id, "store": from_store}
        )
        if existing:
            await db.stock.update_one(
                {"product_id": pid, "outlet_id": outlet_id, "store": from_store},
                {"$inc": {"quantity": qty}},
            )
        else:
            from models import Stock
            new_stock = Stock(
                product_id=pid,
                outlet_id=outlet_id,
                store=from_store,
                quantity=qty,
                min_quantity=item.get("min_quantity") or 5,
            )
            doc = new_stock.model_dump()
            doc["updated_at"] = doc["updated_at"].isoformat()
            await db.stock.insert_one(doc)

        updated_items.append({**item, "quantity_fulfilled": qty})

    now = datetime.now(timezone.utc)
    await db.requisitions.update_one(
        {"id": req_id},
        {"$set": {
            "status": "fulfilled",
            "items": updated_items,
            "fulfilled_by": current_user.id,
            "fulfilled_by_name": current_user.name,
            "fulfilled_at": now.isoformat(),
        }},
    )
    return {"message": "Requisition fulfilled and stock transferred"}


@router.delete("/requisitions/{req_id}")
async def delete_requisition(req_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    req = await db.requisitions.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    if req["status"] == "fulfilled":
        raise HTTPException(status_code=400, detail="Cannot delete a fulfilled requisition")
    await db.requisitions.delete_one({"id": req_id})
    return {"message": "Requisition deleted"}
