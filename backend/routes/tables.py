from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timedelta

from database import db
from models import User, Table, TableCreate, TableTransferRequest
from auth import get_current_user, has_perm

router = APIRouter(prefix="/api")

RESERVATION_LOCK_HOURS = 2  # lock tables this many hours before a reservation


async def _sync_reservation_locks():
    """
    Auto-lock tables that have a confirmed reservation starting within the next
    RESERVATION_LOCK_HOURS hours, and release tables whose reservation window
    has fully expired.  Called on every GET /tables so no external scheduler
    is needed.
    """
    now = datetime.now()
    lock_cutoff = now + timedelta(hours=RESERVATION_LOCK_HOURS)
    today = now.date().isoformat()

    # All confirmed reservations from today onwards
    confirmed = await db.reservations.find(
        {"status": "confirmed", "date": {"$gte": today}},
        {"_id": 0, "table_id": 1, "date": 1, "time": 1, "duration": 1}
    ).to_list(500)

    tables_to_lock = set()

    for res in confirmed:
        try:
            res_dt = datetime.fromisoformat(f"{res['date']}T{res['time']}:00")
            res_end = res_dt + timedelta(minutes=res.get("duration") or 90)
        except Exception:
            continue

        # Lock window: now ≤ reservation_start ≤ cutoff, and reservation hasn't ended yet
        if res_dt <= lock_cutoff and res_end > now:
            tables_to_lock.add(res["table_id"])

    # Lock available tables that enter the window
    for table_id in tables_to_lock:
        await db.tables.update_one(
            {"id": table_id, "status": "available"},
            {"$set": {"status": "reserved"}}
        )

    # Unlock reserved tables that no longer have an active upcoming reservation
    reserved_tables = await db.tables.find(
        {"status": "reserved"},
        {"_id": 0, "id": 1}
    ).to_list(500)

    for table in reserved_tables:
        if table["id"] not in tables_to_lock:
            await db.tables.update_one(
                {"id": table["id"]},
                {"$set": {"status": "available"}}
            )


@router.get("/tables")
async def get_tables(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    await _sync_reservation_locks()

    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    tables = await db.tables.find(query, {"_id": 0}).to_list(1000)

    # Reconcile EVERY table's denormalized waiter against its linked
    # order's locked created_by. Four cases:
    #   (a) No current_order_id at all → clear stale waiter info. An
    #       'available' table must not carry a ghost waiter name; that's
    #       why khadijat's POS view kept showing 'Waiter: Priscillia'.
    #   (b) current_order_id points at a settled order → release the
    #       table outright (status=available, clear linkage and waiter).
    #   (c) Order is genuinely active but the table's waiter has drifted
    #       from the order's created_by → overwrite the table's waiter
    #       with the order's owner. Order is the source of truth.
    #   (d) Always re-look up the user's CURRENT name from the users
    #       collection so renamed users show correctly and stale names
    #       on old orders can't leak through.
    # Batch the reads so a 50-table floor needs 2 round trips instead of
    # 150 serial finds. Then fire any required updates in parallel.
    order_ids = list({t.get("current_order_id") for t in tables if t.get("current_order_id")})
    orders_by_id = {}
    if order_ids:
        async for o in db.orders.find(
            {"id": {"$in": order_ids}},
            {"_id": 0, "id": 1, "created_by": 1, "status": 1},
        ):
            orders_by_id[o["id"]] = o

    needed_user_ids = set()
    for t in tables:
        o = orders_by_id.get(t.get("current_order_id"))
        if o and o.get("status") in ("held", "sent_to_kitchen", "pending") and o.get("created_by"):
            if t.get("waiter_id") != o["created_by"] or not t.get("waiter_name"):
                needed_user_ids.add(o["created_by"])
    user_name_by_id = {}
    if needed_user_ids:
        async for u in db.users.find(
            {"id": {"$in": list(needed_user_ids)}},
            {"_id": 0, "id": 1, "name": 1},
        ):
            user_name_by_id[u["id"]] = u.get("name") or ""

    updates = []   # (filter, $set, in_memory_mutation)
    for table in tables:
        order_id = table.get("current_order_id")
        if not order_id:
            if table.get("waiter_id") or table.get("waiter_name"):
                m = {"waiter_id": None, "waiter_name": None}
                updates.append(({"id": table["id"]}, {"$set": m}, m))
            continue
        order = orders_by_id.get(order_id)
        if not order or order.get("status") not in ("held", "sent_to_kitchen", "pending"):
            m = {"status": "available", "current_order_id": None, "waiter_id": None, "waiter_name": None}
            updates.append(({"id": table["id"]}, {"$set": m}, m))
            continue
        canonical_uid = order.get("created_by")
        if not canonical_uid:
            continue
        if table.get("waiter_id") == canonical_uid and table.get("waiter_name"):
            continue
        name = user_name_by_id.get(canonical_uid, "")
        m = {"waiter_id": canonical_uid, "waiter_name": name}
        if table.get("status") != "occupied":
            m["status"] = "occupied"
        updates.append(({"id": table["id"]}, {"$set": m}, m))

    if updates:
        import asyncio
        await asyncio.gather(*(db.tables.update_one(f, u) for f, u, _ in updates))
        for (f, _, m) in updates:
            for t in tables:
                if t["id"] == f["id"]:
                    t.update(m)
                    break

    return tables


@router.post("/tables", response_model=Table)
async def create_table(table_data: TableCreate, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "create_table", "manage_tables", "manage_floors"):
        raise HTTPException(status_code=403, detail="Not authorized")

    table = Table(**table_data.model_dump())
    doc = table.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.tables.insert_one(doc)
    return table


@router.put("/tables/{table_id}")
async def update_table(table_id: str, table_data: dict, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "edit_table", "manage_tables", "manage_floors"):
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.tables.update_one({"id": table_id}, {"$set": table_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")

    updated = await db.tables.find_one({"id": table_id}, {"_id": 0})
    return updated


@router.post("/tables/{table_id}/claim")
async def claim_table(table_id: str, current_user: User = Depends(get_current_user)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    if table["status"] == "reserved":
        raise HTTPException(status_code=400, detail="Table is reserved for an upcoming booking and cannot be seated until then")
    if table["status"] == "occupied" and table.get("waiter_id") != current_user.id:
        raise HTTPException(status_code=400, detail="Table is already occupied by another waiter")

    await db.tables.update_one(
        {"id": table_id},
        {"$set": {
            "status": "occupied",
            "waiter_id": current_user.id,
            "waiter_name": current_user.name
        }}
    )

    updated = await db.tables.find_one({"id": table_id}, {"_id": 0})
    return updated


@router.post("/tables/{table_id}/transfer")
async def transfer_table(table_id: str, transfer_data: TableTransferRequest, current_user: User = Depends(get_current_user)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    is_owner = table.get("waiter_id") == current_user.id
    is_privileged = current_user.role in ["admin", "manager"]
    if not is_owner and not is_privileged:
        raise HTTPException(status_code=403, detail="Not authorized to transfer this table")

    new_waiter_id = transfer_data.new_waiter_id
    if new_waiter_id == table.get("waiter_id"):
        raise HTTPException(status_code=400, detail="Table is already assigned to this waiter")

    new_waiter = await db.users.find_one({"id": new_waiter_id, "active": True}, {"_id": 0})
    if not new_waiter:
        raise HTTPException(status_code=404, detail="Waiter not found")
    if new_waiter["role"] not in ["waiter", "cashier", "manager"]:
        raise HTTPException(status_code=400, detail="Target user must be a waiter, cashier, or manager")

    await db.tables.update_one(
        {"id": table_id},
        {"$set": {
            "waiter_id": new_waiter_id,
            "waiter_name": new_waiter["name"]
        }}
    )

    if table.get("current_order_id"):
        await db.orders.update_one(
            {"id": table["current_order_id"]},
            {"$set": {"created_by": new_waiter_id}}
        )

    updated = await db.tables.find_one({"id": table_id}, {"_id": 0})
    return updated


@router.post("/tables/{table_id}/move-order")
async def move_order_to_table(table_id: str, data: dict, current_user: User = Depends(get_current_user)):
    """Move this table's active order to another (available) table. Guests
    moved seats — the order, its items, its waiter all travel with them.
    Source table is released; destination table is occupied by the order."""
    to_table_id = (data or {}).get("to_table_id")
    if not to_table_id or to_table_id == table_id:
        raise HTTPException(400, "to_table_id required and must differ from source")

    source = await db.tables.find_one({"id": table_id}, {"_id": 0})
    dest   = await db.tables.find_one({"id": to_table_id}, {"_id": 0})
    if not source or not dest:
        raise HTTPException(404, "Table not found")

    # Permission: privileged, or the table's current waiter, or a custom role
    # with the new move_order permission.
    is_privileged = current_user.role in ["admin", "manager"]
    is_owner      = source.get("waiter_id") == current_user.id
    has_perm      = "move_order" in (current_user.permissions or [])
    if not is_privileged and not is_owner and not has_perm:
        raise HTTPException(403, "Not authorized to move this order")

    order_id = source.get("current_order_id")
    if not order_id:
        raise HTTPException(400, "Source table has no active order to move")
    if dest.get("current_order_id"):
        raise HTTPException(400, f"Destination table {dest.get('number','?')} already has an active order")
    if dest.get("status") == "reserved":
        raise HTTPException(400, "Destination table is reserved and cannot be seated yet")
    if dest.get("merged_into"):
        raise HTTPException(400, "Destination table is merged into another — pick a different one")

    # Re-point the order at the new table
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"table_id": to_table_id, "table_number": dest.get("number")}},
    )

    # Source becomes available, destination takes over the order + waiter
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {
            "status": "available",
            "current_order_id": None,
            "waiter_id": None,
            "waiter_name": None,
        }},
    )
    await db.tables.update_one(
        {"id": to_table_id},
        {"$set": {
            "status": "occupied",
            "current_order_id": order_id,
            "waiter_id": source.get("waiter_id"),
            "waiter_name": source.get("waiter_name"),
        }},
    )

    updated_dest = await db.tables.find_one({"id": to_table_id}, {"_id": 0})
    return {
        "ok": True,
        "moved_to": updated_dest,
        "order_id": order_id,
    }


@router.post("/tables/{table_id}/release")
async def release_table(table_id: str, current_user: User = Depends(get_current_user)):
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    is_privileged = current_user.role in ["admin", "manager"]
    has_perm = "release_tables" in (current_user.permissions or [])
    is_own_table = table.get("waiter_id") == current_user.id

    if not is_privileged and not has_perm:
        raise HTTPException(status_code=403, detail="You don't have permission to release tables")
    if not is_privileged and not is_own_table:
        raise HTTPException(status_code=403, detail="You can only release tables assigned to you")

    # Delete every order tied to this table that wasn't actually paid for.
    # That covers held/sent_to_kitchen/pending status records AND any stray
    # 'completed' order that still has payment_method='pending' (i.e. nobody
    # paid for it — usually a leftover from a previous bug). Properly paid
    # orders stay for sales history.
    await db.orders.delete_many({
        "table_id": table_id,
        "$or": [
            {"status": {"$in": ["held", "sent_to_kitchen", "pending"]}},
            {"payment_method": "pending"},
            {"payment_method": {"$exists": False}},
            {"payment_method": None},
        ],
    })

    await db.tables.update_one(
        {"id": table_id},
        {"$set": {
            "status": "available",
            "waiter_id": None,
            "waiter_name": None,
            "current_order_id": None
        }}
    )

    updated = await db.tables.find_one({"id": table_id}, {"_id": 0})
    return updated


@router.post("/tables/{table_id}/merge")
async def merge_tables(table_id: str, data: dict, current_user: User = Depends(get_current_user)):
    """Merge another table into this one for a combined bill."""
    merge_table_id = data.get("merge_table_id")
    if not merge_table_id or merge_table_id == table_id:
        raise HTTPException(400, "Invalid merge_table_id")

    table_a = await db.tables.find_one({"id": table_id}, {"_id": 0})
    table_b = await db.tables.find_one({"id": merge_table_id}, {"_id": 0})
    if not table_a or not table_b:
        raise HTTPException(404, "Table not found")
    if table_b.get("merged_into"):
        raise HTTPException(400, f"Table {table_b['number']} is already merged with another table")

    await db.tables.update_one(
        {"id": merge_table_id},
        {"$set": {"merged_into": table_id}}
    )
    return {"ok": True}


@router.post("/tables/{table_id}/absorb-merged")
async def absorb_merged_table(table_id: str, data: dict, current_user: User = Depends(get_current_user)):
    """Move the merged table's order items into the primary table's current
    order, void the merged order, and release the merged table so it's free
    for new guests. The primary table keeps the entire combined bill."""
    merge_table_id = data.get("merge_table_id")
    if not merge_table_id or merge_table_id == table_id:
        raise HTTPException(400, "Invalid merge_table_id")

    primary = await db.tables.find_one({"id": table_id}, {"_id": 0})
    merged  = await db.tables.find_one({"id": merge_table_id}, {"_id": 0})
    if not primary or not merged:
        raise HTTPException(404, "Table not found")
    if merged.get("merged_into") != table_id:
        raise HTTPException(400, f"Table {merged['number']} is not merged into table {primary['number']}")

    merged_order_id = merged.get("current_order_id")
    primary_order_id = primary.get("current_order_id")

    if merged_order_id:
        merged_order = await db.orders.find_one({"id": merged_order_id}, {"_id": 0})
        if merged_order and merged_order.get("status") in ("held", "sent_to_kitchen", "pending"):
            merged_items = merged_order.get("items") or []
            if primary_order_id:
                # Combine into the primary order
                primary_order = await db.orders.find_one({"id": primary_order_id}, {"_id": 0})
                if primary_order:
                    combined = (primary_order.get("items") or []) + merged_items
                    subtotal = sum(float(i.get("total") or 0) for i in combined)
                    tax = float(primary_order.get("tax") or 0) + float(merged_order.get("tax") or 0)
                    discount = float(primary_order.get("discount") or 0) + float(merged_order.get("discount") or 0)
                    total = subtotal + tax - discount
                    await db.orders.update_one(
                        {"id": primary_order_id},
                        {"$set": {"items": combined, "subtotal": subtotal, "tax": tax, "discount": discount, "total": total}},
                    )
                # Void the merged order
                await db.orders.update_one(
                    {"id": merged_order_id},
                    {"$set": {"status": "voided", "void_reason": f"Absorbed into {primary['number']}'s bill"}},
                )
            else:
                # Primary has no current order — re-point the merged order at the primary
                await db.orders.update_one(
                    {"id": merged_order_id},
                    {"$set": {"table_id": table_id, "table_number": primary.get("number")}},
                )
                await db.tables.update_one(
                    {"id": table_id},
                    {"$set": {"current_order_id": merged_order_id, "status": "occupied"}},
                )

    # Release the merged table
    await db.tables.update_one(
        {"id": merge_table_id},
        {
            "$unset": {"merged_into": ""},
            "$set": {
                "status": "available",
                "current_order_id": None,
                "waiter_id": None,
                "waiter_name": None,
            },
        },
    )

    return {"ok": True, "absorbed_into": primary["number"]}


@router.post("/tables/{table_id}/unmerge")
async def unmerge_table(table_id: str, data: dict, current_user: User = Depends(get_current_user)):
    """Split a merged table back out — both tables remain occupied independently."""
    merge_table_id = data.get("merge_table_id")
    if not merge_table_id:
        raise HTTPException(400, "merge_table_id required")

    table_b = await db.tables.find_one({"id": merge_table_id}, {"_id": 0})
    if not table_b:
        raise HTTPException(404, "Table not found")

    await db.tables.update_one(
        {"id": merge_table_id},
        {"$unset": {"merged_into": ""}}
    )
    return {"ok": True}


@router.delete("/tables/{table_id}")
async def delete_table(table_id: str, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "delete_table", "manage_tables", "manage_floors"):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Wipe unpaid leftover orders tied to this table before removing the table itself.
    await db.orders.delete_many({
        "table_id": table_id,
        "$or": [
            {"status": {"$in": ["held", "sent_to_kitchen", "pending"]}},
            {"payment_method": "pending"},
            {"payment_method": {"$exists": False}},
            {"payment_method": None},
        ],
    })

    result = await db.tables.delete_one({"id": table_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"message": "Table deleted successfully"}
