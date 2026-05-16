"""Reset all users with fast bcrypt hashes (rounds=4). Admin PIN = 123456."""
import sys
try:
    from pymongo import MongoClient
except ImportError:
    print("Run: pip install pymongo")
    sys.exit(1)

MONGO_URL = input("Paste your MongoDB URL (from cPanel): ").strip()
DB_NAME = "posx_suite"

# Pre-computed bcrypt hashes at rounds=4 (fast verification ~0.05s)
HASHES = {
    "123456": "$2b$04$A9LZk9dNtEnp.88Z.nXfVOSKNylUb0798fK1I2wZ7pORzW0nNYS16",
    "9999":   "$2b$04$pd4/eP20BdNYDFtwpo5FleqPBQ0L3NWFp4cMBWkX4z3iX3csxtO0u",
    "1111":   "$2b$04$x7.tJML2NKnv9WROBIfN2O6SvStjfJnqsSWpHKd/731RIfxP81kQW",
    "2222":   "$2b$04$ASWwWHDOIkSjjzMkptAz..Ij0qswSjHfM26d9gqjY9lOxP1C1Fo2K",
    "3333":   "$2b$04$0yKDTYmO06nzENQHT8ycKubEAxgzFEBMioxKFeT4bsOLLJ34A9Dm6",
    "4444":   "$2b$04$l9iW6Gd9NY5Cthcwhz/93O1sIJrH.Q.k1QarrHixUHxkNmuNF1Cn.",
}

import uuid
from datetime import datetime, timezone

def new_user(name, pin, role):
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "pincode": HASHES[pin],
        "role": role,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10000)
db = client[DB_NAME]

# Clear existing users
db.users.delete_many({})
print("✓ Cleared old users")

# Insert fresh users with fast hashes
users = [
    new_user("Admin",         "123456", "admin"),
    new_user("Sarah Manager", "9999",   "manager"),
    new_user("James Cashier", "1111",   "cashier"),
    new_user("Linda Cashier", "2222",   "cashier"),
    new_user("Tony Waiter",   "3333",   "waiter"),
    new_user("Grace Waiter",  "4444",   "waiter"),
]
db.users.insert_many(users)
print(f"✓ Created {len(users)} users with fast PINs")

# Ensure setup_completed = True
db.settings.update_one(
    {"id": "business_settings"},
    {"$set": {"setup_completed": True, "business_name": "The Grand Bistro",
              "business_type": "restaurant", "currency_symbol": "₦"}},
    upsert=True,
)
print("✓ setup_completed = True")

print("\n✅ Done! Login PINs:")
print("   Admin:   123456")
print("   Manager: 9999")
print("   Cashier: 1111 or 2222")
print("   Waiter:  3333 or 4444")
client.close()
