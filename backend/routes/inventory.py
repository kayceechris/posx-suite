from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone

from database import db
from models import User, Stock, StockUpdate, StockMovement, StockMovementCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/stock")
async def get_stock(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    stocks = await db.stock.find(query, {"_id": 0}).to_list(1000)
    return stocks


@router.post("/stock")
async def update_stock(stock_data: StockUpdate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    existing = await db.stock.find_one({
        "product_id": stock_data.product_id,
        "outlet_id": stock_data.outlet_id
    }, {"_id": 0})

    set_fields = {
        "quantity": stock_data.quantity,
        "min_quantity": stock_data.min_quantity,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if stock_data.batch_number is not None:
        set_fields["batch_number"] = stock_data.batch_number
    if stock_data.expiry_date is not None:
        set_fields["expiry_date"] = stock_data.expiry_date

    if existing:
        await db.stock.update_one(
            {"product_id": stock_data.product_id, "outlet_id": stock_data.outlet_id},
            {"$set": set_fields}
        )
    else:
        stock = Stock(**stock_data.model_dump())
        doc = stock.model_dump()
        doc["updated_at"] = doc["updated_at"].isoformat()
        await db.stock.insert_one(doc)

    return {"message": "Stock updated successfully"}


@router.get("/stock/low")
async def get_low_stock(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    pipeline = [
        {"$addFields": {"quantityNum": {"$toInt": "$quantity"}, "minQuantityNum": {"$toInt": "$min_quantity"}}},
        {"$match": {"$expr": {"$lte": ["$quantityNum", "$minQuantityNum"]}}},
        {"$project": {"_id": 0}}
    ]
    low_stock = await db.stock.aggregate(pipeline).to_list(1000)
    return low_stock


# ==================== STOCK MOVEMENT ROUTES ====================

@router.post("/stock/movements", response_model=StockMovement)
async def create_stock_movement(movement_data: StockMovementCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    movement = StockMovement(**movement_data.model_dump(), created_by=current_user.id)

    if movement.type == "in" and movement.to_outlet_id:
        existing = await db.stock.find_one({
            "product_id": movement.product_id,
            "outlet_id": movement.to_outlet_id
        })
        if existing:
            await db.stock.update_one(
                {"product_id": movement.product_id, "outlet_id": movement.to_outlet_id},
                {"$inc": {"quantity": movement.quantity}}
            )
    elif movement.type == "out" and movement.from_outlet_id:
        await db.stock.update_one(
            {"product_id": movement.product_id, "outlet_id": movement.from_outlet_id},
            {"$inc": {"quantity": -movement.quantity}}
        )
    elif movement.type == "transfer" and movement.from_outlet_id and movement.to_outlet_id:
        await db.stock.update_one(
            {"product_id": movement.product_id, "outlet_id": movement.from_outlet_id},
            {"$inc": {"quantity": -movement.quantity}}
        )
        existing = await db.stock.find_one({
            "product_id": movement.product_id,
            "outlet_id": movement.to_outlet_id
        })
        if existing:
            await db.stock.update_one(
                {"product_id": movement.product_id, "outlet_id": movement.to_outlet_id},
                {"$inc": {"quantity": movement.quantity}}
            )

    doc = movement.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.stock_movements.insert_one(doc)
    return movement


@router.get("/stock/movements")
async def get_stock_movements(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    movements = await db.stock_movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return movements


# ==================== STOCK VALUATION ====================

@router.get("/stock/valuation")
async def get_stock_valuation(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    stocks = await db.stock.find(query, {"_id": 0}).to_list(1000)

    result = []
    total_cost_value = 0.0
    total_retail_value = 0.0

    for s in stocks:
        product = await db.products.find_one({"id": s["product_id"]}, {"_id": 0, "name": 1, "cost_price": 1, "price": 1})
        if not product:
            continue
        cost_price = float(product.get("cost_price") or 0)
        selling_price = float(product.get("price") or 0)
        qty = int(s.get("quantity") or 0)
        cost_value = qty * cost_price
        retail_value = qty * selling_price
        total_cost_value += cost_value
        total_retail_value += retail_value
        result.append({
            **s,
            "product_name": product["name"],
            "cost_price": cost_price,
            "selling_price": selling_price,
            "cost_value": cost_value,
            "retail_value": retail_value,
        })

    return {
        "items": result,
        "total_cost_value": round(total_cost_value, 2),
        "total_retail_value": round(total_retail_value, 2),
        "potential_profit": round(total_retail_value - total_cost_value, 2),
    }


# ==================== CONSOLIDATED MULTI-OUTLET VIEW ====================

@router.get("/stock/consolidated")
async def get_consolidated_stock(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    stocks = await db.stock.find({}, {"_id": 0}).to_list(1000)
    products = await db.products.find({"active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    outlets = await db.outlets.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)

    outlet_map = {o["id"]: o["name"] for o in outlets}

    by_product = {}
    for s in stocks:
        pid = s["product_id"]
        oid = s["outlet_id"]
        if pid not in by_product:
            by_product[pid] = {"product_id": pid, "product_name": pid, "outlets": {}, "total": 0}
        by_product[pid]["outlets"][oid] = {
            "outlet_name": outlet_map.get(oid, oid),
            "quantity": int(s.get("quantity") or 0),
            "min_quantity": int(s.get("min_quantity") or 10),
        }
        by_product[pid]["total"] += int(s.get("quantity") or 0)

    for p in products:
        if p["id"] in by_product:
            by_product[p["id"]]["product_name"] = p["name"]

    return {"outlets": outlets, "products": list(by_product.values())}


# ==================== EXPIRY ALERTS ====================

@router.get("/stock/expiring")
async def get_expiring_stock(days: int = 30, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    from datetime import date, timedelta
    cutoff = (date.today() + timedelta(days=days)).isoformat()
    today = date.today().isoformat()

    stocks = await db.stock.find(
        {"expiry_date": {"$ne": None, "$lte": cutoff}},
        {"_id": 0}
    ).to_list(1000)

    result = []
    for s in stocks:
        if not s.get("expiry_date"):
            continue
        product = await db.products.find_one({"id": s["product_id"]}, {"_id": 0, "name": 1})
        expiry = s["expiry_date"]
        days_left = (date.fromisoformat(expiry) - date.today()).days
        result.append({
            **s,
            "product_name": product["name"] if product else s["product_id"],
            "days_left": days_left,
            "expired": expiry < today,
        })

    return sorted(result, key=lambda x: x["days_left"])
