from fastapi import APIRouter, HTTPException, Depends
from typing import List

from database import db
from models import User, Customer, CustomerCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/customers", response_model=List[Customer])
async def get_customers(current_user: User = Depends(get_current_user)):
    customers = await db.customers.find({}, {"_id": 0}).to_list(1000)
    return [Customer(**c) for c in customers]


@router.post("/customers", response_model=Customer)
async def create_customer(customer_data: CustomerCreate, current_user: User = Depends(get_current_user)):
    customer = Customer(**customer_data.model_dump())
    doc = customer.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.customers.insert_one(doc)
    return customer


@router.get("/customers/{customer_id}/orders")
async def get_customer_orders(customer_id: str, current_user: User = Depends(get_current_user)):
    orders = await db.orders.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return orders
