from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timedelta

from database import db
from models import User, Table, TableCreate, TableTransferRequest
from auth import get_current_user

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

    # Backfill waiter_id/waiter_name for occupied tables that pre-date the fix
    for table in tables:
        if table.get("status") == "occupied" and not table.get("waiter_id") and table.get("current_order_id"):
            order = await db.orders.find_one(
                {"id": table["current_order_id"]},
                {"_id": 0, "created_by": 1, "created_by_name": 1}
            )
            if order and order.get("created_by"):
                table["waiter_id"]   = order["created_by"]
                table["waiter_name"] = order.get("created_by_name", "")
                await db.tables.update_one(
                    {"id": table["id"]},
                    {"$set": {"waiter_id": table["waiter_id"], "waiter_name": table["waiter_name"]}}
                )

    return tables


@router.post("/tables", response_model=Table)
async def create_table(table_data: TableCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    table = Table(**table_data.model_dump())
    doc = table.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.tables.insert_one(doc)
    return table


@router.put("/tables/{table_id}")
async def update_table(table_id: str, table_data: dict, current_user: User = Depends(get_current_user)):
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

    # Delete all held/in-progress orders tied to this table
    await db.orders.delete_many({
        "table_id": table_id,
        "status": {"$in": ["held", "sent_to_kitchen", "pending"]}
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
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.tables.delete_one({"id": table_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"message": "Table deleted successfully"}
