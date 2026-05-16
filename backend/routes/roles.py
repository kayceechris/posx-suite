from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User, Role, RoleCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/roles")
async def get_roles(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    roles = await db.roles.find({}, {"_id": 0}).to_list(1000)
    return roles


@router.post("/roles", response_model=Role)
async def create_role(role_data: RoleCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    role = Role(**role_data.model_dump())
    doc = role.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.roles.insert_one(doc)
    return role


@router.put("/roles/{role_id}")
async def update_role(role_id: str, role_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.roles.update_one({"id": role_id}, {"$set": role_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Role not found")

    updated = await db.roles.find_one({"id": role_id}, {"_id": 0})
    return updated


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.roles.delete_one({"id": role_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"message": "Role deleted successfully"}


@router.get("/permissions")
async def get_available_permissions(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    permissions = {
        "users": ["create", "read", "update", "delete"],
        "outlets": ["create", "read", "update", "delete"],
        "products": ["create", "read", "update", "delete"],
        "categories": ["create", "read", "update", "delete"],
        "inventory": ["create", "read", "update", "delete", "transfer"],
        "customers": ["create", "read", "update", "delete"],
        "orders": ["create", "read", "update", "delete", "cancel"],
        "tables": ["create", "read", "update", "delete", "transfer", "claim", "release"],
        "reports": ["view", "export"],
        "settings": ["read", "update"],
        "printers": ["create", "read", "update", "delete", "test"],
        "currencies": ["create", "read", "update", "delete"],
        "payment_types": ["create", "read", "update", "delete"]
    }
    return permissions
