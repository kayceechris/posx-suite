from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/reports/sales")
async def get_sales_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group_by: str = "day",
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = {"status": "completed"}
    if start_date and end_date:
        query["created_at"] = {"$gte": start_date, "$lte": end_date}

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", 1).to_list(10000)

    daily_sales = {}
    for order in orders:
        date_str = order["created_at"][:10] if isinstance(order["created_at"], str) else order["created_at"].strftime("%Y-%m-%d")
        if date_str not in daily_sales:
            daily_sales[date_str] = {"date": date_str, "revenue": 0, "orders": 0, "items_sold": 0}
        daily_sales[date_str]["revenue"] += order.get("total", 0)
        daily_sales[date_str]["orders"] += 1
        daily_sales[date_str]["items_sold"] += sum(item.get("quantity", 0) for item in order.get("items", []))

    product_sales = {}
    for order in orders:
        for item in order.get("items", []):
            pid = item.get("product_id", "")
            if pid not in product_sales:
                product_sales[pid] = {"product_id": pid, "name": item.get("product_name", "Unknown"), "quantity": 0, "revenue": 0}
            product_sales[pid]["quantity"] += item.get("quantity", 0)
            product_sales[pid]["revenue"] += item.get("total", 0)

    top_products = sorted(product_sales.values(), key=lambda x: x["revenue"], reverse=True)[:10]

    payment_breakdown = {}
    for order in orders:
        pm = order.get("payment_method", "unknown")
        if pm not in payment_breakdown:
            payment_breakdown[pm] = {"method": pm, "count": 0, "total": 0}
        payment_breakdown[pm]["count"] += 1
        payment_breakdown[pm]["total"] += order.get("total", 0)

    return {
        "daily_sales": sorted(daily_sales.values(), key=lambda x: x["date"]),
        "top_products": top_products,
        "payment_breakdown": list(payment_breakdown.values()),
        "total_revenue": sum(o.get("total", 0) for o in orders),
        "total_orders": len(orders),
        "avg_order_value": sum(o.get("total", 0) for o in orders) / len(orders) if orders else 0
    }


@router.get("/reports/cost")
async def get_cost_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    if start_date and end_date:
        query["created_at"] = {"$gte": start_date, "$lte": end_date}

    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    products_map = {}
    all_products = await db.products.find({}, {"_id": 0}).to_list(10000)
    for p in all_products:
        products_map[p["id"]] = p

    items_cost = []
    for order in orders:
        for item in order.get("items", []):
            pid = item.get("product_id", "")
            prod = products_map.get(pid, {})
            cost = prod.get("cost_price", 0) * item.get("quantity", 0)
            revenue = item.get("total", 0)
            items_cost.append({"product_id": pid, "name": item.get("product_name", ""), "quantity": item.get("quantity", 0), "cost": cost, "revenue": revenue, "profit": revenue - cost})

    agg = {}
    for ic in items_cost:
        pid = ic["product_id"]
        if pid not in agg:
            agg[pid] = {"product_id": pid, "name": ic["name"], "quantity": 0, "cost": 0, "revenue": 0, "profit": 0}
        agg[pid]["quantity"] += ic["quantity"]
        agg[pid]["cost"] += ic["cost"]
        agg[pid]["revenue"] += ic["revenue"]
        agg[pid]["profit"] += ic["profit"]

    return {"products": sorted(agg.values(), key=lambda x: x["profit"], reverse=True), "total_cost": sum(a["cost"] for a in agg.values()), "total_revenue": sum(a["revenue"] for a in agg.values()), "total_profit": sum(a["profit"] for a in agg.values())}


@router.get("/reports/staff")
async def get_staff_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    if start_date and end_date:
        query["created_at"] = {"$gte": start_date, "$lte": end_date}

    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    users_map = {}
    all_users = await db.users.find({}, {"_id": 0}).to_list(1000)
    for u in all_users:
        users_map[u["id"]] = u

    staff_sales = {}
    for order in orders:
        uid = order.get("created_by", "unknown")
        u = users_map.get(uid, {"name": "Unknown", "role": "unknown"})
        if uid not in staff_sales:
            staff_sales[uid] = {"user_id": uid, "name": u["name"], "role": u["role"], "orders": 0, "revenue": 0}
        staff_sales[uid]["orders"] += 1
        staff_sales[uid]["revenue"] += order.get("total", 0)

    return {"staff": sorted(staff_sales.values(), key=lambda x: x["total_revenue"], reverse=True)}


@router.get("/reports/payment-methods")
async def get_payment_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    if start_date and end_date:
        query["created_at"] = {"$gte": start_date, "$lte": end_date}

    pipeline = [{"$match": query}, {"$group": {"_id": "$payment_method", "count": {"$sum": 1}, "total": {"$sum": "$total"}}}]
    result = await db.orders.aggregate(pipeline).to_list(100)
    return {"methods": [{"method": r["_id"], "count": r["count"], "total": r["total"]} for r in result]}
