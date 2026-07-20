from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from typing import List, Optional
from datetime import date, datetime, timedelta, timezone

from database import db
from models import User, Order, OrderCreate, SplitBill, SplitBillCreate
from auth import get_current_user, has_perm
from lib.email_service import send_new_order_email

router = APIRouter(prefix="/api")


async def _deduct_stock_for_order(items: list, outlet_id: str):
    """Deduct product stock. If a recipe exists for a product, also deduct its ingredients."""
    for item in items:
        pid = item["product_id"] if isinstance(item, dict) else item.product_id
        qty = item["quantity"] if isinstance(item, dict) else item.quantity
        await db.stock.update_one(
            {"product_id": pid, "outlet_id": outlet_id},
            {"$inc": {"quantity": -qty}}
        )
        # Recipe ingredient deduction
        recipe = await db.recipes.find_one({"product_id": pid}, {"_id": 0})
        if recipe:
            for ing in recipe.get("ingredients", []):
                if ing.get("product_id"):
                    deduct_qty = float(ing.get("quantity", 0)) * qty
                    await db.stock.update_one(
                        {"product_id": ing["product_id"], "outlet_id": outlet_id},
                        {"$inc": {"quantity": -deduct_qty}}
                    )


@router.post("/orders", response_model=Order)
async def create_order(order_data: OrderCreate, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    kitchen_statuses = ("held", "sent_to_kitchen", "pending")

    # ── Idempotency check ──────────────────────────────────────────────────
    # If the client passed an idempotency_key and we already created an
    # order with that key, return THAT order instead of making a new one.
    # This catches three duplicate scenarios that have been showing up in
    # the orders list with the same items / payment / time:
    #   1. Network retry — client POST timed out but the server succeeded,
    #      then the client retried and made a second order.
    #   2. Offline queue replay — both the live POST and the queued copy
    #      eventually reached the server.
    #   3. Rage-click that beat the modal's in-flight ref-guard by a
    #      handful of milliseconds.
    if order_data.idempotency_key:
        prior = await db.orders.find_one(
            {"idempotency_key": order_data.idempotency_key},
            {"_id": 0},
        )
        if prior:
            return Order(**prior)

    # ── Dedup against an existing SAME-USER active order on the same table ──
    # Two waiters opening the same table simultaneously, or the offline
    # queue replaying a 'send to kitchen' after the table already has a
    # held order, used to create a second order doc and orphan the first.
    # Only merge when the existing order belongs to the SAME current_user —
    # otherwise we'd be silently assigning a new waiter's items into the
    # previous waiter's order, which is exactly the 'table belongs to
    # Priscillia after khadijat hit Hold' glitch.
    if order_data.table_id and order_data.status in kitchen_statuses:
        table = await db.tables.find_one(
            {"id": order_data.table_id}, {"_id": 0, "current_order_id": 1, "waiter_id": 1, "waiter_name": 1}
        )
        existing_oid = (table or {}).get("current_order_id")
        if existing_oid:
            existing = await db.orders.find_one({"id": existing_oid}, {"_id": 0})
            if (existing
                    and existing.get("status") in kitchen_statuses
                    and existing.get("created_by") == current_user.id):
                # Merge by product_id so qty bumps collapse into the same line
                index = {}
                merged_items = []
                for it in (existing.get("items") or []):
                    pid = it.get("product_id")
                    if pid and pid not in index:
                        index[pid] = it
                        merged_items.append(it)
                    else:
                        merged_items.append(it)
                for it in order_data.items:
                    d = it.model_dump()
                    pid = d.get("product_id")
                    if pid and pid in index:
                        index[pid]["quantity"] = int(index[pid].get("quantity") or 0) + int(d.get("quantity") or 0)
                        index[pid]["total"]    = float(index[pid].get("price") or 0) * int(index[pid]["quantity"])
                    else:
                        merged_items.append(d)
                        if pid:
                            index[pid] = d
                # Recompute totals
                new_subtotal = sum(float(i.get("total") or (float(i.get("price") or 0) * int(i.get("quantity") or 0))) for i in merged_items)
                # Preserve original tax/discount rate proportions
                old_subtotal = float(existing.get("subtotal") or new_subtotal or 1)
                tax_ratio  = float(existing.get("tax") or 0) / old_subtotal if old_subtotal else 0
                disc_ratio = float(existing.get("discount") or 0) / old_subtotal if old_subtotal else 0
                new_tax  = round(new_subtotal * tax_ratio, 2)
                new_disc = round(new_subtotal * disc_ratio, 2)
                new_total = new_subtotal + new_tax - new_disc
                # Promote status if the incoming send is more advanced
                rank = {"pending": 0, "held": 1, "sent_to_kitchen": 2}
                cur_rank = rank.get(existing.get("status", "held"), 1)
                in_rank  = rank.get(order_data.status, 1)
                merged_status = order_data.status if in_rank > cur_rank else existing.get("status", "held")
                await db.orders.update_one(
                    {"id": existing_oid},
                    {"$set": {
                        "items":    merged_items,
                        "subtotal": new_subtotal,
                        "tax":      new_tax,
                        "discount": new_disc,
                        "total":    new_total,
                        "status":   merged_status,
                    }},
                )
                merged_doc = await db.orders.find_one({"id": existing_oid}, {"_id": 0})
                return Order(**merged_doc)

    count = await db.orders.count_documents({})
    order_number = f"ORD{count + 1:06d}"

    order = Order(
        **order_data.model_dump(),
        order_number=order_number,
        created_by=current_user.id,
        created_by_name=current_user.name,
        created_by_role=current_user.role,
    )

    # KDS board progress starts fresh whenever an order is created already
    # sent to the kitchen (e.g. Quick Send skipping the held step).
    if order.status == "sent_to_kitchen":
        order.kitchen_status = "new"
        order.kitchen_status_at = datetime.now(timezone.utc).isoformat()

    if order.status == "completed":
        await _deduct_stock_for_order(
            [{"product_id": i.product_id, "quantity": i.quantity} for i in order.items],
            order.outlet_id
        )
        if order.customer_id:
            await db.customers.update_one(
                {"id": order.customer_id},
                {"$inc": {"total_orders": 1, "total_spent": order.total}}
            )

    if order.table_id and order.status != "reservation_hold":
        # A reservation's pre-built draft (status "reservation_hold") must
        # never touch table state at creation time — it only claims the
        # table once activated (see lib/reservation_activation.py), so it
        # doesn't occupy the table for the present day.
        is_active = order.status in ("held", "sent_to_kitchen")
        existing_table = await db.tables.find_one(
            {"id": order.table_id}, {"_id": 0, "waiter_id": 1, "waiter_name": 1, "current_order_id": 1}
        ) or {}
        # The 'keep existing waiter' rule only applies when the table has an
        # actually-active order on it. Stale waiter info from a previous
        # sitting (order completed but table never released cleanly) must
        # not shadow the new waiter taking the table.
        prev_oid = existing_table.get("current_order_id")
        prev_is_active = False
        if prev_oid and prev_oid != order.id:
            prev = await db.orders.find_one({"id": prev_oid}, {"_id": 0, "status": 1, "created_by": 1})
            prev_is_active = bool(prev and prev.get("status") in ("held", "sent_to_kitchen", "pending"))
            # A table can only ever have ONE active order. Silently
            # repointing current_order_id at a brand-new order when the
            # table already has a genuinely active one from someone else
            # orphans the real order — it stays held/sent_to_kitchen
            # forever but nothing links to it from the table anymore, so
            # it vanishes from the Tables page and (for other staff) Held
            # Orders, only turning up later via the unfiltered Admin >
            # Orders list. Reject instead — this only happens when the
            # client's view of the table was stale (offline-sync race, a
            # second device), and the merge/dedup block above already
            # handles the legitimate 'same waiter, more items' case.
            if is_active and prev_is_active and prev.get("created_by") != current_user.id:
                raise HTTPException(
                    status_code=409,
                    detail="This table already has an active order from another staff member. Please reload the table.",
                )
        set_doc = {
            "status": "occupied" if is_active else "available",
            "current_order_id": order.id if is_active else None,
        }
        if is_active:
            if prev_is_active and existing_table.get("waiter_id"):
                # Real active order from someone else — keep them as owner.
                pass
            else:
                # Clean slate (no active prior order) — the new order's
                # creator becomes the table's waiter even if a stale name
                # is lingering on the table doc.
                set_doc["waiter_id"]   = current_user.id
                set_doc["waiter_name"] = current_user.name
        else:
            set_doc["waiter_id"] = None
            set_doc["waiter_name"] = None
        await db.tables.update_one({"id": order.table_id}, {"$set": set_doc})

    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.orders.insert_one(doc)
    if order.status == "completed":
        background_tasks.add_task(send_new_order_email, doc)
    return order


@router.put("/orders/{order_id}/complete")
async def complete_order(order_id: str, payment_method: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await _deduct_stock_for_order(order["items"], order["outlet_id"])

    if order.get("customer_id"):
        await db.customers.update_one(
            {"id": order["customer_id"]},
            {"$inc": {"total_orders": 1, "total_spent": order["total"]}}
        )

    if order.get("table_id"):
        await db.tables.update_one(
            {"id": order["table_id"]},
            {"$set": {
                "status": "available",
                "current_order_id": None,
                "waiter_id": None,
                "waiter_name": None,
            }}
        )
    if order.get("bar_tab_id"):
        await db.bar_tabs.update_one(
            {"id": order["bar_tab_id"]},
            {"$set": {"status": "closed", "current_order_id": None, "staff_id": None, "staff_name": None}}
        )

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": "completed", "payment_method": payment_method}}
    )

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated


@router.get("/orders")
async def get_orders(
    outlet_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    created_by: Optional[str] = None,
    order_number: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    if start_date and end_date:
        try:
            next_day = (date.fromisoformat(end_date[:10]) + timedelta(days=1)).isoformat()
        except ValueError:
            next_day = end_date
        query["created_at"] = {"$gte": start_date[:10], "$lt": next_day}
    if created_by:
        query["created_by"] = created_by
    if order_number:
        query["order_number"] = {"$regex": order_number, "$options": "i"}

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return orders


@router.get("/orders/held/list")
async def get_held_orders(current_user: User = Depends(get_current_user)):
    """Return held orders. Admins/managers and cashiers with view_all_orders permission
    see every held order; all other roles see only their own."""
    can_see_all = (
        current_user.role in ("admin", "manager") or
        (current_user.role == "cashier" and
         current_user.permissions and "view_all_orders" in current_user.permissions)
    )
    # "pending" is treated as a third active-order state everywhere else in
    # this file (kitchen_statuses, table reconciliation, void/split checks,
    # etc.) — omitting it here silently hid any order that ended up at that
    # status, findable only via the unfiltered Admin > Orders list.
    query = {"status": {"$in": ["held", "sent_to_kitchen", "pending"]}}
    if not can_see_all:
        query["created_by"] = current_user.id
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders


@router.get("/orders/kitchen/list")
async def get_kitchen_orders(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Orders actively in the kitchen, for the KDS board. Unlike
    /orders/held/list this is never scoped to the current user — kitchen
    staff need to see every waiter's tickets, not just their own. Sorted
    oldest-first (FIFO) to match how a kitchen queue is read.

    Also includes orders that reached the kitchen and were then voided
    (table/bar-tab released, or voided from Held Orders) but haven't been
    dismissed yet — release_table/release_bar_tab soft-void these instead
    of deleting them specifically so the board can flag them as cancelled
    rather than the card just silently disappearing on the next poll."""
    if not has_perm(current_user, "view_kds_kitchen", "view_kds_bar"):
        raise HTTPException(status_code=403, detail="You don't have permission to view the kitchen display")
    query = {
        "$or": [
            {"status": "sent_to_kitchen"},
            {"status": "voided", "kitchen_status": {"$ne": None}, "kds_dismissed": {"$ne": True}},
        ]
    }
    if outlet_id:
        query = {"$and": [query, {"outlet_id": outlet_id}]}
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", 1).to_list(500)
    return orders


@router.get("/orders/{order_id}")
async def get_order(order_id: str, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.put("/orders/{order_id}")
async def update_order(order_id: str, order_data: dict, current_user: User = Depends(get_current_user)):
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")

    # Lock identity fields — these belong to whoever first created the order
    # (the waiter). Admin / manager edits must NOT overwrite them, otherwise
    # the order's apparent owner changes when a manager merely adjusts items
    # or sends to kitchen on behalf of the original waiter.
    _LOCKED = (
        "id", "created_at", "order_number",
        "created_by", "created_by_name", "created_by_role",
    )
    update_fields = {k: v for k, v in order_data.items() if k not in _LOCKED}

    # Voiding a held/in-progress order requires explicit permission
    if update_fields.get("status") == "voided" and existing.get("status") in ("held", "sent_to_kitchen", "pending"):
        is_privileged = current_user.role in ["admin", "manager"]
        has_perm = "delete_held_order_items" in (current_user.permissions or [])
        if not is_privileged and not has_perm:
            raise HTTPException(status_code=403, detail="You don't have permission to void held orders")

    # The POS always re-declares status:"sent_to_kitchen" on every
    # Send-to-Kitchen click — first send AND adding more items to an order
    # already in the kitchen. Piggyback on that exact signal to reset the
    # KDS board progress, so newly added items always surface at the front
    # of the board again instead of staying buried in "Completed".
    if update_fields.get("status") == "sent_to_kitchen":
        update_fields["kitchen_status"] = "new"

    # Stamp the moment kitchen_status changes (covers both the auto-reset
    # above and an explicit KDS move) so the board can time how long an
    # order has sat in "preparing".
    if "kitchen_status" in update_fields:
        update_fields["kitchen_status_at"] = datetime.now(timezone.utc).isoformat()

    await db.orders.update_one({"id": order_id}, {"$set": update_fields})

    # Handle status transitions
    if update_fields.get("status") == "held" and existing.get("table_id"):
        # The held order's owner (existing.created_by, locked) is the
        # canonical waiter — write that to the table's denormalized
        # waiter fields so the floor view / receipts always match the
        # order. We do NOT default to current_user (admin editing the
        # order shouldn't take it over), but we DO override stale name
        # data from a previous sitting.
        owner_id   = existing.get("created_by")
        owner_name = existing.get("created_by_name") or ""
        set_doc = {
            "status": "occupied",
            "current_order_id": order_id,
        }
        if owner_id:
            set_doc["waiter_id"]   = owner_id
            set_doc["waiter_name"] = owner_name
        await db.tables.update_one({"id": existing["table_id"]}, {"$set": set_doc})

    # Stock + customer credit only fire on the FIRST transition from
    # held/sent_to_kitchen → completed, to avoid double-counting if the
    # client posts the same completion twice.
    if update_fields.get("status") == "completed" and existing.get("status") in ("held", "sent_to_kitchen", "pending"):
        items = update_fields.get("items", existing.get("items", []))
        outlet_id = existing.get("outlet_id", "")
        await _deduct_stock_for_order(items, outlet_id)
        customer_id = update_fields.get("customer_id") or existing.get("customer_id")
        if customer_id:
            total = update_fields.get("total", existing.get("total", 0))
            await db.customers.update_one(
                {"id": customer_id},
                {"$inc": {"total_orders": 1, "total_spent": total}}
            )

    # Table / bar-tab release runs UNCONDITIONALLY when status becomes
    # completed or voided. The previous behaviour only released when the
    # OLD status was in a small whitelist, so if the order had drifted
    # into 'pending' or anything unexpected, the table stayed occupied
    # and the user had to hit Complete twice. Release is idempotent so
    # firing it on a repeat completion is harmless.
    if update_fields.get("status") in ("completed", "voided"):
        if existing.get("table_id"):
            await db.tables.update_one(
                {"id": existing["table_id"]},
                {"$set": {
                    "status": "available",
                    "current_order_id": None,
                    "waiter_id": None,
                    "waiter_name": None,
                }}
            )
        if existing.get("bar_tab_id"):
            await db.bar_tabs.update_one(
                {"id": existing["bar_tab_id"]},
                {"$set": {"status": "closed", "current_order_id": None, "staff_id": None, "staff_name": None}}
            )

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated


@router.delete("/orders/{order_id}")
async def delete_order(order_id: str, current_user: User = Depends(get_current_user)):
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")

    is_privileged = current_user.role in ["admin", "manager"]
    has_perm = "delete_held_order_items" in (current_user.permissions or [])
    if not is_privileged and not has_perm:
        raise HTTPException(status_code=403, detail="You don't have permission to delete held orders")
    # Release table if order was holding one — clear waiter too
    if existing.get("table_id"):
        await db.tables.update_one(
            {"id": existing["table_id"]},
            {"$set": {
                "status": "available",
                "current_order_id": None,
                "waiter_id": None,
                "waiter_name": None,
            }}
        )
    if existing.get("bar_tab_id"):
        await db.bar_tabs.update_one(
            {"id": existing["bar_tab_id"]},
            {"$set": {"status": "closed", "current_order_id": None, "staff_id": None, "staff_name": None}}
        )
    await db.orders.delete_one({"id": order_id})
    return {"message": "Order deleted"}


# ==================== SPLIT BILL ROUTES ====================

@router.post("/orders/{order_id}/split")
async def split_bill(order_id: str, split_data: SplitBillCreate, current_user: User = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    split_bills = []
    for idx, split in enumerate(split_data.splits, 1):
        split_bill = SplitBill(
            original_order_id=order_id,
            split_number=idx,
            amount=split["amount"],
            payment_method=split["payment_method"]
        )
        doc = split_bill.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.split_bills.insert_one(doc)
        split_bills.append(split_bill)

    return {"message": "Bill split successfully", "splits": split_bills}


@router.post("/orders/{order_id}/split/{split_id}/pay")
async def pay_split(order_id: str, split_id: str, current_user: User = Depends(get_current_user)):
    result = await db.split_bills.update_one(
        {"id": split_id, "original_order_id": order_id},
        {"$set": {"paid": True}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Split bill not found")

    all_splits = await db.split_bills.find({"original_order_id": order_id}, {"_id": 0}).to_list(100)
    all_paid = all(split.get("paid", False) for split in all_splits)

    if all_paid:
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"status": "completed"}}
        )

        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        await _deduct_stock_for_order(order["items"], order["outlet_id"])

        if order.get("table_id"):
            await db.tables.update_one(
                {"id": order["table_id"]},
                {"$set": {
                    "status": "available",
                    "current_order_id": None,
                    "waiter_id": None,
                    "waiter_name": None,
                }}
            )

        return {"message": "Split paid. Order completed!"}

    return {"message": "Split paid successfully"}


@router.get("/orders/{order_id}/splits")
async def get_order_splits(order_id: str, current_user: User = Depends(get_current_user)):
    splits = await db.split_bills.find({"original_order_id": order_id}, {"_id": 0}).to_list(100)
    return splits


# ==================== RECALL + ITEM-LEVEL SPLIT ====================

async def _restock_for_order(items: list, outlet_id: str):
    """Inverse of _deduct_stock_for_order — used when a completed order is
    recalled. Adds product stock back and reverses recipe ingredient deductions."""
    for item in items:
        pid = item["product_id"] if isinstance(item, dict) else item.product_id
        qty = item["quantity"] if isinstance(item, dict) else item.quantity
        await db.stock.update_one(
            {"product_id": pid, "outlet_id": outlet_id},
            {"$inc": {"quantity": qty}},
        )
        recipe = await db.recipes.find_one({"product_id": pid}, {"_id": 0})
        if recipe:
            for ing in recipe.get("ingredients", []):
                if ing.get("product_id"):
                    restore_qty = float(ing.get("quantity", 0)) * qty
                    await db.stock.update_one(
                        {"product_id": ing["product_id"], "outlet_id": outlet_id},
                        {"$inc": {"quantity": restore_qty}},
                    )


def _is_privileged_or_perm(user: User, *perms: str) -> bool:
    if user.role in ("admin", "manager"):
        return True
    user_perms = set(user.permissions or [])
    return any(p in user_perms for p in perms)


@router.post("/orders/{order_id}/recall")
async def recall_order(order_id: str, current_user: User = Depends(get_current_user)):
    """Pull a completed order back to 'held' so it can be edited/updated.
    Reverses stock deductions, customer purchase stats, and re-attaches the
    table (when the table is free). The order's original creator (waiter)
    is preserved — recalling does NOT change ownership."""
    if not _is_privileged_or_perm(current_user, "recall_order", "edit_completed_order"):
        raise HTTPException(status_code=403, detail="Not authorized to recall completed orders")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") != "completed":
        raise HTTPException(status_code=400, detail=f"Only completed orders can be recalled (status={order.get('status')})")

    # Reverse stock + customer stats from completion
    await _restock_for_order(order.get("items", []), order.get("outlet_id", ""))
    if order.get("customer_id"):
        await db.customers.update_one(
            {"id": order["customer_id"]},
            {"$inc": {"total_orders": -1, "total_spent": -float(order.get("total") or 0)}},
        )

    # Flip the order back to 'held'
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": "held", "payment_method": ""}},
    )

    # Re-attach to its table if the table is free (don't steal it back from
    # whoever may be using the table now).
    if order.get("table_id"):
        table = await db.tables.find_one(
            {"id": order["table_id"]}, {"_id": 0, "status": 1, "current_order_id": 1, "waiter_id": 1}
        )
        if table and not table.get("current_order_id"):
            set_doc = {
                "status": "occupied",
                "current_order_id": order_id,
            }
            # If the table has no waiter (just freed), restore the order's
            # original waiter so the table shows the right name.
            if not table.get("waiter_id") and order.get("created_by"):
                set_doc["waiter_id"]   = order["created_by"]
                set_doc["waiter_name"] = order.get("created_by_name", "")
            await db.tables.update_one({"id": order["table_id"]}, {"$set": set_doc})

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated


@router.post("/orders/{order_id}/split-items")
async def split_items(order_id: str, payload: dict, current_user: User = Depends(get_current_user)):
    """Item-level split at checkout. The caller picks which items / quantities
    to settle now; the new payment becomes its own completed order and the
    remainder stays held on the table.

    Payload: { "paid_items": [{"product_id", "quantity", "price", "product_name"}],
               "payment_method": "cash" | "card" | ... }
    Returns: { "paid_order": <new completed order>, "remaining_order": <updated held order> | null }
    """
    if not _is_privileged_or_perm(current_user, "split_bill", "process_payment", "process_sales"):
        raise HTTPException(status_code=403, detail="Not authorized to split bills")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") not in ("held", "sent_to_kitchen", "pending"):
        raise HTTPException(status_code=400, detail="Order is not open for split payment")

    paid_items_in = (payload or {}).get("paid_items") or []
    payment_method = ((payload or {}).get("payment_method") or "cash").strip() or "cash"
    if not paid_items_in:
        raise HTTPException(status_code=400, detail="At least one item must be selected to pay")

    # Validate that paid_items is a subset of order.items by quantity.
    remaining_by_pid: dict = {}
    for it in order.get("items", []):
        pid = it.get("product_id")
        if not pid:
            continue
        remaining_by_pid.setdefault(pid, []).append(dict(it))

    paid_resolved = []
    for req in paid_items_in:
        pid = req.get("product_id")
        qty = int(req.get("quantity") or 0)
        if not pid or qty <= 0:
            continue
        bucket = remaining_by_pid.get(pid) or []
        if not bucket:
            raise HTTPException(status_code=400, detail=f"Item {pid} not in order")
        # Deduct from one or more existing item rows for this product
        need = qty
        for row in bucket:
            if need <= 0:
                break
            take = min(need, int(row.get("quantity") or 0))
            if take <= 0:
                continue
            row["quantity"] = int(row.get("quantity") or 0) - take
            # Recompute the row's stored total proportionally
            if row.get("price") is not None and row.get("quantity") is not None:
                row["total"] = float(row.get("price") or 0) * row["quantity"]
            need -= take
        if need > 0:
            raise HTTPException(status_code=400, detail=f"Requested quantity exceeds remaining for product {pid}")
        # Build the paid line
        price = float(req.get("price") or 0)
        line_total = price * qty
        paid_resolved.append({
            "product_id":   pid,
            "product_name": req.get("product_name") or (bucket[0].get("product_name") if bucket else ""),
            "quantity":     qty,
            "price":        price,
            "total":        line_total,
            "category_id":  req.get("category_id") or (bucket[0].get("category_id") if bucket else None),
            "note":         req.get("note") or None,
        })

    # Flatten the (possibly-mutated) remainder buckets back into a list,
    # dropping rows whose quantity dropped to zero.
    remaining_items = []
    for it in order.get("items", []):
        pid = it.get("product_id")
        bucket = remaining_by_pid.get(pid) or []
        if not bucket:
            remaining_items.append(it)
            continue
        row = bucket.pop(0)
        if int(row.get("quantity") or 0) > 0:
            remaining_items.append(row)

    # Recompute totals from per-line totals (keep tax/discount proportional)
    def _sum(items):
        return sum(float(i.get("total") or (float(i.get("price") or 0) * int(i.get("quantity") or 0))) for i in items)

    paid_subtotal = _sum(paid_resolved)
    remain_subtotal = _sum(remaining_items)
    orig_subtotal = float(order.get("subtotal") or (paid_subtotal + remain_subtotal) or 1)
    paid_share = paid_subtotal / orig_subtotal if orig_subtotal else 0
    remain_share = 1 - paid_share

    orig_tax = float(order.get("tax") or 0)
    orig_disc = float(order.get("discount") or 0)

    paid_tax  = round(orig_tax  * paid_share,  2)
    paid_disc = round(orig_disc * paid_share,  2)
    paid_total = paid_subtotal + paid_tax - paid_disc

    # Build the new completed order — keep the original waiter as creator.
    count = await db.orders.count_documents({})
    order_number = f"ORD{count + 1:06d}"
    paid_order = {
        "id":              __import__("uuid").uuid4().hex,
        "order_number":    order_number,
        "outlet_id":       order.get("outlet_id", ""),
        "terminal_id":     order.get("terminal_id"),
        "table_id":        order.get("table_id"),
        "table_number":    order.get("table_number"),
        "bar_tab_id":      order.get("bar_tab_id"),
        "customer_id":     order.get("customer_id"),
        "customer_name":   order.get("customer_name"),
        "items":           paid_resolved,
        "subtotal":        paid_subtotal,
        "tax":             paid_tax,
        "discount":        paid_disc,
        "total":           paid_total,
        "payment_method":  payment_method,
        "status":          "completed",
        "service_mode":    order.get("service_mode", "quick_service"),
        # Owner = original creator (the waiter who took the order)
        "created_by":      order.get("created_by", current_user.id),
        "created_by_name": order.get("created_by_name", current_user.name),
        "created_by_role": order.get("created_by_role", current_user.role),
        "created_at":      __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "split_of":        order_id,
    }
    await db.orders.insert_one(paid_order)
    await _deduct_stock_for_order(paid_resolved, paid_order["outlet_id"])
    if paid_order.get("customer_id"):
        await db.customers.update_one(
            {"id": paid_order["customer_id"]},
            {"$inc": {"total_orders": 1, "total_spent": paid_total}},
        )

    # Update / complete the original order with the remainder
    if remaining_items:
        remain_total = remain_subtotal + round(orig_tax * remain_share, 2) - round(orig_disc * remain_share, 2)
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "items":    remaining_items,
                "subtotal": remain_subtotal,
                "tax":      round(orig_tax * remain_share, 2),
                "discount": round(orig_disc * remain_share, 2),
                "total":    remain_total,
            }},
        )
        # Table stays occupied with the held remainder — nothing to release
        remaining_doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    else:
        # Nothing left — close out the original and release the table
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"status": "completed", "items": []}},
        )
        if order.get("table_id"):
            await db.tables.update_one(
                {"id": order["table_id"]},
                {"$set": {"status": "available", "current_order_id": None, "waiter_id": None, "waiter_name": None}},
            )
        remaining_doc = None

    paid_order.pop("_id", None)
    return {"paid_order": paid_order, "remaining_order": remaining_doc}
