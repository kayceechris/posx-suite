from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import date, timedelta

from database import db
from models import User, Order, OrderCreate, SplitBill, SplitBillCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.post("/orders", response_model=Order)
async def create_order(order_data: OrderCreate, current_user: User = Depends(get_current_user)):
    count = await db.orders.count_documents({})
    order_number = f"ORD{count + 1:06d}"

    order = Order(
        **order_data.model_dump(),
        order_number=order_number,
        created_by=current_user.id,
        created_by_name=current_user.name,
        created_by_role=current_user.role,
    )

    if order.status == "completed":
        for item in order.items:
            await db.stock.update_one(
                {"product_id": item.product_id, "outlet_id": order.outlet_id},
                {"$inc": {"quantity": -item.quantity}}
            )
        if order.customer_id:
            await db.customers.update_one(
                {"id": order.customer_id},
                {"$inc": {"total_orders": 1, "total_spent": order.total}}
            )

    if order.table_id:
        kitchen_statuses = ("held", "sent_to_kitchen")
        await db.tables.update_one(
            {"id": order.table_id},
            {"$set": {
                "status": "occupied" if order.status in kitchen_statuses else "available",
                "current_order_id": order.id if order.status in kitchen_statuses else None
            }}
        )

    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.orders.insert_one(doc)
    return order


@router.put("/orders/{order_id}/complete")
async def complete_order(order_id: str, payment_method: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    for item in order["items"]:
        await db.stock.update_one(
            {"product_id": item["product_id"], "outlet_id": order["outlet_id"]},
            {"$inc": {"quantity": -item["quantity"]}}
        )

    if order.get("customer_id"):
        await db.customers.update_one(
            {"id": order["customer_id"]},
            {"$inc": {"total_orders": 1, "total_spent": order["total"]}}
        )

    if order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {
                "status": "available",
                "current_order_id": None
            }}
        )

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": "completed", "payment_method": payment_method}}
    )

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated


@router.get("/orders")
async def get_orders(
    outlet_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    created_by: Optional[str] = None,
    order_number: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    if start_date and end_date:
        try:
            next_day = (date.fromisoformat(end_date[:10]) + timedelta(days=1)).isoformat()
        except ValueError:
            next_day = end_date
        query["created_at"] = {"$gte": start_date[:10], "$lt": next_day}
    if created_by:
        query["created_by"] = created_by
    if order_number:
        query["order_number"] = {"$regex": order_number, "$options": "i"}

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders


@router.get("/orders/held/list")
async def get_held_orders(current_user: User = Depends(get_current_user)):
    """Return held orders. Admins/managers and cashiers with view_all_orders permission
    see every held order; all other roles see only their own."""
    can_see_all = (
        current_user.role in ("admin", "manager") or
        (current_user.role == "cashier" and
         current_user.permissions and "view_all_orders" in current_user.permissions)
    )
    query = {"status": {"$in": ["held", "sent_to_kitchen"]}}
    if not can_see_all:
        query["created_by"] = current_user.id
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders


@router.get("/orders/{order_id}")
async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.put("/orders/{order_id}")
async def update_order(order_id: str, order_data: dict, current_user: User = Depends(get_current_user)):
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")

    update_fields = {k: v for k, v in order_data.items() if k not in ("id", "created_at", "order_number", "created_by")}

    # Voiding a held/in-progress order requires explicit permission
    if update_fields.get("status") == "voided" and existing.get("status") in ("held", "sent_to_kitchen", "pending"):
        is_privileged = current_user.role in ["admin", "manager"]
        has_perm = "delete_held_order_items" in (current_user.permissions or [])
        if not is_privileged and not has_perm:
            raise HTTPException(status_code=403, detail="You don't have permission to void held orders")

    await db.orders.update_one({"id": order_id}, {"$set": update_fields})

    # Handle status transitions
    if update_fields.get("status") == "held" and existing.get("table_id"):
        await db.tables.update_one(
            {"id": existing["table_id"]},
            {"$set": {"status": "occupied", "current_order_id": order_id}}
        )

    if update_fields.get("status") == "completed" and existing.get("status") == "held":
        # Deduct stock for completed held orders
        items = update_fields.get("items", existing.get("items", []))
        outlet_id = existing.get("outlet_id", "")
        for item in items:
            await db.stock.update_one(
                {"product_id": item["product_id"], "outlet_id": outlet_id},
                {"$inc": {"quantity": -item["quantity"]}}
            )
        # Update customer stats
        customer_id = update_fields.get("customer_id") or existing.get("customer_id")
        if customer_id:
            total = update_fields.get("total", existing.get("total", 0))
            await db.customers.update_one(
                {"id": customer_id},
                {"$inc": {"total_orders": 1, "total_spent": total}}
            )
        # Release table if applicable
        if existing.get("table_id"):
            await db.tables.update_one(
                {"id": existing["table_id"]},
                {"$set": {"status": "available", "current_order_id": None}}
            )

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated


@router.delete("/orders/{order_id}")
async def delete_order(order_id: str, current_user: User = Depends(get_current_user)):
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")

    is_privileged = current_user.role in ["admin", "manager"]
    has_perm = "delete_held_order_items" in (current_user.permissions or [])
    if not is_privileged and not has_perm:
        raise HTTPException(status_code=403, detail="You don't have permission to delete held orders")
    # Release table if order was holding one
    if existing.get("table_id"):
        await db.tables.update_one(
            {"id": existing["table_id"]},
            {"$set": {"status": "available", "current_order_id": None}}
        )
    await db.orders.delete_one({"id": order_id})
    return {"message": "Order deleted"}


# ==================== SPLIT BILL ROUTES ====================

@router.post("/orders/{order_id}/split")
async def split_bill(order_id: str, split_data: SplitBillCreate, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    split_bills = []
    for idx, split in enumerate(split_data.splits, 1):
        split_bill = SplitBill(
            original_order_id=order_id,
            split_number=idx,
            amount=split["amount"],
            payment_method=split["payment_method"]
        )
        doc = split_bill.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.split_bills.insert_one(doc)
        split_bills.append(split_bill)

    return {"message": "Bill split successfully", "splits": split_bills}


@router.post("/orders/{order_id}/split/{split_id}/pay")
async def pay_split(order_id: str, split_id: str, current_user: User = Depends(get_current_user)):
    result = await db.split_bills.update_one(
        {"id": split_id, "original_order_id": order_id},
        {"$set": {"paid": True}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Split bill not found")

    all_splits = await db.split_bills.find({"original_order_id": order_id}, {"_id": 0}).to_list(100)
    all_paid = all(split.get("paid", False) for split in all_splits)

    if all_paid:
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"status": "completed"}}
        )

        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        for item in order["items"]:
            await db.stock.update_one(
                {"product_id": item["product_id"], "outlet_id": order["outlet_id"]},
                {"$inc": {"quantity": -item["quantity"]}}
            )

        if order.get("table_id"):
            await db.tables.update_one(
                {"id": order["table_id"]},
                {"$set": {"status": "available", "current_order_id": None}}
            )

        return {"message": "Split paid. Order completed!"}

    return {"message": "Split paid successfully"}


@router.get("/orders/{order_id}/splits")
async def get_order_splits(order_id: str, current_user: User = Depends(get_current_user)):
    splits = await db.split_bills.find({"original_order_id": order_id}, {"_id": 0}).to_list(100)
    return splits
