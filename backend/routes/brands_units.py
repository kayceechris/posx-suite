from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")


class Brand(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BrandCreate(BaseModel):
    name: str
    description: Optional[str] = None


class Unit(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    abbreviation: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UnitCreate(BaseModel):
    name: str
    abbreviation: Optional[str] = None


# ==================== BRANDS ====================

@router.get("/brands")
async def get_brands(current_user: User = Depends(get_current_user)):
    brands = await db.brands.find({}, {"_id": 0}).to_list(1000)
    return brands


@router.post("/brands")
async def create_brand(data: BrandCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    brand = Brand(**data.model_dump())
    doc = brand.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.brands.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/brands/{brand_id}")
async def update_brand(brand_id: str, data: BrandCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = data.model_dump(exclude_none=True)
    result = await db.brands.update_one({"id": brand_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Brand not found")
    updated = await db.brands.find_one({"id": brand_id}, {"_id": 0})
    return updated


@router.delete("/brands/{brand_id}")
async def delete_brand(brand_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.brands.delete_one({"id": brand_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"message": "Brand deleted"}


# ==================== UNITS ====================

@router.get("/units")
async def get_units(current_user: User = Depends(get_current_user)):
    units = await db.units.find({}, {"_id": 0}).to_list(1000)
    return units


@router.post("/units")
async def create_unit(data: UnitCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    unit = Unit(**data.model_dump())
    doc = unit.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.units.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/units/{unit_id}")
async def update_unit(unit_id: str, data: UnitCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = data.model_dump(exclude_none=True)
    result = await db.units.update_one({"id": unit_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Unit not found")
    updated = await db.units.find_one({"id": unit_id}, {"_id": 0})
    return updated


@router.delete("/units/{unit_id}")
async def delete_unit(unit_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.units.delete_one({"id": unit_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Unit not found")
    return {"message": "Unit deleted"}
