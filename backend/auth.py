from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
import hashlib
import jwt
import os
import secrets

from database import db
from models import User

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get('JWT_SECRET', 'pos-secret-key-change-in-production')
ALGORITHM = "HS256"

# App-level salt for v2 SHA-256 PIN hashes (fast — replaces slow bcrypt)
_PIN_SALT = os.environ.get("PIN_SALT", "posx-pin-v2-salt")

# Separate salt namespace for Mother↔Business link keys — these are
# high-entropy generated secrets (not user-chosen PINs), but keeping the
# hash domain distinct from PIN hashing avoids any cross-purpose reuse.
_LINK_KEY_SALT = os.environ.get("LINK_KEY_SALT", "posx-link-key-salt")


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


def has_perm(user: User, *permissions: str) -> bool:
    """True if user is admin/manager by role, OR has any of the given permissions."""
    if user.role.lower() in ("admin", "manager"):
        return True
    user_perms = user.permissions or []
    return any(p in user_perms for p in permissions)


def generate_link_key() -> str:
    """A high-entropy secret for a Mother↔Business pairing. Shown once at
    creation — only its hash is ever stored, on both sides of the link."""
    return secrets.token_urlsafe(32)


def hash_link_key(key: str) -> str:
    return hashlib.sha256(f"{_LINK_KEY_SALT}:{key}".encode()).hexdigest()


async def get_linked_business(x_link_key: str = Header(None, alias="X-Link-Key")):
    """Mother-side: server-to-server auth for an incoming Business→Mother
    call (e.g. creating a requisition). Mother may serve several linked
    businesses, so this looks up WHICH one is calling by the hash of the
    shared key presented — Mother only ever stores the hash, never the
    plaintext key back."""
    if not x_link_key:
        raise HTTPException(status_code=401, detail="Missing X-Link-Key header")
    key_hash = hash_link_key(x_link_key)
    linked = await db.linked_businesses.find_one({"link_key_hash": key_hash, "active": True}, {"_id": 0})
    if not linked:
        raise HTTPException(status_code=401, detail="Invalid or inactive link key")
    return linked


async def verify_mother_caller(x_link_key: str = Header(None, alias="X-Link-Key")):
    """Business-side: server-to-server auth for an incoming Mother→Business
    call (delivering stock). A business only ever trusts ONE Mother, so
    this is a direct comparison against the single stored connection —
    unlike get_linked_business, the business needs the plaintext key
    anyway (to make its own outbound calls to Mother), so there's nothing
    gained by hashing it here."""
    if not x_link_key:
        raise HTTPException(status_code=401, detail="Missing X-Link-Key header")
    conn = await db.mother_connection.find_one({}, {"_id": 0})
    if not conn or not conn.get("link_key") or conn["link_key"] != x_link_key:
        raise HTTPException(status_code=401, detail="Invalid link key")
    return conn


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
