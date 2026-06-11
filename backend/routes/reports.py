from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import date, timedelta

from database import db
from models import User
from auth import get_current_user, has_perm


def _dedupe_orders(orders: list) -> list:
    """Drop duplicate order records so reports don't double-count revenue.

    Three layers, tightest first:

      1. Same idempotency_key → true duplicate (one POST landed twice).
         Always safe to collapse. This is the authoritative check for
         every order created after the idempotency_key feature shipped.

      2. Same order_number → true duplicate.

      3. Heuristic fallback for legacy orders that have NEITHER an
         idempotency_key NOR an order_number: subject + total + payment
         method + status within a 60-second window. The window used to
         be 5 minutes which was collapsing legitimate back-to-back sales
         on the same table — e.g. two different customers paying the
         same cash amount on Table 5 a couple minutes apart, only one
         counted in revenue, the other was visible on a printed receipt
         but missing from Total Sales. Tighter window matches actual
         offline-replay timing without affecting real distinct orders."""
    if not orders:
        return orders
    DEDUP_WINDOW_SEC = 60
    sorted_orders = sorted(orders, key=lambda o: str(o.get("created_at") or ""), reverse=True)
    seen_keys = set()
    seen_numbers = set()
    buckets = {}
    out = []
    for o in sorted_orders:
        # Layer 1: idempotency_key (authoritative)
        ikey = o.get("idempotency_key")
        if ikey:
            if ikey in seen_keys:
                continue
            seen_keys.add(ikey)
        # Layer 2: order_number
        num = o.get("order_number")
        if num:
            if num in seen_numbers:
                continue
            seen_numbers.add(num)
        # Layer 3: heuristic — ONLY for orders missing both ikey and num.
        # Modern orders skip this entirely so legitimate distinct sales
        # (same table, same amount, same method, close in time) aren't
        # wrongly collapsed.
        if not ikey and not num:
            ts_str = str(o.get("created_at") or "")
            try:
                from datetime import datetime
                ts = int(datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()) if ts_str else 0
            except Exception:
                ts = 0
            subject = (
                f"t:{o.get('table_id')}" if o.get("table_id")
                else f"b:{o.get('bar_tab_id')}" if o.get("bar_tab_id")
                else f"tn:{o.get('table_number')}" if o.get("table_number") not in (None, "")
                else f"walk:{o.get('created_by') or o.get('created_by_name') or 'anon'}:{(o.get('customer_name') or '').lower()}"
            )
            total_key  = round(float(o.get("total") or 0) * 100)
            method_key = (o.get("payment_method") or "").lower()
            status_key = (o.get("status") or "").lower()
            bucket_key = f"{subject}|{status_key}|{total_key}|{method_key}"
            peers = buckets.get(bucket_key) or []
            is_dup = any(abs(p_ts - ts) <= DEDUP_WINDOW_SEC for p_ts in peers)
            if is_dup:
                continue
            peers.append(ts)
            buckets[bucket_key] = peers
        out.append(o)
    # Return in chronological order (oldest first) so existing aggregations
    # that iterate over `orders` keep their original iteration order.
    return list(reversed(out))


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
    if not has_perm(current_user, "view_sales_report", "view_financial_report"):
        raise HTTPException(status_code=403, detail="Not authorized")

    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", 1).to_list(10000)
    orders = _dedupe_orders(orders)

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
    if not has_perm(current_user, "view_financial_report", "view_sales_report"):
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    orders = _dedupe_orders(orders)
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
    if not has_perm(current_user, "view_staff_report", "view_sales_report"):
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    orders = _dedupe_orders(orders)
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


def _parse_split_payment(method_str: str, order_total: float):
    """Parse 'Card ₦88,000.00 + Bank Transfer ₦77,000.00' into [(method, amount), ...].
    Format: '{method name} {currencySymbol}{digits}' joined with ' + '.
    Finds the boundary using a space before a non-letter character."""
    import re as _re_local
    parts = method_str.split(" + ")
    components = []
    for part in parts:
        # Find 'space + non-letter' to locate the currency symbol boundary
        m = _re_local.search(r'\s[^A-Za-z\s]', part)
        if not m:
            continue
        method = part[:m.start()].strip()
        try:
            # +2 skips the space and the single-char currency symbol
            amount = float(part[m.start() + 2:].replace(',', ''))
        except ValueError:
            amount = 0.0
        if method and amount > 0:
            components.append((method, amount))
    if not components:
        return [(method_str, order_total)]
    component_sum = sum(a for _, a in components)
    if component_sum <= 0:
        return [(method_str, order_total)]
    return [(meth, (amt / component_sum) * order_total) for meth, amt in components]


@router.get("/reports/payment-methods")
async def get_payment_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "view_payment_report", "view_sales_report"):
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

    orders = await db.orders.find(query, {"payment_method": 1, "total": 1}).to_list(None)
    buckets: dict = {}
    for order in orders:
        pm = (order.get("payment_method") or "unknown").strip()
        total = float(order.get("total") or 0)
        if " + " in pm:
            for method, amount in _parse_split_payment(pm, total):
                key = method.lower()
                if key not in buckets:
                    buckets[key] = {"method": method, "count": 0, "total": 0.0}
                buckets[key]["count"] += 1
                buckets[key]["total"] += amount
        else:
            key = pm.lower()
            if key not in buckets:
                buckets[key] = {"method": pm, "count": 0, "total": 0.0}
            buckets[key]["count"] += 1
            buckets[key]["total"] += total

    methods = sorted(buckets.values(), key=lambda x: x["total"], reverse=True)
    return {"methods": methods}


@router.get("/reports/sales-by-item")
async def get_sales_by_item(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "view_product_report", "view_sales_report"):
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    orders = _dedupe_orders(orders)

    # Order items only store product_id — to label each row with a real
    # group name we look up the product → category_id → group name once
    # up front and join in memory.
    products = await db.products.find(
        {}, {"_id": 0, "id": 1, "category_id": 1, "category": 1, "category_name": 1}
    ).to_list(10000)
    groups = await db.categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    group_name = {g["id"]: g.get("name") for g in groups}
    product_cat = {}
    for p in products:
        cat = (
            group_name.get(p.get("category_id"))
            or p.get("category_name")
            or p.get("category")
        )
        if cat:
            product_cat[p["id"]] = cat

    items_map = {}
    for order in orders:
        for item in order.get("items", []):
            key = item.get("product_id") or item.get("product_name", "unknown")
            if key not in items_map:
                pid = item.get("product_id")
                items_map[key] = {
                    "name": item.get("product_name") or item.get("name", "Unknown"),
                    "category": (
                        product_cat.get(pid)
                        or item.get("category_name")
                        or item.get("category")
                        or "Uncategorized"
                    ),
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
    if not has_perm(current_user, "view_product_report", "view_sales_report"):
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    orders = _dedupe_orders(orders)

    all_products = await db.products.find(
        {}, {"_id": 0, "id": 1, "category_id": 1, "category": 1, "category_name": 1}
    ).to_list(10000)
    groups = await db.categories.find(
        {}, {"_id": 0, "id": 1, "name": 1, "main_category": 1}
    ).to_list(1000)
    group_name = {g["id"]: g.get("name") for g in groups}
    # main_category is 'food' / 'drinks'. The Report by Category page rolls
    # individual categories up to these buckets so the owner can see food
    # vs drinks totals at a glance. Shisha is matched by category name
    # because it doesn't have a dedicated main_category value.
    group_main = {g["id"]: (g.get("main_category") or "food").lower() for g in groups}
    product_cat = {
        p["id"]: (
            group_name.get(p.get("category_id"))
            or p.get("category_name")
            or p.get("category")
            or "Uncategorized"
        )
        for p in all_products
    }
    product_bucket = {p["id"]: group_main.get(p.get("category_id"), "food") for p in all_products}

    cats: dict = {}
    for order in orders:
        for item in order.get("items", []):
            pid = item.get("product_id", "")
            cat = product_cat.get(pid) or item.get("category") or "Uncategorized"
            main = product_bucket.get(pid, "food")
            bucket = "shisha" if "shisha" in cat.lower() else ("drinks" if main == "drinks" else "food")
            if cat not in cats:
                cats[cat] = {"category": cat, "main_category": bucket, "quantity": 0, "revenue": 0, "order_ids": set()}
            qty = item.get("quantity", 0)
            cats[cat]["quantity"] += qty
            cats[cat]["revenue"] += item.get("total", (item.get("price", 0) * qty))
            cats[cat]["order_ids"].add(order.get("id", ""))

    result = sorted(
        [{"category": v["category"], "main_category": v["main_category"], "quantity": v["quantity"], "revenue": v["revenue"], "orders": len(v["order_ids"])} for v in cats.values()],
        key=lambda x: x["revenue"], reverse=True,
    )
    return {"categories": result, "total_revenue": sum(c["revenue"] for c in result)}


@router.get("/reports/discounts")
async def get_discount_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "view_sales_report", "view_financial_report"):
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed", "discount_amount": {"$exists": True, "$gt": 0}}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    orders = _dedupe_orders(orders)

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
    if not has_perm(current_user, "view_daily_summary", "view_sales_report"):
        raise HTTPException(status_code=403, detail="Not authorized")
    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    orders = _dedupe_orders(orders)

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


def _parse_hhmm(s: str, fallback_minutes: int) -> int:
    """Return minutes-of-day for an 'HH:MM' string. Falls back on parse error."""
    try:
        parts = (s or "").split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return (h * 60 + m) % (24 * 60)
    except Exception:
        return fallback_minutes


@router.get("/reports/shifts")
async def get_shift_report(start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "view_staff_report", "view_sales_report"):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Load the four shift boundaries from business settings. Each shift runs
    # from its start time until the next shift starts. Night wraps past midnight
    # back to morning_start.
    settings = await db.settings.find_one({"id": "business_settings"}, {"_id": 0}) or {}
    raw = [
        ("Morning",   settings.get("morning_start",   "06:00") or "06:00",  6 * 60),
        ("Afternoon", settings.get("afternoon_start", "12:00") or "12:00", 12 * 60),
        ("Evening",   settings.get("evening_start",   "17:00") or "17:00", 17 * 60),
        ("Night",     settings.get("night_start",     "22:00") or "22:00", 22 * 60),
    ]
    # (name, start_minutes, original_string)
    boundaries = [(name, _parse_hhmm(s, fb), s) for name, s, fb in raw]
    # Sort by start_minutes ascending so we can identify which window each
    # timestamp falls into deterministically.
    ordered = sorted(boundaries, key=lambda x: x[1])

    def fmt(mins: int) -> str:
        return f"{mins // 60:02d}:{mins % 60:02d}"

    # Build hours label per shift: from its own start to the next shift's start
    hours_by_name: dict = {}
    for i, (name, start, _raw) in enumerate(ordered):
        next_start = ordered[(i + 1) % len(ordered)][1]
        hours_by_name[name] = f"{fmt(start)}–{fmt(next_start)}"

    def classify(minutes: int) -> str:
        # Walk ordered list backwards: find the largest boundary <= minutes.
        # If none match (i.e. minutes < earliest boundary), it falls in the
        # last shift of the day (which wraps past midnight).
        chosen = ordered[-1][0]
        for name, start, _raw in ordered:
            if start <= minutes:
                chosen = name
        return chosen

    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    orders = _dedupe_orders(orders)

    def minutes_of(created_at_str: str) -> Optional[int]:
        try:
            t = created_at_str.split("T")[1] if "T" in created_at_str else created_at_str[11:]
            h, m = int(t[0:2]), int(t[3:5])
            return h * 60 + m
        except Exception:
            return None

    # Initialise all four shifts so they show up even with zero orders.
    shifts = {name: {"shift": name, "hours": hours_by_name[name], "orders": 0, "revenue": 0, "items_sold": 0}
              for name, _start, _raw in boundaries}

    for order in orders:
        m = minutes_of(order.get("created_at", ""))
        if m is None:
            continue
        bucket = shifts.get(classify(m))
        if not bucket:
            continue
        bucket["orders"] += 1
        bucket["revenue"] += order.get("total", 0)
        bucket["items_sold"] += sum(i.get("quantity", 0) for i in order.get("items", []))

    # Return shifts in the canonical Morning/Afternoon/Evening/Night order
    canonical_order = ["Morning", "Afternoon", "Evening", "Night"]
    result = [shifts[name] for name in canonical_order if name in shifts]
    busiest = max(result, key=lambda x: x["orders"]) if any(s["orders"] for s in result) else None
    return {
        "shifts": result,
        "total_revenue": sum(s["revenue"] for s in result),
        "total_orders":  sum(s["orders"] for s in result),
        "busiest_shift": busiest["shift"] if busiest else None,
    }


@router.get("/reports/floors")
async def get_floor_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    if not has_perm(current_user, "view_sales_report", "view_financial_report"):
        raise HTTPException(status_code=403, detail="Not authorized")

    query = {"status": "completed"}
    dr = _date_range_query(start_date, end_date)
    if dr:
        query["created_at"] = dr

    orders  = await db.orders.find(query, {"_id": 0}).to_list(10000)
    tables  = await db.tables.find({}, {"_id": 0, "id": 1, "floor_id": 1}).to_list(1000)
    floors  = await db.floors.find({}, {"_id": 0, "id": 1, "name": 1, "outlet_id": 1}).to_list(200)
    outlets = await db.outlets.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)

    table_floor  = {t["id"]: t.get("floor_id") for t in tables}
    floor_meta   = {f["id"]: f for f in floors}
    outlet_names = {o["id"]: o["name"] for o in outlets}

    # bucket_key → accumulator
    buckets: dict = {}

    for order in orders:
        tid      = order.get("table_id")
        floor_id = table_floor.get(tid) if tid else None
        key      = floor_id  # None = unassigned / walk-in

        if key not in buckets:
            buckets[key] = {"revenue": 0.0, "orders": 0, "items_sold": 0, "product_sales": {}, "staff": {}}

        b = buckets[key]
        b["revenue"]    += order.get("total", 0)
        b["orders"]     += 1
        b["items_sold"] += sum(i.get("quantity", 0) for i in order.get("items", []))

        for item in order.get("items", []):
            pid = item.get("product_id", "")
            if pid not in b["product_sales"]:
                b["product_sales"][pid] = {"name": item.get("product_name", ""), "quantity": 0, "revenue": 0.0}
            b["product_sales"][pid]["quantity"] += item.get("quantity", 0)
            b["product_sales"][pid]["revenue"]  += item.get("total", 0)

        uid = order.get("created_by", "")
        if uid not in b["staff"]:
            b["staff"][uid] = {"name": order.get("created_by_name", uid), "orders": 0, "revenue": 0.0}
        b["staff"][uid]["orders"]  += 1
        b["staff"][uid]["revenue"] += order.get("total", 0)

    total_revenue = sum(b["revenue"] for b in buckets.values())
    total_orders  = sum(b["orders"]  for b in buckets.values())

    result_floors = []
    for floor_id, b in buckets.items():
        meta        = floor_meta.get(floor_id, {}) if floor_id else {}
        outlet_id   = meta.get("outlet_id", "")
        top_items   = sorted(b["product_sales"].values(), key=lambda x: x["revenue"], reverse=True)[:5]
        top_staff   = sorted(b["staff"].values(),         key=lambda x: x["revenue"], reverse=True)[:5]

        result_floors.append({
            "floor_id":        floor_id,
            "floor_name":      meta.get("name", "Unassigned / Walk-in") if floor_id else "Unassigned / Walk-in",
            "outlet_name":     outlet_names.get(outlet_id, "") if outlet_id else "",
            "revenue":         round(b["revenue"], 2),
            "orders":          b["orders"],
            "avg_order_value": round(b["revenue"] / b["orders"], 2) if b["orders"] else 0,
            "items_sold":      b["items_sold"],
            "revenue_pct":     round(b["revenue"] / total_revenue * 100, 1) if total_revenue else 0,
            "top_items":       top_items,
            "top_staff":       top_staff,
        })

    # Named floors sorted by revenue desc, unassigned always last
    result_floors.sort(key=lambda x: (x["floor_id"] is None, -x["revenue"]))

    return {
        "total_revenue":    round(total_revenue, 2),
        "total_orders":     total_orders,
        "avg_order_value":  round(total_revenue / total_orders, 2) if total_orders else 0,
        "top_floor":        result_floors[0]["floor_name"] if result_floors and result_floors[0]["floor_id"] else None,
        "floors":           result_floors,
    }
