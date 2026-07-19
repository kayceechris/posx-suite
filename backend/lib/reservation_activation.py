from typing import Optional

from database import db

# Order statuses that mean a table is genuinely in active use.
_ACTIVE_ORDER_STATUSES = ("held", "sent_to_kitchen", "pending")


async def activate_reservation_order(reservation: dict, waiter_id: Optional[str], waiter_name: Optional[str]) -> bool:
    """Promote a reservation's pre-built draft order (status "reservation_hold")
    into a live held order and occupy its table.

    Returns False (no-op) when there's nothing to activate, it's already been
    activated, or the table is genuinely occupied by a DIFFERENT active order
    — this never steals a table out from under a walk-in.
    """
    order_id = reservation.get("order_id")
    if not order_id:
        return False

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("status") != "reservation_hold":
        return False

    table_id = order.get("table_id") or reservation.get("table_id")
    if not table_id:
        return False

    table = await db.tables.find_one({"id": table_id}, {"_id": 0, "current_order_id": 1})
    current_order_id = (table or {}).get("current_order_id")
    if current_order_id and current_order_id != order_id:
        other = await db.orders.find_one({"id": current_order_id}, {"_id": 0, "status": 1})
        if other and other.get("status") in _ACTIVE_ORDER_STATUSES:
            return False

    await db.orders.update_one({"id": order_id}, {"$set": {"status": "held"}})
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {
            "status": "occupied",
            "current_order_id": order_id,
            "waiter_id": waiter_id,
            "waiter_name": waiter_name,
        }},
    )
    return True
