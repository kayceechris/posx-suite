from fastapi import APIRouter, HTTPException, Depends
from typing import List

from database import db
from models import User, UserCreate
from auth import get_current_user, hash_pincode, verify_pincode

router = APIRouter(prefix="/api")


@router.get("/users", response_model=List[User])
async def get_users(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return [User(**u) for u in users]


@router.post("/users", response_model=User)
async def create_user(user_data: UserCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    existing_users = await db.users.find({}, {"_id": 0}).to_list(1000)
    for u in existing_users:
        if verify_pincode(user_data.pincode, u["pincode"]):
            raise HTTPException(status_code=400, detail="Pincode already exists")

    user = User(**user_data.model_dump())
    user.pincode = hash_pincode(user_data.pincode)
    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.users.insert_one(doc)
    return user


@router.put("/users/{user_id}", response_model=User)
async def update_user(user_id: str, user_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = {k: v for k, v in user_data.items() if k != "id" and k != "created_at"}
    if "pincode" in update_data:
        update_data["pincode"] = hash_pincode(update_data["pincode"])

    await db.users.update_one({"id": user_id}, {"$set": update_data})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0})
    return User(**updated)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}


@router.get("/users/waiters")
async def get_waiters(current_user: User = Depends(get_current_user)):
    """Get all active waiters and cashiers for transfer selection"""
    waiters = await db.users.find(
        {"role": {"$in": ["waiter", "cashier"]}, "active": True},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "outlet_id": 1}
    ).to_list(1000)
    return waiters
