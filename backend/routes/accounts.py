import asyncio
import calendar
import uuid
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone

from database import db
from models import (
    User, Expense, ExpenseCreate,
    Deposit, DepositCreate,
    AccountCategory, AccountCategoryCreate,
    Transfer, TransferCreate,
)
from auth import get_current_user

router = APIRouter(prefix="/api")

ADMIN_ROLES = ["admin", "manager"]


def require_admin(user: User):
    if user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")


# ==================== EXPENSES ====================

@router.get("/expenses")
async def get_expenses(current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    return await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(1000)


@router.post("/expenses", response_model=Expense)
async def create_expense(expense_data: ExpenseCreate, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    expense = Expense(**expense_data.model_dump(), created_by=current_user.id)
    doc = expense.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.expenses.insert_one(doc)
    return expense


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted"}


# ==================== DEPOSITS ====================

@router.get("/deposits")
async def get_deposits(current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    return await db.deposits.find({}, {"_id": 0}).sort("date", -1).to_list(1000)


@router.post("/deposits", response_model=Deposit)
async def create_deposit(data: DepositCreate, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    deposit = Deposit(**data.model_dump(), created_by=current_user.id)
    doc = deposit.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.deposits.insert_one(doc)
    return deposit


@router.delete("/deposits/{deposit_id}")
async def delete_deposit(deposit_id: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    result = await db.deposits.delete_one({"id": deposit_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deposit not found")
    return {"message": "Deposit deleted"}


# ==================== ACCOUNT CATEGORIES ====================

@router.get("/account-categories")
async def get_account_categories(type: Optional[str] = None, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    query = {"type": type} if type else {}
    cats = await db.account_categories.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return cats


@router.post("/account-categories", response_model=AccountCategory)
async def create_account_category(data: AccountCategoryCreate, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    cat = AccountCategory(**data.model_dump())
    doc = cat.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.account_categories.insert_one(doc)
    return cat


@router.delete("/account-categories/{cat_id}")
async def delete_account_category(cat_id: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    result = await db.account_categories.delete_one({"id": cat_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}


# ==================== TRANSFERS ====================

@router.get("/transfers")
async def get_transfers(current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    return await db.transfers.find({}, {"_id": 0}).sort("date", -1).to_list(1000)


@router.post("/transfers", response_model=Transfer)
async def create_transfer(data: TransferCreate, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    transfer = Transfer(**data.model_dump(), created_by=current_user.id)
    doc = transfer.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.transfers.insert_one(doc)
    return transfer


@router.delete("/transfers/{transfer_id}")
async def delete_transfer(transfer_id: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    result = await db.transfers.delete_one({"id": transfer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return {"message": "Transfer deleted"}


# ==================== DASHBOARD ====================

@router.get("/accounts/dashboard")
async def get_accounts_dashboard(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)

    order_q = {"status": "completed"}
    held_q  = {"status": "held"}
    exp_q   = {}
    dep_q   = {}
    po_q    = {}

    if start_date and end_date:
        order_q["created_at"] = {"$gte": start_date, "$lte": end_date}
        held_q["created_at"]  = {"$gte": start_date, "$lte": end_date}
        exp_q["date"]  = {"$gte": start_date, "$lte": end_date}
        dep_q["date"]  = {"$gte": start_date, "$lte": end_date}
        po_q["created_at"] = {"$gte": start_date, "$lte": end_date}

    # Sales (completed orders)
    rev_pipe = [{"$match": order_q}, {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}]
    rev = await db.orders.aggregate(rev_pipe).to_list(1)
    sales       = rev[0]["total"] if rev else 0
    invoice_cnt = rev[0]["count"] if rev else 0

    # Sales due (held/open orders)
    held_pipe = [{"$match": held_q}, {"$group": {"_id": None, "total": {"$sum": "$total"}}}]
    held = await db.orders.aggregate(held_pipe).to_list(1)
    sales_due = held[0]["total"] if held else 0

    # Purchases (purchase orders)
    po_pipe = [{"$match": po_q}, {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}]
    po = await db.purchase_orders.aggregate(po_pipe).to_list(1)
    purchases = po[0]["total"] if po else 0

    # Purchase due (pending POs)
    pending_po_q = {**po_q, "status": {"$in": ["pending", "ordered"]}}
    pp_pipe = [{"$match": pending_po_q}, {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}]
    pp = await db.purchase_orders.aggregate(pp_pipe).to_list(1)
    purchase_due = pp[0]["total"] if pp else 0

    # Expenses total
    exp_pipe = [{"$match": exp_q}, {"$group": {"_id": None, "total": {"$sum": "$amount"}, "by_cat": {"$push": {"cat": "$category", "amt": "$amount"}}}}]
    exp = await db.expenses.aggregate([{"$match": exp_q}, {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}]).to_list(100)
    expenses_total = sum(e["total"] for e in exp)
    expense_by_cat = {e["_id"]: e["total"] for e in exp}

    # Deposits total
    dep_pipe = [{"$match": dep_q}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    dep = await db.deposits.aggregate(dep_pipe).to_list(1)
    deposits_total = dep[0]["total"] if dep else 0

    # COGS
    cogs_pipe = [
        {"$match": order_q}, {"$unwind": "$items"},
        {"$lookup": {"from": "products", "localField": "items.product_id", "foreignField": "id", "as": "p"}},
        {"$unwind": {"path": "$p", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": None, "cogs": {"$sum": {"$multiply": [{"$ifNull": ["$p.cost_price", 0]}, "$items.quantity"]}}}}
    ]
    cogs_res = await db.orders.aggregate(cogs_pipe).to_list(1)
    cogs = cogs_res[0]["cogs"] if cogs_res else 0

    gross_profit = sales - cogs
    net_profit   = gross_profit - expenses_total + deposits_total

    # Payment method breakdown
    pm_pipe = [{"$match": order_q}, {"$group": {"_id": "$payment_method", "total": {"$sum": "$total"}, "count": {"$sum": 1}}}]
    pm_res = await db.orders.aggregate(pm_pipe).to_list(20)
    payment_breakdown = {r["_id"] or "other": {"total": r["total"], "count": r["count"]} for r in pm_res}

    # Daily sales (last 30 points within range)
    daily_pipe = [
        {"$match": order_q},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "revenue": {"$sum": "$total"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}, {"$limit": 30}
    ]
    daily = await db.orders.aggregate(daily_pipe).to_list(30)
    daily_sales = [{"date": d["_id"], "revenue": d["revenue"], "count": d["count"]} for d in daily]

    return {
        "sales": sales,
        "purchases": purchases,
        "sales_return": 0,
        "purchases_return": 0,
        "sales_due": sales_due,
        "purchase_due": purchase_due,
        "invoice_count": invoice_cnt,
        "gross_profit": gross_profit,
        "net_profit": net_profit,
        "expenses_total": expenses_total,
        "deposits_total": deposits_total,
        "cogs": cogs,
        "expense_by_category": expense_by_cat,
        "payment_breakdown": payment_breakdown,
        "daily_sales": daily_sales,
    }


# ==================== ACCOUNTS SUMMARY (legacy) ====================

@router.get("/accounts/summary")
async def get_accounts_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)

    order_query = {"status": "completed"}
    expense_query = {}
    if start_date and end_date:
        order_query["created_at"] = {"$gte": start_date, "$lte": end_date}
        expense_query["date"] = {"$gte": start_date, "$lte": end_date}

    rev_pipeline = [
        {"$match": order_query},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$total"}, "count": {"$sum": 1}}}
    ]
    rev_result = await db.orders.aggregate(rev_pipeline).to_list(1)
    total_revenue = rev_result[0]["total_revenue"] if rev_result else 0
    total_orders  = rev_result[0]["count"] if rev_result else 0

    cost_pipeline = [
        {"$match": order_query}, {"$unwind": "$items"},
        {"$lookup": {"from": "products", "localField": "items.product_id", "foreignField": "id", "as": "product_info"}},
        {"$unwind": {"path": "$product_info", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": None, "total_cogs": {"$sum": {"$multiply": [{"$ifNull": ["$product_info.cost_price", 0]}, "$items.quantity"]}}}}
    ]
    cost_result = await db.orders.aggregate(cost_pipeline).to_list(1)
    total_cogs = cost_result[0]["total_cogs"] if cost_result else 0

    expense_pipeline = [
        {"$match": expense_query},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}
    ]
    expense_result = await db.expenses.aggregate(expense_pipeline).to_list(100)
    total_expenses = sum(e["total"] for e in expense_result)
    expense_by_category = {e["_id"]: e["total"] for e in expense_result}

    gross_profit = total_revenue - total_cogs
    net_profit   = gross_profit - total_expenses

    return {
        "total_revenue": total_revenue,
        "total_cogs": total_cogs,
        "gross_profit": gross_profit,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "total_orders": total_orders,
        "expense_by_category": expense_by_category,
        "gross_margin": (gross_profit / total_revenue * 100) if total_revenue > 0 else 0,
        "net_margin": (net_profit / total_revenue * 100) if total_revenue > 0 else 0,
    }


# ==================== CASH FLOW ====================

@router.get("/accounts/cash-flow")
async def get_cash_flow(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)

    order_q = {"status": "completed"}
    exp_q = {}
    dep_q = {}

    if start_date and end_date:
        order_q["created_at"] = {"$gte": start_date, "$lte": end_date}
        exp_q["date"] = {"$gte": start_date, "$lte": end_date}
        dep_q["date"] = {"$gte": start_date, "$lte": end_date}

    sales_pipe = [
        {"$match": order_q},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "amount": {"$sum": "$total"}}},
        {"$sort": {"_id": 1}},
    ]
    exp_pipe = [
        {"$match": exp_q},
        {"$group": {"_id": "$date", "amount": {"$sum": "$amount"}}},
        {"$sort": {"_id": 1}},
    ]
    dep_pipe = [
        {"$match": dep_q},
        {"$group": {"_id": "$date", "amount": {"$sum": "$amount"}}},
        {"$sort": {"_id": 1}},
    ]

    sales_res, exp_res, dep_res = await asyncio.gather(
        db.orders.aggregate(sales_pipe).to_list(365),
        db.expenses.aggregate(exp_pipe).to_list(365),
        db.deposits.aggregate(dep_pipe).to_list(365),
    )

    sales_map = {s["_id"]: s["amount"] for s in sales_res}
    exp_map   = {e["_id"]: e["amount"] for e in exp_res}
    dep_map   = {d["_id"]: d["amount"] for d in dep_res}

    all_dates = sorted(set(list(sales_map) + list(exp_map) + list(dep_map)))
    timeline = []
    running = 0.0
    for d in all_dates:
        inflow  = sales_map.get(d, 0) + dep_map.get(d, 0)
        outflow = exp_map.get(d, 0)
        running += inflow - outflow
        timeline.append({"date": d, "inflow": inflow, "outflow": outflow,
                          "net": inflow - outflow, "balance": running})

    total_in  = sum(t["inflow"]  for t in timeline)
    total_out = sum(t["outflow"] for t in timeline)
    return {
        "timeline": timeline,
        "total_inflow": total_in,
        "total_outflow": total_out,
        "net_cash_flow": total_in - total_out,
        "closing_balance": running,
    }


# ==================== INVOICE TRACKING ====================

@router.get("/accounts/invoices")
async def get_invoices(current_user: User = Depends(get_current_user)):
    require_admin(current_user)

    orders = await db.orders.find(
        {"status": {"$in": ["held", "sent_to_kitchen", "pending"]}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)

    now = datetime.now(timezone.utc)
    invoices = []
    for order in orders:
        created = order.get("created_at", "")
        try:
            dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            days = (now - dt).days
        except Exception:
            days = 0

        bucket = (
            "0-7 days"   if days <= 7  else
            "8-30 days"  if days <= 30 else
            "31-60 days" if days <= 60 else
            "60+ days"
        )
        invoices.append({**order, "days_outstanding": days,
                          "aging_bucket": bucket, "overdue": days > 7})

    aging: dict = {}
    for inv in invoices:
        b = inv["aging_bucket"]
        aging.setdefault(b, {"count": 0, "total": 0.0})
        aging[b]["count"] += 1
        aging[b]["total"] += float(inv.get("total", 0))

    return {
        "invoices": invoices,
        "total_outstanding": sum(float(i.get("total", 0)) for i in invoices),
        "overdue_count": sum(1 for i in invoices if i["overdue"]),
        "aging_summary": aging,
    }


# ==================== GENERAL LEDGER ====================

@router.get("/accounts/ledger")
async def get_ledger(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    entry_type: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)

    cutoff_end = (end_date + "T23:59:59") if end_date else None
    order_q = {"status": "completed"}
    exp_q, dep_q, tr_q, po_q = {}, {}, {}, {}

    if start_date and end_date:
        order_q["created_at"] = {"$gte": start_date, "$lte": cutoff_end}
        exp_q["date"] = {"$gte": start_date, "$lte": end_date}
        dep_q["date"] = {"$gte": start_date, "$lte": end_date}
        tr_q["date"]  = {"$gte": start_date, "$lte": end_date}
        po_q["created_at"] = {"$gte": start_date, "$lte": cutoff_end}

    entries = []

    if not entry_type or entry_type == "sales":
        orders = await db.orders.find(order_q, {"_id": 0, "id": 1, "created_at": 1, "total": 1, "order_number": 1, "payment_method": 1}).to_list(2000)
        for o in orders:
            entries.append({
                "date": str(o.get("created_at", ""))[:10],
                "type": "sales",
                "description": f"Sale #{o.get('order_number', str(o.get('id',''))[:8])}",
                "reference": o.get("payment_method", ""),
                "debit": 0.0,
                "credit": float(o.get("total", 0)),
            })

    if not entry_type or entry_type == "expense":
        for e in await db.expenses.find(exp_q, {"_id": 0}).to_list(2000):
            entries.append({
                "date": str(e.get("date", ""))[:10],
                "type": "expense",
                "description": e.get("description", e.get("category", "")),
                "reference": e.get("category", ""),
                "debit": float(e.get("amount", 0)),
                "credit": 0.0,
            })

    if not entry_type or entry_type == "deposit":
        for d in await db.deposits.find(dep_q, {"_id": 0}).to_list(2000):
            entries.append({
                "date": str(d.get("date", ""))[:10],
                "type": "deposit",
                "description": d.get("description", d.get("category", "")),
                "reference": d.get("payment_method", ""),
                "debit": 0.0,
                "credit": float(d.get("amount", 0)),
            })

    if not entry_type or entry_type == "transfer":
        for t in await db.transfers.find(tr_q, {"_id": 0}).to_list(2000):
            entries.append({
                "date": str(t.get("date", ""))[:10],
                "type": "transfer",
                "description": f"Transfer {t.get('from_account','')} → {t.get('to_account','')}",
                "reference": t.get("reference", ""),
                "debit": float(t.get("amount", 0)),
                "credit": float(t.get("amount", 0)),
            })

    if not entry_type or entry_type == "purchase":
        for p in await db.purchase_orders.find(po_q, {"_id": 0, "id": 1, "created_at": 1, "total_amount": 1, "po_number": 1, "supplier_name": 1}).to_list(2000):
            entries.append({
                "date": str(p.get("created_at", ""))[:10],
                "type": "purchase",
                "description": f"PO #{p.get('po_number', str(p.get('id',''))[:8])} — {p.get('supplier_name', '')}",
                "reference": p.get("po_number", ""),
                "debit": float(p.get("total_amount", 0)),
                "credit": 0.0,
            })

    entries.sort(key=lambda x: x["date"])
    running = 0.0
    for e in entries:
        running += e["credit"] - e["debit"]
        e["balance"] = round(running, 2)

    return {
        "entries": entries,
        "total_debits": round(sum(e["debit"] for e in entries), 2),
        "total_credits": round(sum(e["credit"] for e in entries), 2),
        "net_balance": round(running, 2),
    }


# ==================== BALANCE SHEET ====================

@router.get("/accounts/balance-sheet")
async def get_balance_sheet(
    as_of: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    cutoff = (as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    dep_pipe  = [{"$match": {"date": {"$lte": cutoff}}}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]
    exp_pipe  = [{"$match": {"date": {"$lte": cutoff}}}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]
    sal_pipe  = [{"$match": {"status": "completed", "created_at": {"$lte": cutoff + "T23:59:59"}}}, {"$group": {"_id": None, "t": {"$sum": "$total"}}}]
    stock_pipe = [
        {"$lookup": {"from": "products", "localField": "product_id", "foreignField": "id", "as": "p"}},
        {"$unwind": {"path": "$p", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": None, "v": {"$sum": {"$multiply": ["$quantity", {"$ifNull": ["$p.cost_price", 0]}]}}}}
    ]
    ar_pipe   = [{"$match": {"status": {"$in": ["held", "pending"]}}}, {"$group": {"_id": None, "t": {"$sum": "$total"}}}]
    ap_pipe   = [{"$match": {"status": {"$in": ["pending", "ordered"]}}}, {"$group": {"_id": None, "t": {"$sum": "$total_amount"}}}]

    dep_r, exp_r, sal_r, stk_r, ar_r, ap_r = await asyncio.gather(
        db.deposits.aggregate(dep_pipe).to_list(1),
        db.expenses.aggregate(exp_pipe).to_list(1),
        db.orders.aggregate(sal_pipe).to_list(1),
        db.stock.aggregate(stock_pipe).to_list(1),
        db.orders.aggregate(ar_pipe).to_list(1),
        db.purchase_orders.aggregate(ap_pipe).to_list(1),
    )

    sales_total      = sal_r[0]["t"] if sal_r else 0
    deposits_total   = dep_r[0]["t"] if dep_r else 0
    expenses_total   = exp_r[0]["t"] if exp_r else 0
    inventory_value  = stk_r[0]["v"] if stk_r else 0
    receivables      = ar_r[0]["t"]  if ar_r  else 0
    accounts_payable = ap_r[0]["t"]  if ap_r  else 0

    cash = sales_total + deposits_total - expenses_total
    total_assets = max(cash, 0) + inventory_value + receivables
    equity = total_assets - accounts_payable

    return {
        "as_of": cutoff,
        "assets": {
            "cash_and_equivalents": round(cash, 2),
            "inventory": round(inventory_value, 2),
            "accounts_receivable": round(receivables, 2),
            "total": round(total_assets, 2),
        },
        "liabilities": {
            "accounts_payable": round(accounts_payable, 2),
            "total": round(accounts_payable, 2),
        },
        "equity": {
            "retained_earnings": round(equity, 2),
            "total": round(equity, 2),
        },
        "total_liabilities_and_equity": round(accounts_payable + equity, 2),
    }


# ==================== BANK RECONCILIATION ====================

@router.get("/accounts/bank-statements")
async def get_bank_statements(
    period: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    q = {"period": period} if period else {}
    return await db.bank_statements.find(q, {"_id": 0}).sort("date", -1).to_list(500)


@router.post("/accounts/bank-statements")
async def create_bank_statement(data: dict, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    date_str = data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    entry = {
        "id": str(uuid.uuid4()),
        "date": date_str,
        "description": data.get("description", ""),
        "amount": float(data.get("amount", 0)),
        "type": data.get("type", "credit"),
        "period": date_str[:7],
        "reference": data.get("reference", ""),
        "reconciled": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.id,
    }
    await db.bank_statements.insert_one(entry)
    entry.pop("_id", None)
    return entry


@router.delete("/accounts/bank-statements/{entry_id}")
async def delete_bank_statement(entry_id: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    res = await db.bank_statements.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Deleted"}


# ==================== BUDGETING ====================

@router.get("/accounts/budgets")
async def get_budgets(
    period: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    q = {"period": period} if period else {}
    budgets = await db.budgets.find(q, {"_id": 0}).sort([("period", -1), ("category", 1)]).to_list(500)

    if period:
        year, month = int(period[:4]), int(period[5:7])
        last_day = calendar.monthrange(year, month)[1]
        start_d  = f"{period}-01"
        end_d    = f"{period}-{last_day:02d}"
        cutoff   = end_d + "T23:59:59"

        exp_pipe = [
            {"$match": {"date": {"$gte": start_d, "$lte": end_d}}},
            {"$group": {"_id": "$category", "actual": {"$sum": "$amount"}}}
        ]
        dep_pipe = [
            {"$match": {"date": {"$gte": start_d, "$lte": end_d}}},
            {"$group": {"_id": "$category", "actual": {"$sum": "$amount"}}}
        ]
        sal_pipe = [
            {"$match": {"status": "completed", "created_at": {"$gte": start_d, "$lte": cutoff}}},
            {"$group": {"_id": None, "actual": {"$sum": "$total"}}}
        ]

        exp_r, dep_r, sal_r = await asyncio.gather(
            db.expenses.aggregate(exp_pipe).to_list(100),
            db.deposits.aggregate(dep_pipe).to_list(100),
            db.orders.aggregate(sal_pipe).to_list(1),
        )

        actuals = {}
        for e in exp_r:
            actuals[f"expense:{e['_id']}"] = e["actual"]
        for d in dep_r:
            actuals[f"deposit:{d['_id']}"] = d["actual"]
        if sal_r:
            actuals["revenue:Sales Revenue"] = sal_r[0]["actual"]

        for b in budgets:
            key = f"{b.get('budget_type','expense')}:{b.get('category','')}"
            b["actual"] = round(actuals.get(key, 0), 2)
            b["variance"] = round(b["actual"] - b.get("budget_amount", 0), 2)

    return budgets


@router.post("/accounts/budgets")
async def save_budget(data: dict, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    period      = data.get("period", "")
    category    = data.get("category", "")
    budget_type = data.get("budget_type", "expense")
    amount      = float(data.get("budget_amount", 0))

    existing = await db.budgets.find_one(
        {"period": period, "category": category, "budget_type": budget_type}, {"_id": 0}
    )
    if existing:
        await db.budgets.update_one(
            {"period": period, "category": category, "budget_type": budget_type},
            {"$set": {"budget_amount": amount}}
        )
        return {**existing, "budget_amount": amount}

    entry = {
        "id": str(uuid.uuid4()),
        "period": period,
        "category": category,
        "budget_type": budget_type,
        "budget_amount": amount,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.id,
    }
    await db.budgets.insert_one(entry)
    entry.pop("_id", None)
    return entry


@router.delete("/accounts/budgets/{budget_id}")
async def delete_budget(budget_id: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    res = await db.budgets.delete_one({"id": budget_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"message": "Deleted"}


# ==================== PAYROLL ====================

@router.get("/accounts/payroll")
async def get_payroll(
    period: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    require_admin(current_user)
    q = {"period": period} if period else {}
    return await db.payroll_entries.find(q, {"_id": 0}).sort([("period", -1), ("employee_name", 1)]).to_list(500)


@router.post("/accounts/payroll")
async def create_payroll_entry(data: dict, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    basic      = float(data.get("basic_pay", 0))
    allowances = float(data.get("allowances", 0))
    deductions = float(data.get("deductions", 0))
    entry = {
        "id": str(uuid.uuid4()),
        "employee_name":  data.get("employee_name", ""),
        "employee_id":    data.get("employee_id", ""),
        "period":         data.get("period", ""),
        "basic_pay":      basic,
        "allowances":     allowances,
        "deductions":     deductions,
        "net_pay":        round(basic + allowances - deductions, 2),
        "payment_method": data.get("payment_method", "bank transfer"),
        "notes":          data.get("notes", ""),
        "status":         "pending",
        "created_at":     datetime.now(timezone.utc).isoformat(),
        "created_by":     current_user.id,
    }
    await db.payroll_entries.insert_one(entry)
    entry.pop("_id", None)
    return entry


@router.patch("/accounts/payroll/{entry_id}/pay")
async def mark_payroll_paid(entry_id: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    res = await db.payroll_entries.update_one(
        {"id": entry_id},
        {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Marked as paid"}


@router.delete("/accounts/payroll/{entry_id}")
async def delete_payroll_entry(entry_id: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    res = await db.payroll_entries.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Deleted"}


# ==================== CURRENCIES ====================

@router.get("/accounts/currencies")
async def get_currencies(current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    return await db.currency_rates.find({}, {"_id": 0}).sort("code", 1).to_list(100)


@router.put("/accounts/currencies/{code}")
async def upsert_currency_rate(code: str, data: dict, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    code = code.upper()
    await db.currency_rates.update_one(
        {"code": code},
        {"$set": {
            "code":       code,
            "name":       data.get("name", code),
            "symbol":     data.get("symbol", code),
            "rate":       float(data.get("rate", 1)),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.id,
        }},
        upsert=True
    )
    result = await db.currency_rates.find_one({"code": code}, {"_id": 0})
    return result


@router.delete("/accounts/currencies/{code}")
async def delete_currency(code: str, current_user: User = Depends(get_current_user)):
    require_admin(current_user)
    await db.currency_rates.delete_one({"code": code.upper()})
    return {"message": "Deleted"}
