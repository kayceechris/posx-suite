from fastapi import APIRouter
from typing import Dict

from database import db
from models import DisplayUpdate

router = APIRouter(prefix="/api")

# In-memory store for display data (one per terminal)
display_data_store: Dict[str, dict] = {}


@router.post("/display/update")
async def update_display(data: DisplayUpdate):
    """POS pushes current cart state to customer display"""
    display_data_store[data.terminal_id] = data.model_dump()
    return {"ok": True}


@router.get("/display/current")
async def get_display(terminal_id: str = "default"):
    """Customer display polls for current data"""
    data = display_data_store.get(terminal_id)
    if not data:
        settings = await db.settings.find_one({"id": "business_settings"}, {"_id": 0})
        return {
            "terminal_id": terminal_id,
            "business_name": settings.get("business_name", "POSx Suite") if settings else "POSx Suite",
            "company_logo": settings.get("company_logo") if settings else None,
            "items": [],
            "subtotal": 0,
            "tax": 0,
            "total": 0,
            "status": "welcome",
            "message": "Welcome!"
        }
    return data


@router.post("/display/clear")
async def clear_display(terminal_id: str = "default"):
    """Clear the display after payment"""
    settings = await db.settings.find_one({"id": "business_settings"}, {"_id": 0})
    display_data_store[terminal_id] = {
        "terminal_id": terminal_id,
        "business_name": settings.get("business_name", "POSx Suite") if settings else "POSx Suite",
        "company_logo": settings.get("company_logo") if settings else None,
        "items": [],
        "subtotal": 0,
        "tax": 0,
        "total": 0,
        "status": "paid",
        "message": "Thank you!"
    }
    return {"ok": True}
