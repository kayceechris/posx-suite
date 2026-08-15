import re
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import Ingredient, IngredientCreate, User
from auth import get_current_user, has_perm

router = APIRouter(prefix="/api")


@router.get("/ingredients")
async def get_ingredients(current_user: User = Depends(get_current_user)):
    items = await db.ingredients.find(
        {}, {"_id": 0}
    ).sort("name", 1).to_list(5000)
    return items


@router.post("/ingredients")
async def create_ingredient(data: IngredientCreate, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_products", "manage_inventory"):
        raise HTTPException(403, "Not authorized")
    # Prevent duplicate names
    existing = await db.ingredients.find_one(
        {"name": re.compile(f"^{re.escape(data.name.strip())}$", re.IGNORECASE)},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(400, f"Ingredient '{data.name}' already exists")
    item = Ingredient(**data.model_dump())
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.ingredients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/ingredients/{ingredient_id}")
async def update_ingredient(ingredient_id: str, data: dict, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_products", "manage_inventory"):
        raise HTTPException(403, "Not authorized")
    existing = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Ingredient not found")
    allowed = {"name", "unit", "category", "cost_price", "active", "home_store", "sku"}
    update = {k: v for k, v in data.items() if k in allowed}
    if update:
        await db.ingredients.update_one({"id": ingredient_id}, {"$set": update})
    updated = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    return updated


@router.delete("/ingredients/{ingredient_id}")
async def delete_ingredient(ingredient_id: str, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_products", "manage_inventory"):
        raise HTTPException(403, "Not authorized")
    # Check if used in any recipe
    used = await db.recipes.find_one(
        {"ingredients.ingredient_id": ingredient_id}, {"_id": 0, "product_name": 1}
    )
    if used:
        raise HTTPException(400, f"Ingredient is used in recipe for '{used.get('product_name', 'a product')}' — remove it from the recipe first")
    # Check if has stock
    stock_count = await db.stock.count_documents({"ingredient_id": ingredient_id})
    if stock_count > 0:
        raise HTTPException(400, "Ingredient has stock records — clear the stock first")
    result = await db.ingredients.delete_one({"id": ingredient_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Ingredient not found")
    return {"ok": True}
