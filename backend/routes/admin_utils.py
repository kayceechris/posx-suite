from fastapi import APIRouter, HTTPException, Depends
from typing import List
from pydantic import BaseModel

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")

CLEARABLE = {
    "tables":       "tables",
    "floors":       "floors",
    "orders":       "orders",
    "bar_tabs":     "bar_tabs",
    "customers":    "customers",
    "reservations": "reservations",
}


class ClearDataRequest(BaseModel):
    collections: List[str]


@router.post("/admin/clear-data")
async def clear_data(body: ClearDataRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    invalid = [c for c in body.collections if c not in CLEARABLE]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown collections: {invalid}")

    result = {}
    for col in body.collections:
        r = await db[CLEARABLE[col]].delete_many({})
        result[col] = r.deleted_count

    return {"cleared": result}
