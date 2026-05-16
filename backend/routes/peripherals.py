from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User, Peripheral, PeripheralCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/peripherals")
async def get_peripherals(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    peripherals = await db.peripherals.find({}, {"_id": 0}).to_list(1000)
    return peripherals


@router.post("/peripherals")
async def create_peripheral(peripheral_data: PeripheralCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    peripheral = Peripheral(**peripheral_data.model_dump())
    doc = peripheral.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.peripherals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/peripherals/{peripheral_id}")
async def delete_peripheral(peripheral_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.peripherals.delete_one({"id": peripheral_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Peripheral not found")
    return {"message": "Peripheral deleted"}
