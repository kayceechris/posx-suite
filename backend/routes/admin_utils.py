from fastapi import APIRouter, HTTPException, Depends
from typing import List
from pydantic import BaseModel

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")

# Simple collections — fully wiped on clear
SIMPLE_CLEARABLE = {
    "tables":       "tables",
    "floors":       "floors",
    "orders":       "orders",
    "bar_tabs":     "bar_tabs",
    "customers":    "customers",
    "reservations": "reservations",
    "stores":       "stores",      # non-main stores only (see special handling)
    "inventory":    "stock",       # stock records (across all stores/outlets)
    "products":     "products",
    "outlets":      "outlets",
    "users":        "users",       # everyone except role=admin (see special handling)
    # Optional auxiliary cleanups that travel with their parents
    "ingredients":     "ingredients",
    "recipes":         "recipes",
    "stock_movements": "stock_movements",
    "purchases":       "purchases",
    "requisitions":    "requisitions",
}

# Keys that need custom handling instead of a blanket delete_many({})
SPECIAL_KEYS = {"stores", "users"}


class ClearDataRequest(BaseModel):
    collections: List[str]


@router.post("/admin/clear-data")
async def clear_data(body: ClearDataRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    invalid = [c for c in body.collections if c not in SIMPLE_CLEARABLE]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown collections: {invalid}")

    result: dict = {}
    for col in body.collections:
        if col == "stores":
            # Keep the Main Store (is_main=True). Wipe the rest.
            r = await db.stores.delete_many({"is_main": {"$ne": True}})
            result[col] = r.deleted_count
        elif col == "users":
            # Always preserve admin accounts.
            r = await db.users.delete_many({"role": {"$ne": "admin"}})
            result[col] = r.deleted_count
        else:
            r = await db[SIMPLE_CLEARABLE[col]].delete_many({})
            result[col] = r.deleted_count

    return {"cleared": result}
