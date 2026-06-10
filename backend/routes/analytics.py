from fastapi import APIRouter, Depends
from typing import Optional

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/analytics/dashboard")
async def get_dashboard_analytics(
    outlet_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id

    total_orders = await db.orders.count_documents(query)

    pipeline = [{"$match": query}, {"$group": {"_id": None, "total": {"$sum": "$total"}}}]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0

    total_customers = await db.customers.count_documents({})
    total_products = await db.products.count_documents({"active": True})

    low_stock_pipeline = [
        {"$addFields": {"quantityNum": {"$toInt": "$quantity"}, "minQuantityNum": {"$toInt": "$min_quantity"}}},
        {"$match": {"$expr": {"$lte": ["$quantityNum", "$minQuantityNum"]}}},
        {"$count": "count"}
    ]
    low_stock_result = await db.stock.aggregate(low_stock_pipeline).to_list(1)
    low_stock_count = low_stock_result[0]["count"] if low_stock_result else 0

    recent_orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)

    top_products_pipeline = [
        {"$match": query},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "name": {"$first": "$items.product_name"},
            "total_quantity": {"$sum": "$items.quantity"},
            "total_revenue": {"$sum": "$items.total"}
        }},
        {"$sort": {"total_quantity": -1}},
        {"$limit": 5}
    ]
    top_products = await db.orders.aggregate(top_products_pipeline).to_list(5)

    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "total_customers": total_customers,
        "total_products": total_products,
        "low_stock_count": low_stock_count,
        "recent_orders": recent_orders,
        "top_products": top_products
    }
