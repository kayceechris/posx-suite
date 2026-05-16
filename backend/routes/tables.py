from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from database import db
from models import User, Table, TableCreate, TableTransferRequest
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/tables")
async def get_tables(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    tables = await db.tables.find(query, {"_id": 0}).to_list(1000)
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

    if table.get("waiter_id") != current_user.id and current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized to release this table")

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


@router.delete("/tables/{table_id}")
async def delete_table(table_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.tables.delete_one({"id": table_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"message": "Table deleted successfully"}
