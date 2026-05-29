import csv
import io
import re
import uuid as _uuid

from fastapi import APIRouter, File, Form, HTTPException, Depends, UploadFile
from typing import Optional
from datetime import datetime, timezone

from database import db
from models import User, Stock, StockUpdate, StockTransfer, StockMovement, StockMovementCreate
from auth import get_current_user, has_perm

router = APIRouter(prefix="/api")


def _require_admin(user: User):
    if not has_perm(user, "update_stock", "view_inventory"):
        raise HTTPException(403, "Not authorized")


def _require_manager(user: User):
    if not has_perm(user, "update_stock"):
        raise HTTPException(403, "Not authorized")


# ─── Get stock ─────────────────────────────────────────────────────────────────

@router.get("/stock")
async def get_stock(
    outlet_id: Optional[str] = None,
    store: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    query: dict = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    if store:
        query["store"] = store
    stocks = await db.stock.find(query, {"_id": 0}).to_list(5000)

    # Enrich with ingredient name and unit
    ing_ids = list({s["ingredient_id"] for s in stocks if s.get("ingredient_id")})
    ings = await db.ingredients.find({"id": {"$in": ing_ids}}, {"_id": 0}).to_list(5000)
    ing_map = {i["id"]: i for i in ings}

    result = []
    for s in stocks:
        ing = ing_map.get(s.get("ingredient_id", ""), {})
        result.append({
            **s,
            "ingredient_name": ing.get("name", s.get("ingredient_id", "")),
            "unit": ing.get("unit", ""),
            "category": ing.get("category", ""),
            "cost_price": ing.get("cost_price", 0),
        })
    return result


# ─── Upsert stock ──────────────────────────────────────────────────────────────

@router.post("/stock")
async def update_stock(stock_data: StockUpdate, current_user: User = Depends(get_current_user)):
    _require_manager(current_user)

    # Validate ingredient exists
    ing = await db.ingredients.find_one({"id": stock_data.ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(404, f"Ingredient '{stock_data.ingredient_id}' not found")

    store = stock_data.store or "main"
    set_doc = {
        "ingredient_id": stock_data.ingredient_id,
        "outlet_id": stock_data.outlet_id,
        "store": store,
        "quantity": stock_data.quantity,
        "min_quantity": stock_data.min_quantity,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if stock_data.batch_number is not None:
        set_doc["batch_number"] = stock_data.batch_number
    if stock_data.expiry_date is not None:
        set_doc["expiry_date"] = stock_data.expiry_date

    existing = await db.stock.find_one(
        {"ingredient_id": stock_data.ingredient_id, "outlet_id": stock_data.outlet_id, "store": store},
        {"_id": 0, "id": 1},
    )
    if existing:
        await db.stock.update_one(
            {"ingredient_id": stock_data.ingredient_id, "outlet_id": stock_data.outlet_id, "store": store},
            {"$set": set_doc},
        )
    else:
        set_doc["id"] = str(_uuid.uuid4())
        await db.stock.insert_one(set_doc)

    return {"message": "Stock updated"}


# ─── CSV import ────────────────────────────────────────────────────────────────
# CSV format: name, quantity, min_quantity, unit, category, cost_price, batch_number, expiry_date
# "name" column is matched against ingredients by name (case-insensitive).
# If an ingredient doesn't exist it is AUTO-CREATED so imports never fail silently.

@router.post("/stock/import-csv")
async def import_stock_csv(
    outlet_id: str = Form(...),
    store: str = Form("main"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    _require_manager(current_user)
    try:
        contents = (await file.read()).decode("utf-8-sig")
    except Exception:
        raise HTTPException(400, "Could not read file — ensure it is a valid UTF-8 CSV.")

    reader = csv.DictReader(io.StringIO(contents))
    results: dict = {"imported": 0, "created": 0, "skipped": 0, "errors": []}

    for row in reader:
        name = (row.get("name") or row.get("product_name") or "").strip()
        if not name:
            continue

        try:
            qty = float(row.get("quantity") or 0)
            min_qty = float(row.get("min_quantity") or 10)
        except ValueError:
            results["errors"].append(f'Invalid quantity for "{name}"')
            results["skipped"] += 1
            continue

        # Find or create the ingredient
        ingredient = await db.ingredients.find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
            {"_id": 0},
        )
        if not ingredient:
            # Auto-create the ingredient
            new_ing = {
                "id": str(_uuid.uuid4()),
                "name": name,
                "unit": (row.get("unit") or "pcs").strip(),
                "category": (row.get("category") or "").strip() or None,
                "cost_price": float(row.get("cost_price") or 0),
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.ingredients.insert_one(new_ing)
            ingredient = new_ing
            results["created"] += 1

        set_doc: dict = {
            "ingredient_id": ingredient["id"],
            "outlet_id": outlet_id,
            "store": store,
            "quantity": qty,
            "min_quantity": min_qty,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        batch = (row.get("batch_number") or "").strip()
        expiry = (row.get("expiry_date") or "").strip()
        if batch:
            set_doc["batch_number"] = batch
        if expiry:
            set_doc["expiry_date"] = expiry

        existing = await db.stock.find_one(
            {"ingredient_id": ingredient["id"], "outlet_id": outlet_id, "store": store},
            {"_id": 0, "id": 1},
        )
        if existing:
            await db.stock.update_one(
                {"ingredient_id": ingredient["id"], "outlet_id": outlet_id, "store": store},
                {"$set": set_doc},
            )
        else:
            set_doc["id"] = str(_uuid.uuid4())
            await db.stock.insert_one(set_doc)
        results["imported"] += 1

    return results


# ─── Store transfer (Main → Kitchen / Main → Bar) ───────────────────────────────

@router.post("/stock/transfer")
async def transfer_stock(data: StockTransfer, current_user: User = Depends(get_current_user)):
    """Transfer an ingredient from one store to another within the same outlet."""
    _require_manager(current_user)

    ing = await db.ingredients.find_one({"id": data.ingredient_id}, {"_id": 0, "name": 1})
    if not ing:
        raise HTTPException(404, "Ingredient not found")

    # Deduct from source store
    source = await db.stock.find_one(
        {"ingredient_id": data.ingredient_id, "outlet_id": data.outlet_id, "store": data.from_store},
        {"_id": 0},
    )
    if not source:
        raise HTTPException(404, f"No stock of '{ing['name']}' in {data.from_store} store")
    if float(source.get("quantity", 0)) < data.quantity:
        raise HTTPException(400, f"Insufficient stock: only {source['quantity']} available in {data.from_store}")

    await db.stock.update_one(
        {"ingredient_id": data.ingredient_id, "outlet_id": data.outlet_id, "store": data.from_store},
        {"$inc": {"quantity": -data.quantity}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    # Add to destination store
    dest = await db.stock.find_one(
        {"ingredient_id": data.ingredient_id, "outlet_id": data.outlet_id, "store": data.to_store},
        {"_id": 0, "id": 1},
    )
    if dest:
        await db.stock.update_one(
            {"ingredient_id": data.ingredient_id, "outlet_id": data.outlet_id, "store": data.to_store},
            {"$inc": {"quantity": data.quantity}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        await db.stock.insert_one({
            "id": str(_uuid.uuid4()),
            "ingredient_id": data.ingredient_id,
            "outlet_id": data.outlet_id,
            "store": data.to_store,
            "quantity": data.quantity,
            "min_quantity": float(source.get("min_quantity", 10)),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    # Log movement
    mov = {
        "id": str(_uuid.uuid4()),
        "ingredient_id": data.ingredient_id,
        "ingredient_name": ing["name"],
        "from_store": data.from_store,
        "to_store": data.to_store,
        "outlet_id": data.outlet_id,
        "quantity": data.quantity,
        "type": "transfer",
        "notes": data.notes or f"Transfer from {data.from_store} to {data.to_store}",
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.stock_movements.insert_one(mov)
    return {"ok": True, "transferred": data.quantity, "ingredient": ing["name"]}


# ─── Low stock ─────────────────────────────────────────────────────────────────

@router.get("/stock/low")
async def get_low_stock(current_user: User = Depends(get_current_user)):
    stocks = await db.stock.find({}, {"_id": 0}).to_list(5000)
    low = [s for s in stocks if float(s.get("quantity", 0)) <= float(s.get("min_quantity", 10))]

    ing_ids = list({s["ingredient_id"] for s in low if s.get("ingredient_id")})
    ings = await db.ingredients.find({"id": {"$in": ing_ids}}, {"_id": 0}).to_list(5000)
    ing_map = {i["id"]: i for i in ings}

    return [{
        **s,
        "ingredient_name": ing_map.get(s.get("ingredient_id", ""), {}).get("name", s.get("ingredient_id", "")),
        "unit": ing_map.get(s.get("ingredient_id", ""), {}).get("unit", ""),
    } for s in low]


# ─── Valuation ─────────────────────────────────────────────────────────────────

@router.get("/stock/valuation")
async def get_stock_valuation(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query: dict = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    stocks = await db.stock.find(query, {"_id": 0}).to_list(5000)

    ing_ids = list({s["ingredient_id"] for s in stocks if s.get("ingredient_id")})
    ings = await db.ingredients.find({"id": {"$in": ing_ids}}, {"_id": 0}).to_list(5000)
    ing_map = {i["id"]: i for i in ings}

    total_value = 0.0
    result = []
    for s in stocks:
        ing = ing_map.get(s.get("ingredient_id", ""), {})
        cost = float(ing.get("cost_price", 0))
        qty = float(s.get("quantity", 0))
        value = qty * cost
        total_value += value
        result.append({
            **s,
            "ingredient_name": ing.get("name", ""),
            "unit": ing.get("unit", ""),
            "cost_price": cost,
            "total_value": round(value, 2),
        })

    return {"items": result, "total_value": round(total_value, 2)}


# ─── Consolidated multi-outlet view ────────────────────────────────────────────

@router.get("/stock/consolidated")
async def get_consolidated_stock(current_user: User = Depends(get_current_user)):
    stocks = await db.stock.find({}, {"_id": 0}).to_list(5000)
    ings = await db.ingredients.find({"active": True}, {"_id": 0}).to_list(5000)
    outlets = await db.outlets.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)

    ing_map = {i["id"]: i for i in ings}
    outlet_map = {o["id"]: o["name"] for o in outlets}

    by_ing: dict = {}
    for s in stocks:
        iid = s.get("ingredient_id", "")
        oid = s.get("outlet_id", "")
        store = s.get("store", "main")
        key = f"{iid}|{store}"
        if key not in by_ing:
            ing = ing_map.get(iid, {})
            by_ing[key] = {
                "ingredient_id": iid,
                "ingredient_name": ing.get("name", iid),
                "unit": ing.get("unit", ""),
                "store": store,
                "outlets": {},
                "total": 0,
            }
        by_ing[key]["outlets"][oid] = {
            "outlet_name": outlet_map.get(oid, oid),
            "quantity": float(s.get("quantity", 0)),
            "min_quantity": float(s.get("min_quantity", 10)),
        }
        by_ing[key]["total"] += float(s.get("quantity", 0))

    return {"outlets": outlets, "items": list(by_ing.values())}


# ─── Expiry alerts ─────────────────────────────────────────────────────────────

@router.get("/stock/expiring")
async def get_expiring_stock(days: int = 30, current_user: User = Depends(get_current_user)):
    from datetime import date, timedelta
    cutoff = (date.today() + timedelta(days=days)).isoformat()
    today = date.today().isoformat()

    stocks = await db.stock.find(
        {"expiry_date": {"$ne": None, "$gt": "", "$lte": cutoff}},
        {"_id": 0},
    ).to_list(5000)

    ing_ids = [s["ingredient_id"] for s in stocks if s.get("ingredient_id")]
    ings = await db.ingredients.find({"id": {"$in": ing_ids}}, {"_id": 0}).to_list(5000)
    ing_map = {i["id"]: i for i in ings}

    result = []
    for s in stocks:
        if not s.get("expiry_date"):
            continue
        ing = ing_map.get(s.get("ingredient_id", ""), {})
        expiry = s["expiry_date"]
        days_left = (date.fromisoformat(expiry) - date.today()).days
        result.append({
            **s,
            "ingredient_name": ing.get("name", ""),
            "days_left": days_left,
            "expired": expiry < today,
        })
    return sorted(result, key=lambda x: x["days_left"])


# ─── Stock movements log ────────────────────────────────────────────────────────

@router.post("/stock/movements")
async def create_stock_movement(data: StockMovementCreate, current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    mov = StockMovement(**data.model_dump(), created_by=current_user.id)
    doc = mov.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.stock_movements.insert_one(doc)
    return mov


@router.get("/stock/movements")
async def get_stock_movements(current_user: User = Depends(get_current_user)):
    movements = await db.stock_movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return movements
