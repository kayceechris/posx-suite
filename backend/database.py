from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from dotenv import load_dotenv
from pathlib import Path
import os
import ssl

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']

# Shared hosting often has an outdated CA bundle; allow TLS but skip cert verification
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

client = AsyncIOMotorClient(mongo_url, tls=True, tlsAllowInvalidCertificates=True)
db = client[os.environ['DB_NAME']]


async def next_order_number() -> str:
    """Atomically incremented "ORD000123"-style order number.

    Replaces the old `count_documents({}) + 1` scheme, which reads the
    current count and inserts separately — two concurrent completions
    (a double-tap that slips past the frontend's in-flight guard, a
    network retry, an offline-queue replay) can both read the same count
    and mint the SAME order_number. dedupeOrders() on the frontend treats
    order_number as authoritative and silently drops whichever of the two
    it sees second, even though both are real, separately paid orders —
    that's what actually happened to a "missing" completed order.

    Seeds itself on first use from the HIGHEST existing order_number
    already in use (not a document count — orders can be hard-deleted,
    e.g. a held order that never reached the kitchen when its table is
    released, so the count can be lower than the highest number actually
    assigned; seeding from the count could then mint a number that
    collides with a still-existing later order). Seeding races on an
    insert_one against Mongo's always-unique _id, so a simultaneous first
    call is still race-free.
    """
    counter = await db.counters.find_one_and_update(
        {"_id": "order_number"},
        {"$inc": {"seq": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if counter is None:
        highest = await db.orders.find_one(
            {"order_number": {"$regex": r"^ORD\d+$"}},
            {"_id": 0, "order_number": 1},
            sort=[("order_number", -1)],
        )
        baseline = int(highest["order_number"][3:]) if highest else 0
        try:
            await db.counters.insert_one({"_id": "order_number", "seq": baseline})
        except Exception:
            pass  # another request already seeded it — fine, fall through
        counter = await db.counters.find_one_and_update(
            {"_id": "order_number"},
            {"$inc": {"seq": 1}},
            return_document=ReturnDocument.AFTER,
        )
    return f"ORD{counter['seq']:06d}"
