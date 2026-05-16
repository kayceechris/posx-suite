from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from database import db
from models import User, BarTab, BarTabCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/bar-tabs")
async def get_bar_tabs(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    tabs = await db.bar_tabs.find(query, {"_id": 0}).to_list(1000)
    return tabs


@router.post("/bar-tabs", response_model=BarTab)
async def create_bar_tab(tab_data: BarTabCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
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
    if tab.get("staff_id") != current_user.id and current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized to transfer this bar tab")
    new_staff_id = transfer_data.get("new_staff_id")
    new_staff = await db.users.find_one({"id": new_staff_id}, {"_id": 0})
    if not new_staff:
        raise HTTPException(status_code=404, detail="Target staff member not found")
    await db.bar_tabs.update_one(
        {"id": tab_id},
        {"$set": {"staff_id": new_staff_id, "staff_name": new_staff["name"]}}
    )
    return await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})


@router.delete("/bar-tabs/{tab_id}")
async def delete_bar_tab(tab_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    existing = await db.bar_tabs.find_one({"id": tab_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Bar tab not found")

    if existing.get("current_order_id"):
        raise HTTPException(status_code=400, detail="Cannot delete a bar tab with an open order")

    await db.bar_tabs.delete_one({"id": tab_id})
    return {"message": "Bar tab deleted"}
