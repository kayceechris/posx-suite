from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import date as date_type

from database import db
from models import User, Reservation, ReservationCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/reservations/upcoming")
async def get_upcoming_reservations(
    current_user: User = Depends(get_current_user)
):
    """Today's confirmed/seated reservations — used by the table grid to show reserved status."""
    today = date_type.today().isoformat()
    reservations = await db.reservations.find(
        {"date": today, "status": {"$in": ["confirmed", "seated"]}},
        {"_id": 0}
    ).sort("time", 1).to_list(500)
    return reservations


@router.get("/reservations")
async def get_reservations(
    date: Optional[str] = None,
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    table_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    query: dict = {}
    if date:
        query["date"] = date
    if outlet_id:
        query["outlet_id"] = outlet_id
    if status:
        query["status"] = status
    if table_id:
        query["table_id"] = table_id

    reservations = await db.reservations.find(query, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)
    return reservations


@router.post("/reservations")
async def create_reservation(
    data: ReservationCreate,
    current_user: User = Depends(get_current_user)
):
    reservation = Reservation(
        **data.model_dump(),
        created_by=current_user.id,
        created_by_name=current_user.name,
    )
    doc = reservation.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.reservations.insert_one(doc)
    return reservation


@router.put("/reservations/{reservation_id}")
async def update_reservation(
    reservation_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    existing = await db.reservations.find_one({"id": reservation_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found")

    protected = {"id", "created_at", "created_by"}
    update_fields = {k: v for k, v in data.items() if k not in protected}
    await db.reservations.update_one({"id": reservation_id}, {"$set": update_fields})
    updated = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    return updated


@router.delete("/reservations/{reservation_id}")
async def delete_reservation(
    reservation_id: str,
    current_user: User = Depends(get_current_user)
):
    existing = await db.reservations.find_one({"id": reservation_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found")
    await db.reservations.delete_one({"id": reservation_id})
    return {"ok": True}
