"""
Run this ONCE from your local machine.
It writes setup_completed + demo users directly to Atlas — no server needed.

Usage:
    pip install pymongo
    python fix_db.py
"""
import pymongo, uuid, datetime

# ── Paste your Atlas URL here ──────────────────────────────────────────────────
MONGO_URL = input("Paste your MongoDB Atlas URL (from cPanel env vars): ").strip()
DB_NAME   = "posx_suite"
# ──────────────────────────────────────────────────────────────────────────────

print("\nConnecting to MongoDB Atlas...")
client = pymongo.MongoClient(MONGO_URL, serverSelectionTimeoutMS=10000)
db = client[DB_NAME]

# 1. Write setup_completed immediately
db.settings.update_one(
    {"id": "business_settings"},
    {"$set": {
        "id": "business_settings",
        "setup_completed": True,
        "currency_symbol": "₦",
        "business_name": "The Grand Bistro",
        "business_type": "restaurant",
        "tax_enabled": True,
        "tax_rate": 7.5,
        "tax_mode": "exclusive",
    }},
    upsert=True,
)
print("✓ setup_completed = True written")

# 2. Create users only if none exist (pre-hashed PINs — no bcrypt needed)
existing = db.users.find_one({"role": "admin"})
if existing:
    print("✓ Users already exist — skipping user creation")
else:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    users = [
        {"id": str(uuid.uuid4()), "name": "Admin",         "role": "admin",   "pincode": "$2b$12$T8ULFAbLU4KVsydmQhDNXuBkXebZe.LN0z/vqiRtK4RRAUNxTinf.", "created_at": now, "active": True},
        {"id": str(uuid.uuid4()), "name": "Sarah Manager", "role": "manager", "pincode": "$2b$12$qmwbKEG9zb5/I7Mft8Pnk.bTAEPaRJXQA99.bFmq8dMte1ZfLqXxK", "created_at": now, "active": True},
        {"id": str(uuid.uuid4()), "name": "James Cashier", "role": "cashier", "pincode": "$2b$12$XVkQM69rM2AogKAr8Oma6ebUwJg.lx8yPrK/e4JPvLC/YgHtuAT7O", "created_at": now, "active": True},
        {"id": str(uuid.uuid4()), "name": "Linda Cashier", "role": "cashier", "pincode": "$2b$12$w5IpJkSLTQF8GNzKHG6Ydu2B/uTU6WOfb0Fj6e5ccu1mMbg6oaMO2", "created_at": now, "active": True},
        {"id": str(uuid.uuid4()), "name": "Tony Waiter",   "role": "waiter",  "pincode": "$2b$12$ahaR4Tkn4QRpCkX.R7bH..i5DMv26mQ.kgH4tvMbnBK.V8N/KiEjq",  "created_at": now, "active": True},
        {"id": str(uuid.uuid4()), "name": "Grace Waiter",  "role": "waiter",  "pincode": "$2b$12$9bYe6vIRsNCywbRiHkbjqu4daLpjYOWluEM8dnKT0EEUBqOTTEQkW",  "created_at": now, "active": True},
    ]
    db.users.insert_many(users)
    print(f"✓ {len(users)} users created")

# 3. Payment types
if db.payment_types.count_documents({}) == 0:
    db.payment_types.insert_many([
        {"id": str(uuid.uuid4()), "name": "Cash",        "type": "cash"},
        {"id": str(uuid.uuid4()), "name": "Card",        "type": "card"},
        {"id": str(uuid.uuid4()), "name": "Mobile Pay",  "type": "digital_wallet"},
        {"id": str(uuid.uuid4()), "name": "Bank Transfer","type": "bank_transfer"},
    ])
    print("✓ Payment types created")

# 4. Currency
if db.currencies.count_documents({}) == 0:
    db.currencies.insert_one({
        "id": str(uuid.uuid4()), "code": "NGN", "symbol": "₦",
        "name": "Nigerian Naira", "exchange_rate": 1.0, "is_default": True,
    })
    print("✓ Currency created")

client.close()
print("\n✅ Done! Open https://marvellatech.com.ng — it should show the PIN login.")
print("\nLogin PINs:")
print("  Admin:   123456")
print("  Manager: 9999")
print("  Cashier: 1111 or 2222")
print("  Waiter:  3333 or 4444")
