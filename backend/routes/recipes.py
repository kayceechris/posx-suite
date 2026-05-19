import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from database import db

router = APIRouter(prefix="/api")


class RecipeIngredient(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    quantity: float = 0
    unit: str = ""
    product_id: Optional[str] = None  # optional link to inventory product


class RecipeUpsert(BaseModel):
    ingredients: List[RecipeIngredient] = []
    notes: str = ""
    prep_time: int = 0   # minutes
    servings: int = 1


@router.get("/recipes")
async def list_recipes(current_user=Depends(get_current_user)):
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(2000)
    return recipes


@router.get("/recipes/{product_id}")
async def get_recipe(product_id: str, current_user=Depends(get_current_user)):
    doc = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No recipe for this product")
    return doc


@router.put("/recipes/{product_id}")
async def upsert_recipe(product_id: str, data: RecipeUpsert, current_user=Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    product = await db.products.find_one({"id": product_id}, {"_id": 0, "name": 1})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    now = datetime.now(timezone.utc).isoformat()
    ingredients = [i.model_dump() for i in data.ingredients]

    existing = await db.recipes.find_one({"product_id": product_id})
    if existing:
        await db.recipes.update_one(
            {"product_id": product_id},
            {"$set": {
                "ingredients": ingredients,
                "notes": data.notes,
                "prep_time": data.prep_time,
                "servings": data.servings,
                "updated_at": now,
            }}
        )
    else:
        await db.recipes.insert_one({
            "id": str(uuid.uuid4()),
            "product_id": product_id,
            "product_name": product["name"],
            "ingredients": ingredients,
            "notes": data.notes,
            "prep_time": data.prep_time,
            "servings": data.servings,
            "created_at": now,
            "updated_at": now,
        })

    doc = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    return doc


@router.delete("/recipes/{product_id}")
async def delete_recipe(product_id: str, current_user=Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.recipes.delete_one({"product_id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"ok": True}
