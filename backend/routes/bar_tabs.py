from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from database import db
from models import User, BarTab, BarTabCreate
from auth import get_current_user, has_perm

router = APIRouter(prefix="/api")


@router.get("/bar-tabs")
async def get_bar_tabs(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    tabs = await db.bar_tabs.find(query, {"_id": 0}).to_list(1000)

    # Denormalize the linked order's KDS progress onto each tab (response
    # only — never persisted) so the floor view / TablePOS can show a
    # "food ready" indicator for bar tabs the same way tables already do.
    order_ids = list({t.get("current_order_id") for t in tabs if t.get("current_order_id")})
    orders_by_id = {}
    if order_ids:
        async for o in db.orders.find(
            {"id": {"$in": order_ids}}, {"_id": 0, "id": 1, "status": 1, "kitchen_status": 1}
        ):
            orders_by_id[o["id"]] = o
    for tab in tabs:
        order = orders_by_id.get(tab.get("current_order_id"))
        tab["kitchen_status"] = order.get("kitchen_status") if order and order.get("status") == "sent_to_kitchen" else None

    return tabs


@router.post("/bar-tabs", response_model=BarTab)
async def create_bar_tab(tab_data: BarTabCreate, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_bar_tabs"):
        raise HTTPException(status_code=403, detail="Not authorized")

    tab = BarTab(**tab_data.model_dump())
    doc = tab.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.bar_tabs.insert_one(doc)
    return tab


@router.put("/bar-tabs/{tab_id}")
async def update_bar_tab(tab_id: str, tab_data: dict, current_user: User = Depends(get_current_user)):
    result = await db.bar_tabs.update_one({"id": tab_id}, {"$set": tab_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bar tab not found")
    updated = await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})
    return updated


@router.post("/bar-tabs/{tab_id}/claim")
async def claim_bar_tab(tab_id: str, current_user: User = Depends(get_current_user)):
    tab = await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})
    if not tab:
        raise HTTPException(status_code=404, detail="Bar tab not found")
    if tab["status"] == "occupied" and tab.get("staff_id") != current_user.id:
        raise HTTPException(status_code=400, detail="Bar tab is already occupied")
    await db.bar_tabs.update_one(
        {"id": tab_id},
        {"$set": {"status": "occupied", "staff_id": current_user.id, "staff_name": current_user.name}}
    )
    return await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})


@router.post("/bar-tabs/{tab_id}/release")
async def release_bar_tab(tab_id: str, current_user: User = Depends(get_current_user)):
    tab = await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})
    if not tab:
        raise HTTPException(status_code=404, detail="Bar tab not found")
    # Same split as release_table: an order the kitchen never saw is safe
    # to hard-delete, but one that reached the kitchen (sent or already
    # has kitchen_status) is soft-voided instead so it stays visible on
    # the KDS board flagged as cancelled rather than silently vanishing.
    candidates = await db.orders.find(
        {"bar_tab_id": tab_id, "status": {"$in": ["held", "sent_to_kitchen", "pending"]}},
        {"_id": 0, "id": 1, "status": 1, "kitchen_status": 1},
    ).to_list(500)

    reached_kitchen_ids = [
        o["id"] for o in candidates
        if o.get("status") == "sent_to_kitchen" or o.get("kitchen_status") is not None
    ]
    never_sent_ids = [o["id"] for o in candidates if o["id"] not in reached_kitchen_ids]

    if reached_kitchen_ids:
        await db.orders.update_many(
            {"id": {"$in": reached_kitchen_ids}},
            {"$set": {"status": "voided", "void_reason": "bar_tab_released"}},
        )
    if never_sent_ids:
        await db.orders.delete_many({"id": {"$in": never_sent_ids}})
    await db.bar_tabs.update_one(
        {"id": tab_id},
        {"$set": {"status": "available", "staff_id": None, "staff_name": None, "current_order_id": None}}
    )
    return await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})


@router.post("/bar-tabs/{tab_id}/transfer")
async def transfer_bar_tab(tab_id: str, transfer_data: dict, current_user: User = Depends(get_current_user)):
    tab = await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})
    if not tab:
        raise HTTPException(status_code=404, detail="Bar tab not found")
    if tab.get("staff_id") != current_user.id and not has_perm(current_user, "manage_bar_tabs", "transfer_tables"):
        raise HTTPException(status_code=403, detail="Not authorized to transfer this bar tab")
    new_staff_id = transfer_data.get("new_staff_id")
    new_staff = await db.users.find_one({"id": new_staff_id}, {"_id": 0})
    if not new_staff:
        raise HTTPException(status_code=404, detail="Target staff member not found")
    await db.bar_tabs.update_one(
        {"id": tab_id},
        {"$set": {"staff_id": new_staff_id, "staff_name": new_staff["name"]}}
    )
    # Unlike the tab itself, an order's created_by is otherwise locked from
    # generic updates (see update_order's _LOCKED fields) — a transfer is a
    # deliberate exception. Without this, the linked order's owner never
    # actually changes, so the new staff member fails TablePOSPage's
    # ownership check (which trusts the ORDER's created_by, not the tab's
    # denormalized staff_id) even with perfectly fresh data.
    if tab.get("current_order_id"):
        await db.orders.update_one(
            {"id": tab["current_order_id"]},
            {"$set": {"created_by": new_staff_id, "created_by_name": new_staff["name"]}}
        )
    return await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})


@router.delete("/bar-tabs/{tab_id}")
async def delete_bar_tab(tab_id: str, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "delete_bar_tab", "manage_bar_tabs"):
        raise HTTPException(status_code=403, detail="Not authorized")

    existing = await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Bar tab not found")

    if existing.get("current_order_id"):
        raise HTTPException(status_code=400, detail="Cannot delete a bar tab with an open order")

    await db.bar_tabs.delete_one({"id": tab_id})
    return {"message": "Bar tab deleted"}
