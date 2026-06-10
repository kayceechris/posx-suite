import re
import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models import Store, StoreCreate, User
from auth import get_current_user, has_perm

router = APIRouter(prefix="/api")

_DEFAULT_STORES = [
    {"id": "main",    "name": "Main Store",    "is_main": True,  "color": "blue",   },
    {"id": "kitchen", "name": "Kitchen Store", "is_main": False, "color": "orange", },
    {"id": "bar",     "name": "Bar Store",     "is_main": False, "color": "purple", },
]


def _make_store_key(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}-{str(_uuid.uuid4())[:8]}"


@router.post("/init-stores")
async def init_stores():
    """Create the three default stores if they don't already exist. Safe on any existing deployment."""
    now = datetime.now(timezone.utc).isoformat()
    created = 0
    for s in _DEFAULT_STORES:
        if not await db.stores.find_one({"id": s["id"]}):
            await db.stores.insert_one({**s, "created_at": now})
            created += 1
    return {"created": created, "message": f"{created} store(s) initialized."}


@router.get("/stores")
async def get_stores(current_user: User = Depends(get_current_user)):
    stores = await db.stores.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return stores


@router.post("/stores")
async def create_store(data: StoreCreate, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "create_store"):
        raise HTTPException(403, "Not authorized")
    store = Store(
        id=_make_store_key(data.name),
        name=data.name,
        is_main=False,
        color=data.color or "indigo",
    )
    doc = store.model_dump()
    doc.pop("outlet_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    await db.stores.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/stores/{store_id}")
async def update_store(store_id: str, data: dict, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "edit_store"):
        raise HTTPException(403, "Not authorized")
    existing = await db.stores.find_one({"id": store_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Store not found")
    if existing.get("is_main"):
        raise HTTPException(400, "Cannot modify the Main Store")
    update = {}
    if "name" in data:
        update["name"] = str(data["name"]).strip()
    if "color" in data:
        update["color"] = str(data["color"])
    if update:
        await db.stores.update_one({"id": store_id}, {"$set": update})
    return {**existing, **update}


@router.delete("/stores/{store_id}")
async def delete_store(store_id: str, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "delete_store"):
        raise HTTPException(403, "Not authorized")
    existing = await db.stores.find_one({"id": store_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Store not found")
    if existing.get("is_main"):
        raise HTTPException(400, "Cannot delete the Main Store")
    stock_count = await db.stock.count_documents({"store": store_id})
    if stock_count > 0:
        raise HTTPException(
            400,
            f"Store has {stock_count} stock item(s) across all outlets. Transfer or clear stock before deleting."
        )
    await db.stores.delete_one({"id": store_id})
    return {"ok": True}
