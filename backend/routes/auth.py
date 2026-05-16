import asyncio

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User, UserLogin, UserCreate
from auth import get_current_user, hash_pincode, verify_pincode, create_token

router = APIRouter(prefix="/api")


@router.post("/auth/login")
async def login(credentials: UserLogin):
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    loop = asyncio.get_event_loop()

    for user_doc in users:
        stored = user_doc.get("pincode", "")

        # Run verification in a thread — prevents blocking the event loop
        # (bcrypt is CPU-bound and would otherwise stall the entire server)
        matched = await loop.run_in_executor(
            None, verify_pincode, credentials.pincode, stored
        )

        if not matched:
            continue

        if not user_doc.get("active", True):
            raise HTTPException(status_code=403, detail="User is inactive")

        # Silently migrate legacy bcrypt hash to fast v2 on first successful login
        if not stored.startswith("v2:"):
            new_hash = hash_pincode(credentials.pincode)
            asyncio.create_task(
                db.users.update_one({"id": user_doc["id"]}, {"$set": {"pincode": new_hash}})
            )

        token = create_token(user_doc["id"], user_doc["role"])
        return {
            "token": token,
            "user": {
                "id": user_doc["id"],
                "name": user_doc["name"],
                "role": user_doc["role"],
                "outlet_id": user_doc.get("outlet_id"),
                "permissions": user_doc.get("permissions", []),
            }
        }

    # TEMPORARY DEBUG — remove after fix
    debug = [{"name": u.get("name"), "role": u.get("role"), "pin": u.get("pincode", "")[:25]} for u in users]
    raise HTTPException(status_code=401, detail=f"Invalid pincode. users={debug}")


@router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
