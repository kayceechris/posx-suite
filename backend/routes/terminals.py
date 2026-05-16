from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")


# ==================== TERMINALS ====================

class Terminal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    outlet_id: str
    type: str = "pos"  # pos, bar, kitchen, etc
    description: Optional[str] = None
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TerminalCreate(BaseModel):
    name: str
    outlet_id: str
    type: str = "pos"
    description: Optional[str] = None


@router.get("/terminals")
async def get_terminals(outlet_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if outlet_id:
        query["outlet_id"] = outlet_id
    terminals = await db.terminals.find(query, {"_id": 0}).to_list(1000)
    return terminals


@router.post("/terminals")
async def create_terminal(data: TerminalCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    terminal = Terminal(**data.model_dump())
    doc = terminal.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.terminals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/terminals/{terminal_id}")
async def update_terminal(terminal_id: str, data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = {k: v for k, v in data.items() if k not in ("id", "created_at")}
    result = await db.terminals.update_one({"id": terminal_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Terminal not found")
    updated = await db.terminals.find_one({"id": terminal_id}, {"_id": 0})
    return updated


@router.delete("/terminals/{terminal_id}")
async def delete_terminal(terminal_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.terminals.delete_one({"id": terminal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Terminal not found")
    return {"message": "Terminal deleted"}


# ==================== PRODUCT TERMINAL PRICING ====================

class ProductTerminalPrice(BaseModel):
    product_id: str
    terminal_id: str
    price: float


@router.get("/product-prices")
async def get_product_prices(terminal_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    query = {}
    if terminal_id:
        query["terminal_id"] = terminal_id
    prices = await db.product_prices.find(query, {"_id": 0}).to_list(10000)
    return prices


@router.post("/product-prices")
async def set_product_price(data: ProductTerminalPrice, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    existing = await db.product_prices.find_one(
        {"product_id": data.product_id, "terminal_id": data.terminal_id}
    )
    if existing:
        await db.product_prices.update_one(
            {"product_id": data.product_id, "terminal_id": data.terminal_id},
            {"$set": {"price": data.price}}
        )
    else:
        await db.product_prices.insert_one(data.model_dump())
    return {"message": "Price set"}


@router.post("/product-prices/bulk")
async def set_bulk_prices(prices: List[ProductTerminalPrice], current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    for p in prices:
        await db.product_prices.update_one(
            {"product_id": p.product_id, "terminal_id": p.terminal_id},
            {"$set": {"price": p.price}},
            upsert=True
        )
    return {"message": f"{len(prices)} prices updated"}


# ==================== PRINTER GROUPS ====================

class PrinterGroup(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    printer_id: Optional[str] = None
    product_ids: List[str] = []
    category_ids: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PrinterGroupCreate(BaseModel):
    name: str
    printer_id: Optional[str] = None
    product_ids: List[str] = []
    category_ids: List[str] = []


@router.get("/printer-groups")
async def get_printer_groups(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    groups = await db.printer_groups.find({}, {"_id": 0}).to_list(1000)
    return groups


@router.post("/printer-groups")
async def create_printer_group(data: PrinterGroupCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    group = PrinterGroup(**data.model_dump())
    doc = group.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.printer_groups.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/printer-groups/{group_id}")
async def update_printer_group(group_id: str, data: PrinterGroupCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.printer_groups.update_one(
        {"id": group_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Printer group not found")
    updated = await db.printer_groups.find_one({"id": group_id}, {"_id": 0})
    return updated


@router.delete("/printer-groups/{group_id}")
async def delete_printer_group(group_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.printer_groups.delete_one({"id": group_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Printer group not found")
    return {"message": "Printer group deleted"}
