from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import date as date_type

from database import db
from models import User, Reservation, ReservationCreate
from auth import get_current_user, has_perm
from lib.reservation_activation import activate_reservation_order

router = APIRouter(prefix="/api")

# Denormalized order-linking fields the reservation modal writes right after
# creating/updating the pre-built order. These are system bookkeeping, not a
# "reservation edit" a staff member without edit_reservation should be
# blocked from — otherwise a user with only create_reservation would create
# the reservation + order successfully and then get a 403 trying to link them.
_ORDER_LINK_FIELDS = {"order_id", "order_total", "order_item_count"}


@router.get("/reservations/upcoming")
async def get_upcoming_reservations(
    days_ahead: int = 7,
    current_user: User = Depends(get_current_user)
):
    """Confirmed/seated reservations from today onwards — used by the table grid."""
    if not has_perm(current_user, "view_reservations"):
        raise HTTPException(status_code=403, detail="You don't have permission to view reservations")
    today = date_type.today().isoformat()
    reservations = await db.reservations.find(
        {"date": {"$gte": today}, "status": {"$in": ["confirmed", "seated"]}},
        {"_id": 0}
    ).sort([("date", 1), ("time", 1)]).to_list(500)
    return reservations


@router.get("/reservations")
async def get_reservations(
    date: Optional[str] = None,
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    table_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if not has_perm(current_user, "view_reservations"):
        raise HTTPException(status_code=403, detail="You don't have permission to view reservations")
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
    if not has_perm(current_user, "create_reservation"):
        raise HTTPException(status_code=403, detail="You don't have permission to create reservations")
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
    existing = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found")

    protected = {"id", "created_at", "created_by"}
    update_fields = {k: v for k, v in data.items() if k not in protected}
    new_status = update_fields.get("status")

    # Cancelling/marking a no-show is gated by a narrower permission than a
    # general edit — matches the create/edit/cancel/delete split already
    # defined in the Reservations permission module. Pure order-linking
    # writes (see _ORDER_LINK_FIELDS) skip this entirely.
    is_order_link_only = bool(update_fields) and set(update_fields.keys()) <= _ORDER_LINK_FIELDS
    if is_order_link_only:
        pass
    elif new_status in ("cancelled", "no_show"):
        if not has_perm(current_user, "cancel_reservation"):
            raise HTTPException(status_code=403, detail="You don't have permission to cancel reservations")
    elif not has_perm(current_user, "edit_reservation"):
        raise HTTPException(status_code=403, detail="You don't have permission to edit reservations")

    # Seating a reservation with no waiter yet assigns the acting user —
    # mirrors claim_table's "acting user becomes waiter" convention.
    if new_status == "seated" and not existing.get("waiter_id") and not update_fields.get("waiter_id"):
        update_fields["waiter_id"] = current_user.id
        update_fields["waiter_name"] = current_user.name

    await db.reservations.update_one({"id": reservation_id}, {"$set": update_fields})
    updated = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})

    # Manually marking "seated" also activates any pre-built order for this
    # reservation right away, instead of waiting for its scheduled time —
    # the same activation path _sync_reservation_locks() uses automatically.
    if new_status == "seated":
        await activate_reservation_order(updated, updated.get("waiter_id"), updated.get("waiter_name"))
        updated = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})

    # A cancelled/no-show reservation shouldn't leave a dangling draft order.
    if new_status in ("cancelled", "no_show"):
        order_id = existing.get("order_id")
        if order_id:
            order = await db.orders.find_one({"id": order_id}, {"_id": 0, "status": 1})
            if order and order.get("status") == "reservation_hold":
                await db.orders.update_one(
                    {"id": order_id},
                    {"$set": {"status": "voided", "void_reason": "reservation_cancelled"}},
                )

    return updated


@router.delete("/reservations/{reservation_id}")
async def delete_reservation(
    reservation_id: str,
    current_user: User = Depends(get_current_user)
):
    if not has_perm(current_user, "delete_reservation"):
        raise HTTPException(status_code=403, detail="You don't have permission to delete reservations")
    existing = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reservation not found")

    order_id = existing.get("order_id")
    if order_id:
        order = await db.orders.find_one({"id": order_id}, {"_id": 0, "status": 1})
        if order and order.get("status") == "reservation_hold":
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {"status": "voided", "void_reason": "reservation_cancelled"}},
            )

    await db.reservations.delete_one({"id": reservation_id})
    return {"ok": True}
