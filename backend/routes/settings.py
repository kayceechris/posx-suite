from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User, BusinessSettings, BusinessSettingsCreate, RegisterAdmin
from auth import get_current_user, hash_pincode, verify_pincode, create_token

router = APIRouter(prefix="/api")


@router.get("/settings")
async def get_settings():
    settings = await db.settings.find_one({"id": "business_settings"}, {"_id": 0})
    if not settings:
        return {"setup_completed": False}
    return settings


@router.post("/settings")
async def create_settings(settings_data: BusinessSettingsCreate):
    existing = await db.settings.find_one({"id": "business_settings"})
    if existing:
        raise HTTPException(status_code=400, detail="Settings already exist")

    settings = BusinessSettings(**settings_data.model_dump(), setup_completed=True)
    doc = settings.model_dump()
    await db.settings.insert_one(doc)
    return settings


@router.put("/settings")
async def update_settings(settings_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.settings.update_one(
        {"id": "business_settings"},
        {"$set": settings_data}
    )
    updated = await db.settings.find_one({"id": "business_settings"}, {"_id": 0})
    return updated


# ==================== REGISTRATION (FIRST-TIME SETUP) ====================

@router.post("/register")
async def register_admin(data: RegisterAdmin):
    """First-time setup: create admin user + business settings"""
    existing_settings = await db.settings.find_one({"id": "business_settings"})
    if existing_settings and existing_settings.get("setup_completed"):
        raise HTTPException(status_code=400, detail="Business already registered")

    existing_users = await db.users.find({}, {"_id": 0}).to_list(1000)
    for u in existing_users:
        if verify_pincode(data.pincode, u["pincode"]):
            raise HTTPException(status_code=400, detail="Pincode already in use")

    from models import User as UserModel
    admin = UserModel(name=data.name, pincode=hash_pincode(data.pincode), role="admin")
    admin_doc = admin.model_dump()
    admin_doc["created_at"] = admin_doc["created_at"].isoformat()
    await db.users.insert_one(admin_doc)

    settings = BusinessSettings(
        business_type=data.business_type,
        business_name=data.business_name,
        setup_completed=True
    )
    await db.settings.delete_many({"id": "business_settings"})
    await db.settings.insert_one(settings.model_dump())

    token = create_token(admin.id, admin.role)
    return {
        "token": token,
        "user": {"id": admin.id, "name": admin.name, "role": admin.role},
        "message": "Admin registered successfully"
    }
