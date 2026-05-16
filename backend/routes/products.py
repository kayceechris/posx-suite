from fastapi import APIRouter, HTTPException, Depends
from typing import List

from database import db
from models import User, Product, ProductCreate, Category, CategoryCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


# ==================== CATEGORY ROUTES ====================

@router.get("/categories", response_model=List[Category])
async def get_categories(current_user: User = Depends(get_current_user)):
    categories = await db.categories.find({}, {"_id": 0}).to_list(1000)
    return [Category(**c) for c in categories]


@router.post("/categories", response_model=Category)
async def create_category(category_data: CategoryCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    category = Category(**category_data.model_dump())
    doc = category.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.categories.insert_one(doc)
    return category


@router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, category_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = {k: v for k, v in category_data.items() if k not in ("id", "created_at")}
    result = await db.categories.update_one({"id": category_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return Category(**updated)


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted successfully"}


# ==================== PRODUCT ROUTES ====================

@router.get("/products", response_model=List[Product])
async def get_products(current_user: User = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    return [Product(**p) for p in products]


@router.post("/products", response_model=Product)
async def create_product(product_data: ProductCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    product = Product(**product_data.model_dump())
    doc = product.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.products.insert_one(doc)
    return product


@router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = {k: v for k, v in product_data.items() if k != "id" and k != "created_at"}
    result = await db.products.update_one({"id": product_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    return Product(**updated)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted successfully"}


@router.post("/products/bulk-terminal-price")
async def bulk_set_terminal_price(payload: dict, current_user: User = Depends(get_current_user)):
    """
    Apply a terminal-specific price to many products at once.

    payload = {
        "product_ids": [str, ...],
        "terminal_id": str (required),
        "outlet_id": Optional[str],
        "mode": "fixed" | "percent_markup_from_base" | "percent_markup_from_cost" | "delta",
        "value": float,                         # interpretation depends on mode
        "round_to": Optional[float] = None      # e.g. 0.5, 1, 0.99
    }
    Returns {"updated": int, "skipped": int}.
    """
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    product_ids = payload.get("product_ids") or []
    terminal_id = (payload.get("terminal_id") or "").strip()
    outlet_id = (payload.get("outlet_id") or "").strip() or None
    mode = payload.get("mode") or "fixed"
    try:
        value = float(payload.get("value") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid value")
    round_to = payload.get("round_to")

    if not product_ids:
        raise HTTPException(status_code=400, detail="product_ids is required")
    if not terminal_id:
        raise HTTPException(status_code=400, detail="terminal_id is required")

    def round_price(p):
        if round_to and round_to > 0:
            return round(p / round_to) * round_to
        return round(p, 2)

    updated = 0
    skipped = 0
    for pid in product_ids:
        product = await db.products.find_one({"id": pid}, {"_id": 0})
        if not product:
            skipped += 1
            continue
        base_price = float(product.get("price") or 0)
        cost_price = float(product.get("cost_price") or 0)

        if mode == "fixed":
            new_price = value
        elif mode == "percent_markup_from_base":
            new_price = base_price * (1 + value / 100.0)
        elif mode == "percent_markup_from_cost":
            new_price = cost_price * (1 + value / 100.0) if cost_price > 0 else base_price
        elif mode == "delta":
            new_price = base_price + value
        else:
            raise HTTPException(status_code=400, detail=f"Unknown mode: {mode}")

        new_price = round_price(new_price)

        existing = list(product.get("terminal_prices") or [])
        # Replace if same outlet+terminal exists, else append
        idx = next((i for i, tp in enumerate(existing)
                    if (tp.get("terminal_id") == terminal_id) and ((tp.get("outlet_id") or None) == outlet_id)), None)
        entry = {
            "outlet_id": outlet_id,
            "terminal_id": terminal_id,
            "price": float(new_price),
            "cost_price": cost_price,
        }
        if idx is None:
            existing.append(entry)
        else:
            existing[idx] = entry

        await db.products.update_one({"id": pid}, {"$set": {"terminal_prices": existing}})
        updated += 1

    return {"updated": updated, "skipped": skipped}
