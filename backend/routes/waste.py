import uuid
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone

from database import db
from models import User, WasteEntry, WasteEntryCreate
from auth import get_current_user, has_perm

router = APIRouter(prefix="/api")


@router.get("/waste")
async def get_waste_entries(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "record_waste", "view_inventory", "manage_inventory"):
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    entries = await db.waste_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return entries


@router.post("/waste")
async def create_waste_entry(data: WasteEntryCreate, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "record_waste", "view_inventory", "manage_inventory"):
        raise HTTPException(status_code=403, detail="Not authorized")

    entry = WasteEntry(**data.model_dump(), recorded_by=current_user.id)

    # Deduct from stock
    await db.stock.update_one(
        {"product_id": data.product_id, "outlet_id": data.outlet_id},
        {"$inc": {"quantity": -data.quantity}}
    )

    # Log as stock movement
    await db.stock_movements.insert_one({
        "id": str(uuid.uuid4()),
        "product_id": data.product_id,
        "from_outlet_id": data.outlet_id,
        "to_outlet_id": None,
        "quantity": data.quantity,
        "type": "waste",
        "notes": f"Waste ({data.reason}). {data.notes or ''}".strip().rstrip(".") + ".",
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    doc = entry.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.waste_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/waste/{entry_id}")
async def delete_waste_entry(entry_id: str, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "record_waste", "view_inventory", "manage_inventory"):
        raise HTTPException(status_code=403, detail="Not authorized")

    entry = await db.waste_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Waste entry not found")

    # Restore stock
    await db.stock.update_one(
        {"product_id": entry["product_id"], "outlet_id": entry["outlet_id"]},
        {"$inc": {"quantity": entry["quantity"]}}
    )

    await db.waste_entries.delete_one({"id": entry_id})
    return {"message": "Waste entry deleted and stock restored"}


@router.get("/waste/summary")
async def get_waste_summary(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "record_waste", "view_inventory", "manage_inventory"):
        raise HTTPException(status_code=403, detail="Not authorized")

    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id

    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$reason",
            "total_qty": {"$sum": "$quantity"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"total_qty": -1}},
    ]
    summary = await db.waste_entries.aggregate(pipeline).to_list(100)
    return [{"reason": s["_id"], "total_qty": s["total_qty"], "count": s["count"]} for s in summary]
