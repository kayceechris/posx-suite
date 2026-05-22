from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import date, timedelta

from database import db
from models import User
from auth import get_current_user


def _date_range_query(start_date: Optional[str], end_date: Optional[str]) -> dict:
    """Build a MongoDB $gte/$lt date range that is inclusive of the full end day.
    created_at is stored as an ISO string like '2026-05-17T10:30:00+00:00',
    so a plain $lte '2026-05-17' would exclude all records from that day."""
    if not (start_date and end_date):
        return {}
    try:
        next_day = (date.fromisoformat(end_date[:10]) + timedelta(days=1)).isoformat()
    except ValueError:
        return {}
    return {"$gte": start_date[:10], "$lt": next_day}

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
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

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
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

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
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

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

    return {"staff": sorted(staff_sales.values(), key=lambda x: x["revenue"], reverse=True)}


@router.get("/reports/payment-methods")
async def get_payment_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

    pipeline = [{"$match": query}, {"$group": {"_id": "$payment_method", "count": {"$sum": 1}, "total": {"$sum": "$total"}}}]
    result = await db.orders.aggregate(pipeline).to_list(100)
    return {"methods": [{"method": r["_id"], "count": r["count"], "total": r["total"]} for r in result]}


@router.get("/reports/sales-by-item")
async def get_sales_by_item(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)

    items_map = {}
    for order in orders:
        for item in order.get("items", []):
            key = item.get("product_id") or item.get("product_name", "unknown")
            if key not in items_map:
                items_map[key] = {
                    "name": item.get("product_name") or item.get("name", "Unknown"),
                    "category": item.get("category", "Uncategorized"),
                    "quantity": 0, "revenue": 0, "order_count": 0,
                }
            qty = item.get("quantity", 0)
            items_map[key]["quantity"] += qty
            items_map[key]["revenue"] += item.get("total", (item.get("price", 0) * qty))
            items_map[key]["order_count"] += 1

    items = sorted(items_map.values(), key=lambda x: x["revenue"], reverse=True)
    return {
        "items": items,
        "total_items_sold": sum(i["quantity"] for i in items),
        "total_revenue": sum(i["revenue"] for i in items),
    }


@router.get("/reports/sales-by-category")
async def get_sales_by_category(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)

    all_products = await db.products.find({}, {"_id": 0, "id": 1, "category": 1, "category_name": 1}).to_list(10000)
    product_cat = {p["id"]: (p.get("category_name") or p.get("category") or "Uncategorized") for p in all_products}

    cats: dict = {}
    for order in orders:
        for item in order.get("items", []):
            pid = item.get("product_id", "")
            cat = product_cat.get(pid) or item.get("category") or "Uncategorized"
            if cat not in cats:
                cats[cat] = {"category": cat, "quantity": 0, "revenue": 0, "order_ids": set()}
            qty = item.get("quantity", 0)
            cats[cat]["quantity"] += qty
            cats[cat]["revenue"] += item.get("total", (item.get("price", 0) * qty))
            cats[cat]["order_ids"].add(order.get("id", ""))

    result = sorted(
        [{"category": v["category"], "quantity": v["quantity"], "revenue": v["revenue"], "orders": len(v["order_ids"])} for v in cats.values()],
        key=lambda x: x["revenue"], reverse=True,
    )
    return {"categories": result, "total_revenue": sum(c["revenue"] for c in result)}


@router.get("/reports/discounts")
async def get_discount_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed", "discount_amount": {"$exists": True, "$gt": 0}}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)

    rows = []
    for o in orders:
        subtotal = o.get("subtotal", o.get("total", 0) + o.get("discount_amount", 0))
        rows.append({
            "order_number": o.get("order_number", "—"),
            "created_at": o.get("created_at", ""),
            "customer_name": o.get("customer_name", "Walk-in"),
            "discount_type": o.get("discount_type", "manual"),
            "discount_amount": o.get("discount_amount", 0),
            "subtotal": subtotal,
            "total": o.get("total", 0),
        })

    return {
        "orders": rows,
        "total_discounts": sum(o.get("discount_amount", 0) for o in orders),
        "total_orders_discounted": len(orders),
        "total_revenue_after_discount": sum(o.get("total", 0) for o in orders),
    }


@router.get("/reports/daily-summary")
async def get_daily_summary(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)

    daily: dict = {}
    for order in orders:
        date_str = order["created_at"][:10] if isinstance(order["created_at"], str) else order["created_at"].strftime("%Y-%m-%d")
        if date_str not in daily:
            daily[date_str] = {"date": date_str, "orders": 0, "revenue": 0, "items_sold": 0, "discounts": 0, "customers": set()}
        daily[date_str]["orders"] += 1
        daily[date_str]["revenue"] += order.get("total", 0)
        daily[date_str]["items_sold"] += sum(i.get("quantity", 0) for i in order.get("items", []))
        daily[date_str]["discounts"] += order.get("discount_amount", 0)
        cust = order.get("customer_id", "") or order.get("customer_name", "")
        if cust:
            daily[date_str]["customers"].add(str(cust))

    result = []
    for d in sorted(daily.values(), key=lambda x: x["date"]):
        result.append({
            "date": d["date"], "orders": d["orders"], "revenue": d["revenue"],
            "items_sold": d["items_sold"], "discounts": d["discounts"],
            "avg_order_value": round(d["revenue"] / d["orders"], 2) if d["orders"] else 0,
            "unique_customers": len(d["customers"]),
        })

    return {
        "days": result,
        "total_revenue": sum(d["revenue"] for d in result),
        "total_orders": sum(d["orders"] for d in result),
        "total_items_sold": sum(d["items_sold"] for d in result),
        "best_day": max(result, key=lambda x: x["revenue"])["date"] if result else None,
    }


@router.get("/reports/shifts")
async def get_shift_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)

    def classify(created_at_str: str) -> str:
        try:
            h = int(created_at_str[11:13]) if "T" in created_at_str else int(created_at_str[11:13])
            if 6  <= h < 12: return "Morning"
            if 12 <= h < 17: return "Afternoon"
            if 17 <= h < 22: return "Evening"
            return "Night"
        except Exception:
            return "Unknown"

    SHIFT_HOURS = {"Morning": "06:00–12:00", "Afternoon": "12:00–17:00", "Evening": "17:00–22:00", "Night": "22:00–06:00"}
    shifts: dict = {s: {"shift": s, "hours": SHIFT_HOURS[s], "orders": 0, "revenue": 0, "items_sold": 0} for s in SHIFT_HOURS}

    for order in orders:
        s = classify(order.get("created_at", ""))
        if s not in shifts:
            continue
        shifts[s]["orders"] += 1
        shifts[s]["revenue"] += order.get("total", 0)
        shifts[s]["items_sold"] += sum(i.get("quantity", 0) for i in order.get("items", []))

    result = list(shifts.values())
    return {
        "shifts": result,
        "total_revenue": sum(s["revenue"] for s in result),
        "total_orders": sum(s["orders"] for s in result),
        "busiest_shift": max(result, key=lambda x: x["orders"])["shift"] if any(s["orders"] for s in result) else None,
    }
