"""
Run once from cPanel Terminal to reset admin PIN.
Delete this file after use.

Usage:
  python reset_admin.py
"""
import asyncio, hashlib, os, sys
from pathlib import Path

# Load .env from same directory
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME   = os.environ.get("DB_NAME", "")
NEW_PIN   = "123456"


async def main():
    if not MONGO_URL:
        print("ERROR: MONGO_URL not set in .env"); sys.exit(1)

    print(f"DB : {DB_NAME}")
    print(f"URL: {MONGO_URL[:60]}...")

    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGO_URL, tls=True, tlsAllowInvalidCertificates=True)
    db = client[DB_NAME]

    # Show all users
    users = await db.users.find({}, {"_id": 0}).to_list(200)
    print(f"\n{len(users)} user(s) in database:")
    for u in users:
        pin_preview = u.get("pincode", "")[:20]
        print(f"  [{u.get('role','?')}] {u.get('name','?')}  pin={pin_preview}...")

    # Compute v2 hash for NEW_PIN
    h      = hashlib.sha256(f"posx-pin-v2-salt:{NEW_PIN}".encode()).hexdigest()
    hashed = f"v2:{h}"

    res = await db.users.update_one({"role": "admin"}, {"$set": {"pincode": hashed}})
    print(f"\nUpdate matched={res.matched_count}  modified={res.modified_count}")

    if res.matched_count == 0:
        print("No admin found — creating one...")
        import uuid, datetime
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Admin",
            "role": "admin",
            "pincode": hashed,
            "active": True,
            "created_at": datetime.datetime.utcnow().isoformat(),
        })
        print("Admin user created.")
    else:
        print(f"Admin PIN reset to {NEW_PIN}")

    client.close()


asyncio.run(main())
