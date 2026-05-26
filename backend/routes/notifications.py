from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
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

    return {
        "pending_requisitions": pending_reqs,
        "low_stock": low_stock,
        "todays_orders": todays_orders,
        "pending_purchases": pending_purchases,
    }


@router.post("/notifications/daily-digest")
async def trigger_daily_digest(current_user: User = Depends(get_current_user)):
    """Send the daily digest email. Call from a Render cron job or manually."""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    await send_daily_digest_email(db)
    return {"message": "Daily digest email queued"}
