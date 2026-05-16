from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
import hashlib
import jwt
import os

from database import db
from models import User

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get('JWT_SECRET', 'pos-secret-key-change-in-production')
ALGORITHM = "HS256"

# App-level salt for v2 SHA-256 PIN hashes (fast — replaces slow bcrypt)
_PIN_SALT = os.environ.get("PIN_SALT", "posx-pin-v2-salt")


def hash_pincode(pincode: str) -> str:
    """Hash a PIN using SHA-256 (v2 format — instant verification)."""
    h = hashlib.sha256(f"{_PIN_SALT}:{pincode}".encode()).hexdigest()
    return f"v2:{h}"


def verify_pincode(plain_pincode: str, stored: str) -> bool:
    """Verify a PIN. Supports v2 (SHA-256, instant) and legacy bcrypt."""
    if stored.startswith("v2:"):
        expected = stored[3:]
        actual = hashlib.sha256(f"{_PIN_SALT}:{plain_pincode}".encode()).hexdigest()
        return actual == expected
    # Legacy bcrypt — slow but still supported during migration
    try:
        return pwd_context.verify(plain_pincode, stored)
    except Exception:
        return False


def create_token(user_id: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = verify_token(credentials.credentials)
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user)


async def check_permission(user: User, resource: str, action: str):
    """Helper function to check if user has permission"""
    if user.role == "admin":
        return True

    if user.role_id:
        role = await db.roles.find_one({"id": user.role_id}, {"_id": 0})
        if role:
            for perm in role.get("permissions", []):
                if perm["resource"] == resource and action in perm["actions"]:
                    return True

    role_permissions = {
        "manager": {
            "outlets": ["read", "update"],
            "products": ["create", "read", "update"],
            "inventory": ["create", "read", "update", "transfer"],
            "customers": ["create", "read", "update"],
            "orders": ["read", "update"],
            "tables": ["read", "transfer"],
            "reports": ["view"]
        },
        "waiter": {
            "products": ["read"],
            "customers": ["read"],
            "orders": ["create", "read"],
            "tables": ["read", "claim", "release"]
        },
        "cashier": {
            "products": ["read"],
            "customers": ["create", "read"],
            "orders": ["create", "read"],
            "tables": ["read", "claim", "release"]
        }
    }

    user_perms = role_permissions.get(user.role, {})
    return action in user_perms.get(resource, [])
