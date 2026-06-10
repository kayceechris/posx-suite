from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, has_perm
from database import db
from lib.email_service import send_daily_digest_email
from models import User

router = APIRouter(prefix="/api")


@router.get("/notifications/summary")
async def get_notifications_summary(current_user: User = Depends(get_current_user)):
    """In-app badge counts — polled by the frontend every 30 s."""
    pending_reqs = await db.requisitions.count_documents({"status": "pending"})

    low_stock = await db.stock.count_documents({
        "$expr": {"$and": [
            {"$gt": ["$min_quantity", 0]},
            {"$lte": ["$quantity", "$min_quantity"]},
        ]}
    })

    today = datetime.now(timezone.utc).date()
    day_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    day_end = datetime.combine(today + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    todays_orders = await db.orders.count_documents({
        "status": "completed",
        "created_at": {"$gte": day_start, "$lt": day_end},
    })

    # Pending purchase orders (if the purchases collection exists)
    pending_purchases = await db.purchase_orders.count_documents({"status": "pending"})

    # Upcoming reservations — confirmed bookings starting within the next 2 hours
    now_local = datetime.now()
    cutoff_local = now_local + timedelta(hours=2)
    today_str = now_local.date().isoformat()
    upcoming_reservations_list = await db.reservations.find(
        {"status": "confirmed", "date": {"$gte": today_str}},
        {"_id": 0, "date": 1, "time": 1, "duration": 1}
    ).to_list(500)
    upcoming_reservations = 0
    for res in upcoming_reservations_list:
        try:
            res_dt = datetime.fromisoformat(f"{res['date']}T{res['time']}:00")
            res_end = res_dt + timedelta(minutes=res.get("duration") or 90)
            if res_dt <= cutoff_local and res_end > now_local:
                upcoming_reservations += 1
        except Exception:
            pass

    return {
        "pending_requisitions": pending_reqs,
        "low_stock": low_stock,
        "todays_orders": todays_orders,
        "pending_purchases": pending_purchases,
        "upcoming_reservations": upcoming_reservations,
    }


@router.post("/notifications/daily-digest")
async def trigger_daily_digest(current_user: User = Depends(get_current_user)):
    """Send the daily digest email. Call from a Render cron job or manually."""
    if not has_perm(current_user, "manage_settings", "view_dashboard"):
        raise HTTPException(status_code=403, detail="Not authorized")
    await send_daily_digest_email(db)
    return {"message": "Daily digest email queued"}
