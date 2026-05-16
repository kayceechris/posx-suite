from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict
import uuid

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")


class Tax(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    rate: float            # percentage, e.g. 7.5
    is_default: bool = False
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TaxCreate(BaseModel):
    name: str
    rate: float
    is_default: bool = False
    active: bool = True


@router.get("/taxes", response_model=List[Tax])
async def get_taxes(current_user: User = Depends(get_current_user)):
    rows = await db.taxes.find({}, {"_id": 0}).to_list(1000)
    return [Tax(**r) for r in rows]


@router.post("/taxes", response_model=Tax)
async def create_tax(payload: TaxCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    tax = Tax(**payload.model_dump())
    doc = tax.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if tax.is_default:
        await db.taxes.update_many({}, {"$set": {"is_default": False}})
    await db.taxes.insert_one(doc)
    return tax


@router.put("/taxes/{tax_id}", response_model=Tax)
async def update_tax(tax_id: str, payload: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = {k: v for k, v in payload.items() if k not in ("id", "created_at")}
    if update_data.get("is_default"):
        await db.taxes.update_many({}, {"$set": {"is_default": False}})
    result = await db.taxes.update_one({"id": tax_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tax not found")
    updated = await db.taxes.find_one({"id": tax_id}, {"_id": 0})
    return Tax(**updated)


@router.delete("/taxes/{tax_id}")
async def delete_tax(tax_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.taxes.delete_one({"id": tax_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tax not found")
    return {"message": "Tax deleted"}
