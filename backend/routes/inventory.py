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

    if existing:
        await db.stock.update_one(
            {"product_id": stock_data.product_id, "outlet_id": stock_data.outlet_id},
            {"$set": {
                "quantity": stock_data.quantity,
                "min_quantity": stock_data.min_quantity,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
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
