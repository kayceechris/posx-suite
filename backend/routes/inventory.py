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

# Main Store is a single global warehouse — it isn't tied to a specific outlet.
# We tag all Main Store stock records with this constant outlet so reads/writes
# don't depend on which outlet the user is currently looking at.
MAIN_STORE_OUTLET = "global"


def _normalize_outlet_for_store(store: str, outlet_id: str) -> str:
    """Main Store stock is outlet-agnostic — always use the global outlet."""
    return MAIN_STORE_OUTLET if (store or "main") == "main" else outlet_id


def _require_admin(user: User):
    if not has_perm(user, "update_stock", "view_inventory"):
        raise HTTPException(403, "Not authorized")


def _require_manager(user: User):
    if not has_perm(user, "update_stock"):
        raise HTTPException(403, "Not authorized")


def _stock_subject(data) -> tuple[str, str]:
    """Validate and return (subject_field, subject_id) for a stock payload.
    Accepts pydantic objects or plain dicts."""
    get = (lambda k: getattr(data, k, None)) if hasattr(data, "model_dump") else data.get
    iid = get("ingredient_id")
    pid = get("product_id")
    if iid and pid:
        raise HTTPException(400, "Stock record must reference either ingredient_id OR product_id, not both")
    if not iid and not pid:
        raise HTTPException(400, "Stock record requires ingredient_id or product_id")
    return ("ingredient_id", iid) if iid else ("product_id", pid)


# ─── Get stock ─────────────────────────────────────────────────────────────────

@router.get("/stock")
async def get_stock(
    outlet_id: Optional[str] = None,
    store: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    query: dict = {}
    # Normalize outlet_id the same way the write path does so callers don't
    # have to know that Main Store lives at MAIN_STORE_OUTLET. Without this,
    # Update Stock / Stock Count pages would pass the user's outlet_id with
    # store="main" and get an empty list (Main Store rows are stored at
    # MAIN_STORE_OUTLET="global", not at the user's outlet).
    if outlet_id and store:
        outlet_id = _normalize_outlet_for_store(store, outlet_id)
    if outlet_id:
        query["outlet_id"] = outlet_id
    if store:
        query["store"] = store
    stocks = await db.stock.find(query, {"_id": 0}).to_list(5000)

    # Enrich with ingredient OR product name depending on which field is set
    ing_ids = list({s["ingredient_id"] for s in stocks if s.get("ingredient_id")})
    prod_ids = list({s["product_id"] for s in stocks if s.get("product_id")})

    ings = await db.ingredients.find({"id": {"$in": ing_ids}}, {"_id": 0}).to_list(5000) if ing_ids else []
    prods = await db.products.find({"id": {"$in": prod_ids}}, {"_id": 0}).to_list(5000) if prod_ids else []
    ing_map = {i["id"]: i for i in ings}
    prod_map = {p["id"]: p for p in prods}

    result = []
    for s in stocks:
        iid = s.get("ingredient_id")
        pid = s.get("product_id")
        if iid:
            ing = ing_map.get(iid, {})
            result.append({
                **s,
                "ingredient_name": ing.get("name", iid),
                "subject_name": ing.get("name", iid),
                "unit": ing.get("unit", ""),
                "category": ing.get("category", ""),
                "cost_price": ing.get("cost_price", 0),
                # Surface the ingredient's home_store on the stock row
                # so the Stock Levels view can show a tag without an
                # extra lookup per item.
                "home_store": ing.get("home_store"),
            })
        elif pid:
            prod = prod_map.get(pid, {})
            result.append({
                **s,
                "product_name": prod.get("name", pid),
                "subject_name": prod.get("name", pid),
                "unit": "",  # products don't carry a unit field directly
                "category": "",
                "cost_price": prod.get("cost_price", 0),
                "selling_price": prod.get("price", 0),
            })
        else:
            result.append({**s, "subject_name": "(unlinked)"})
    return result


# ─── Upsert stock ──────────────────────────────────────────────────────────────

@router.post("/stock")
async def update_stock(stock_data: StockUpdate, current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    subject_field, subject_id = _stock_subject(stock_data)

    # Validate subject exists
    if subject_field == "ingredient_id":
        if not await db.ingredients.find_one({"id": subject_id}, {"_id": 0}):
            raise HTTPException(404, f"Ingredient '{subject_id}' not found")
    else:
        if not await db.products.find_one({"id": subject_id}, {"_id": 0}):
            raise HTTPException(404, f"Product '{subject_id}' not found")

    store = stock_data.store or "main"
    outlet_id = _normalize_outlet_for_store(store, stock_data.outlet_id)
    set_doc = {
        subject_field: subject_id,
        "outlet_id": outlet_id,
        "store": store,
        "quantity": stock_data.quantity,
        "min_quantity": stock_data.min_quantity,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if stock_data.batch_number is not None:
        set_doc["batch_number"] = stock_data.batch_number
    if stock_data.expiry_date is not None:
        set_doc["expiry_date"] = stock_data.expiry_date

    # For Main Store, match by subject+store regardless of the stored
    # outlet_id. Legacy rows may have outlet_id="" or the outlet's own id
    # from before we standardised on MAIN_STORE_OUTLET. Without this
    # broader match we'd insert a duplicate every time the user edits a
    # legacy row — the new row gets the canonical "global" outlet_id, the
    # old row keeps its bad outlet_id, and the UI keeps showing the stale
    # one because it sorts/renders first. The broad match also self-heals
    # the outlet_id (set_doc overwrites it to MAIN_STORE_OUTLET) and we
    # delete any leftover dupes so the list converges to one row.
    if store == "main":
        matches = await db.stock.find(
            {subject_field: subject_id, "store": store},
            {"_id": 0, "id": 1, "outlet_id": 1},
        ).to_list(20)
        if matches:
            primary = matches[0]
            await db.stock.update_one(
                {subject_field: subject_id, "store": store, "outlet_id": primary.get("outlet_id", "")},
                {"$set": set_doc},
            )
            for dup in matches[1:]:
                await db.stock.delete_one(
                    {subject_field: subject_id, "store": store, "outlet_id": dup.get("outlet_id", "")}
                )
        else:
            set_doc["id"] = str(_uuid.uuid4())
            await db.stock.insert_one(set_doc)
    else:
        key = {subject_field: subject_id, "outlet_id": outlet_id, "store": store}
        existing = await db.stock.find_one(key, {"_id": 0, "id": 1})
        if existing:
            await db.stock.update_one(key, {"$set": set_doc})
        else:
            set_doc["id"] = str(_uuid.uuid4())
            await db.stock.insert_one(set_doc)

    return {"message": "Stock updated"}


# ─── CSV import ────────────────────────────────────────────────────────────────
# mode="ingredient" (default): rows match against (or create) Ingredients.
# mode="product": rows match Products by name; products are NOT auto-created here
#                 since they require category/price — skipped if not found.
# CSV format (ingredient mode): name, quantity, min_quantity, unit, category, cost_price, batch_number, expiry_date
# CSV format (product mode):    name, quantity, min_quantity, batch_number, expiry_date

@router.post("/stock/import-csv")
async def import_stock_csv(
    outlet_id: str = Form(...),
    store: str = Form("main"),
    mode: str = Form("ingredient"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    _require_manager(current_user)
    if mode not in ("ingredient", "product"):
        raise HTTPException(400, "mode must be 'ingredient' or 'product'")
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

        if mode == "ingredient":
            # Find or create the ingredient
            ingredient = await db.ingredients.find_one(
                {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
                {"_id": 0},
            )
            if not ingredient:
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
            subject_field, subject_id = "ingredient_id", ingredient["id"]
        else:
            # Product mode — match by name; we do NOT auto-create products
            product = await db.products.find_one(
                {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
                {"_id": 0, "id": 1},
            )
            if not product:
                results["errors"].append(f'Product not found: "{name}" (create it in Products first)')
                results["skipped"] += 1
                continue
            subject_field, subject_id = "product_id", product["id"]

        effective_outlet = _normalize_outlet_for_store(store, outlet_id)
        set_doc: dict = {
            subject_field: subject_id,
            "outlet_id": effective_outlet,
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

        key = {subject_field: subject_id, "outlet_id": effective_outlet, "store": store}
        existing = await db.stock.find_one(key, {"_id": 0, "id": 1})
        if existing:
            await db.stock.update_one(key, {"$set": set_doc})
        else:
            set_doc["id"] = str(_uuid.uuid4())
            await db.stock.insert_one(set_doc)
        results["imported"] += 1

    return results


# ─── Store transfer (Kitchen ↔ Bar, or any store pair) ─────────────────────────

@router.post("/stock/transfer")
async def transfer_stock(data: StockTransfer, current_user: User = Depends(get_current_user)):
    """Transfer ingredient OR product stock between stores within the same outlet."""
    _require_manager(current_user)
    subject_field, subject_id = _stock_subject(data)

    # Look up name for logging / error messages
    if subject_field == "ingredient_id":
        subj = await db.ingredients.find_one({"id": subject_id}, {"_id": 0, "name": 1})
        if not subj:
            raise HTTPException(404, "Ingredient not found")
    else:
        subj = await db.products.find_one({"id": subject_id}, {"_id": 0, "name": 1})
        if not subj:
            raise HTTPException(404, "Product not found")

    from_outlet = _normalize_outlet_for_store(data.from_store, data.outlet_id)
    to_outlet   = _normalize_outlet_for_store(data.to_store,   data.outlet_id)

    source = await db.stock.find_one(
        {subject_field: subject_id, "outlet_id": from_outlet, "store": data.from_store},
        {"_id": 0},
    )
    if not source:
        raise HTTPException(404, f"No stock of '{subj['name']}' in {data.from_store} store")
    if float(source.get("quantity", 0)) < data.quantity:
        raise HTTPException(400, f"Insufficient stock: only {source['quantity']} available in {data.from_store}")

    await db.stock.update_one(
        {subject_field: subject_id, "outlet_id": from_outlet, "store": data.from_store},
        {"$inc": {"quantity": -data.quantity}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    dest = await db.stock.find_one(
        {subject_field: subject_id, "outlet_id": to_outlet, "store": data.to_store},
        {"_id": 0, "id": 1},
    )
    if dest:
        await db.stock.update_one(
            {subject_field: subject_id, "outlet_id": to_outlet, "store": data.to_store},
            {"$inc": {"quantity": data.quantity}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        await db.stock.insert_one({
            "id": str(_uuid.uuid4()),
            subject_field: subject_id,
            "outlet_id": to_outlet,
            "store": data.to_store,
            "quantity": data.quantity,
            "min_quantity": float(source.get("min_quantity", 10)),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    mov = {
        "id": str(_uuid.uuid4()),
        subject_field: subject_id,
        "subject_name": subj["name"],
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
    return {"ok": True, "transferred": data.quantity, "subject": subj["name"]}


async def _enrich_stock(stocks: list) -> list:
    """Add subject_name, unit, cost_price (and product selling price) to each row."""
    ing_ids = list({s["ingredient_id"] for s in stocks if s.get("ingredient_id")})
    prod_ids = list({s["product_id"] for s in stocks if s.get("product_id")})
    ings = await db.ingredients.find({"id": {"$in": ing_ids}}, {"_id": 0}).to_list(5000) if ing_ids else []
    prods = await db.products.find({"id": {"$in": prod_ids}}, {"_id": 0}).to_list(5000) if prod_ids else []
    ing_map = {i["id"]: i for i in ings}
    prod_map = {p["id"]: p for p in prods}

    out = []
    for s in stocks:
        iid = s.get("ingredient_id")
        pid = s.get("product_id")
        if iid:
            ing = ing_map.get(iid, {})
            out.append({**s,
                "ingredient_name": ing.get("name", iid),
                "subject_name": ing.get("name", iid),
                "unit": ing.get("unit", ""),
                "cost_price": float(ing.get("cost_price", 0)),
                "home_store": ing.get("home_store"),
            })
        elif pid:
            prod = prod_map.get(pid, {})
            out.append({**s,
                "product_name": prod.get("name", pid),
                "subject_name": prod.get("name", pid),
                "unit": "",
                "cost_price": float(prod.get("cost_price", 0)),
                "selling_price": float(prod.get("price", 0)),
            })
        else:
            out.append({**s, "subject_name": "(unlinked)"})
    return out


# ─── Low stock ─────────────────────────────────────────────────────────────────

@router.get("/stock/low")
async def get_low_stock(current_user: User = Depends(get_current_user)):
    stocks = await db.stock.find({}, {"_id": 0}).to_list(5000)
    low = [s for s in stocks if float(s.get("quantity", 0)) <= float(s.get("min_quantity", 10))]
    return await _enrich_stock(low)


# ─── Valuation ─────────────────────────────────────────────────────────────────

@router.get("/stock/valuation")
async def get_stock_valuation(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query: dict = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    stocks = await db.stock.find(query, {"_id": 0}).to_list(5000)
    enriched = await _enrich_stock(stocks)

    total_value = 0.0
    for s in enriched:
        s["total_value"] = round(float(s.get("quantity", 0)) * float(s.get("cost_price", 0)), 2)
        total_value += s["total_value"]
    return {"items": enriched, "total_value": round(total_value, 2)}


# ─── Consolidated multi-outlet view ────────────────────────────────────────────

@router.get("/stock/consolidated")
async def get_consolidated_stock(current_user: User = Depends(get_current_user)):
    stocks = await db.stock.find({}, {"_id": 0}).to_list(5000)
    ings = await db.ingredients.find({"active": True}, {"_id": 0}).to_list(5000)
    prods = await db.products.find({"active": {"$ne": False}}, {"_id": 0}).to_list(5000)
    outlets = await db.outlets.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)

    ing_map = {i["id"]: i for i in ings}
    prod_map = {p["id"]: p for p in prods}
    outlet_map = {o["id"]: o["name"] for o in outlets}

    grouped: dict = {}
    for s in stocks:
        iid = s.get("ingredient_id")
        pid = s.get("product_id")
        oid = s.get("outlet_id", "")
        store = s.get("store", "main")

        if iid:
            ing = ing_map.get(iid, {})
            subject_id, subject_name, unit = iid, ing.get("name", iid), ing.get("unit", "")
            field = "ingredient_id"
        elif pid:
            prod = prod_map.get(pid, {})
            subject_id, subject_name, unit = pid, prod.get("name", pid), ""
            field = "product_id"
        else:
            continue

        key = f"{field}:{subject_id}|{store}"
        if key not in grouped:
            grouped[key] = {
                field: subject_id,
                "ingredient_name": subject_name if field == "ingredient_id" else None,
                "product_name": subject_name if field == "product_id" else None,
                "subject_name": subject_name,
                "unit": unit,
                "store": store,
                "outlets": {},
                "total": 0,
            }
        grouped[key]["outlets"][oid] = {
            "outlet_name": outlet_map.get(oid, oid),
            "quantity": float(s.get("quantity", 0)),
            "min_quantity": float(s.get("min_quantity", 10)),
        }
        grouped[key]["total"] += float(s.get("quantity", 0))

    return {"outlets": outlets, "items": list(grouped.values())}


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
    enriched = await _enrich_stock(stocks)

    result = []
    for s in enriched:
        if not s.get("expiry_date"):
            continue
        expiry = s["expiry_date"]
        days_left = (date.fromisoformat(expiry) - date.today()).days
        result.append({**s, "days_left": days_left, "expired": expiry < today})
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
