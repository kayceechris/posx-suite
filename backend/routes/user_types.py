from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")


class UserType(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    permissions: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserTypeCreate(BaseModel):
    name: str
    permissions: List[str] = []


@router.get("/user-types")
async def get_user_types(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    types = await db.user_types.find({}, {"_id": 0}).to_list(1000)
    return types


@router.post("/user-types")
async def create_user_type(data: UserTypeCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    ut = UserType(**data.model_dump())
    doc = ut.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.user_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/user-types/{type_id}")
async def update_user_type(type_id: str, data: UserTypeCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.user_types.update_one(
        {"id": type_id},
        {"$set": {"name": data.name, "permissions": data.permissions}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User type not found")
    updated = await db.user_types.find_one({"id": type_id}, {"_id": 0})
    return updated


@router.delete("/user-types/{type_id}")
async def delete_user_type(type_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.user_types.delete_one({"id": type_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User type not found")
    return {"message": "User type deleted"}
