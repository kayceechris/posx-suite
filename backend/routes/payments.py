from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User, PaymentType, PaymentTypeCreate, Currency, CurrencyCreate
from auth import get_current_user

router = APIRouter(prefix="/api")


# ==================== PAYMENT TYPE ROUTES ====================

@router.get("/payment-types")
async def get_payment_types(current_user: User = Depends(get_current_user)):
    payment_types = await db.payment_types.find({}, {"_id": 0}).to_list(1000)
    return payment_types


@router.post("/payment-types", response_model=PaymentType)
async def create_payment_type(payment_data: PaymentTypeCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    payment_type = PaymentType(**payment_data.model_dump())
    doc = payment_type.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.payment_types.insert_one(doc)
    return payment_type


@router.delete("/payment-types/{payment_id}")
async def delete_payment_type(payment_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.payment_types.delete_one({"id": payment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Payment type not found")
    return {"message": "Payment type deleted successfully"}


# ==================== CURRENCY ROUTES ====================

@router.get("/currencies")
async def get_currencies(current_user: User = Depends(get_current_user)):
    currencies = await db.currencies.find({}, {"_id": 0}).to_list(1000)
    return currencies


@router.post("/currencies", response_model=Currency)
async def create_currency(currency_data: CurrencyCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    if currency_data.is_default:
        await db.currencies.update_many({}, {"$set": {"is_default": False}})

    currency = Currency(**currency_data.model_dump())
    doc = currency.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.currencies.insert_one(doc)
    return currency


@router.put("/currencies/{currency_id}")
async def update_currency(currency_id: str, currency_data: dict, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    if currency_data.get("is_default"):
        await db.currencies.update_many({}, {"$set": {"is_default": False}})

    result = await db.currencies.update_one({"id": currency_id}, {"$set": currency_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Currency not found")

    updated = await db.currencies.find_one({"id": currency_id}, {"_id": 0})
    return updated


@router.delete("/currencies/{currency_id}")
async def delete_currency(currency_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.currencies.delete_one({"id": currency_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Currency not found")
    return {"message": "Currency deleted successfully"}
