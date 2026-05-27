from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from database import db
from models import User, Floor, FloorCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/floors")
async def get_floors(
    outlet_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    floors = await db.floors.find(query, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return floors


@router.post("/floors", response_model=Floor)
async def create_floor(floor_data: FloorCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    floor = Floor(**floor_data.model_dump())
    doc = floor.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.floors.insert_one(doc)
    return floor


@router.put("/floors/{floor_id}")
async def update_floor(floor_id: str, floor_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.floors.update_one({"id": floor_id}, {"$set": floor_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Floor not found")
    return await db.floors.find_one({"id": floor_id}, {"_id": 0})


@router.delete("/floors/{floor_id}")
async def delete_floor(floor_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    table_count = await db.tables.count_documents({"floor_id": floor_id})
    if table_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete floor: {table_count} table(s) still assigned. Move or delete them first.",
        )
    result = await db.floors.delete_one({"id": floor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Floor not found")
    return {"message": "Floor deleted"}
