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


def _require_admin(current_user: User):
    if current_user.role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")


@router.get("/user-types")
async def get_user_types(current_user: User = Depends(get_current_user)):
    # Allow admin or manager to read user types (managers may assign roles when creating users)
    if current_user.role.lower() not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Not authorized")
    types = await db.user_types.find({}, {"_id": 0}).to_list(1000)
    return types


@router.post("/user-types")
async def create_user_type(data: UserTypeCreate, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    ut = UserType(**data.model_dump())
    doc = ut.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.user_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/user-types/{type_id}")
async def update_user_type(type_id: str, data: UserTypeCreate, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    # Need the OLD name to find users who currently sit on this type —
    # users link to a type by lowercased name in their `role` field, not
    # by id, so we look up the previous name before mutating the doc.
    existing = await db.user_types.find_one({"id": type_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User type not found")

    await db.user_types.update_one(
        {"id": type_id},
        {"$set": {"name": data.name, "permissions": data.permissions}}
    )

    # Propagate the new permissions (and name, if renamed) to every user
    # currently assigned to this type. Without this step, edits to a
    # type silently do nothing for staff already on it — the user has
    # to re-pick the type on each user's edit form. That was the
    # reported bug: tightening Kitchen Manager / Bar Manager perms
    # didn't actually take effect for existing staff.
    old_role = (existing.get("name") or "").strip().lower()
    new_role = (data.name or "").strip().lower()
    users_updated = 0
    if old_role:
        set_fields: dict = {"permissions": data.permissions}
        if new_role and new_role != old_role:
            set_fields["role"] = new_role
        result = await db.users.update_many(
            {"role": old_role},
            {"$set": set_fields},
        )
        users_updated = result.modified_count

    updated = await db.user_types.find_one({"id": type_id}, {"_id": 0})
    updated["users_updated"] = users_updated
    return updated


@router.delete("/user-types/{type_id}")
async def delete_user_type(type_id: str, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    # Refuse deletion when staff are still assigned — otherwise they end
    # up with a dangling `role` that doesn't match any type doc, and
    # their permissions silently stop validating against the catalog.
    existing = await db.user_types.find_one({"id": type_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User type not found")
    role_name = (existing.get("name") or "").strip().lower()
    if role_name:
        in_use = await db.users.count_documents({"role": role_name})
        if in_use:
            raise HTTPException(
                status_code=400,
                detail=f"{in_use} user(s) are still assigned to '{existing.get('name')}'. Reassign them to a different type first.",
            )
    result = await db.user_types.delete_one({"id": type_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User type not found")
    return {"message": "User type deleted"}
