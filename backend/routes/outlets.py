from fastapi import APIRouter, HTTPException, Depends
from typing import List

from database import db
from models import User, Outlet, OutletCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/outlets", response_model=List[Outlet])
async def get_outlets(current_user: User = Depends(get_current_user)):
    outlets = await db.outlets.find({}, {"_id": 0}).to_list(1000)
    return [Outlet(**o) for o in outlets]


@router.post("/outlets", response_model=Outlet)
async def create_outlet(outlet_data: OutletCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    outlet = Outlet(**outlet_data.model_dump())
    doc = outlet.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.outlets.insert_one(doc)
    return outlet


@router.put("/outlets/{outlet_id}", response_model=Outlet)
async def update_outlet(outlet_id: str, outlet_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = {k: v for k, v in outlet_data.items() if k != "id" and k != "created_at"}
    result = await db.outlets.update_one({"id": outlet_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Outlet not found")

    updated = await db.outlets.find_one({"id": outlet_id}, {"_id": 0})
    return Outlet(**updated)


@router.delete("/outlets/{outlet_id}")
async def delete_outlet(outlet_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    outlet = await db.outlets.find_one({"id": outlet_id}, {"_id": 0})
    if not outlet:
        raise HTTPException(status_code=404, detail="Outlet not found")

    # Block deletion if in use
    refs = await db.products.count_documents({"outlet_id": outlet_id})
    if refs:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {refs} product(s) reference this {outlet.get('type', 'outlet')}.")
    refs = await db.terminals.count_documents({"outlet_id": outlet_id})
    if refs:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {refs} terminal(s) reference this {outlet.get('type', 'outlet')}.")
    refs = await db.orders.count_documents({"outlet_id": outlet_id})
    if refs:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {refs} order(s) reference this {outlet.get('type', 'outlet')}. Archive them first.")

    await db.outlets.delete_one({"id": outlet_id})
    return {"message": f"{outlet.get('type', 'outlet').capitalize()} deleted"}
