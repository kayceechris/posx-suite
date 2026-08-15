"""MongoDB index definitions.

Created once at server startup. `create_index` is idempotent — if an index with
the same key spec already exists it's a no-op. Picked for the hottest query
paths surfaced by report/list endpoints.
"""

from pymongo import ASCENDING, DESCENDING


async def ensure_indexes(db):
    # ── Orders: every report filters by date and/or outlet ──────────────────
    await db.orders.create_index([("created_at", DESCENDING)])
    await db.orders.create_index([("outlet_id", ASCENDING), ("created_at", DESCENDING)])
    await db.orders.create_index([("status", ASCENDING), ("created_at", DESCENDING)])
    await db.orders.create_index([("terminal_id", ASCENDING), ("created_at", DESCENDING)])
    await db.orders.create_index([("served_by", ASCENDING), ("created_at", DESCENDING)])
    await db.orders.create_index([("table_id", ASCENDING), ("status", ASCENDING)])
    # Idempotency key — sparse (most orders won't have one). Used by the
    # create_order POST handler to swallow retries before they double-insert.
    await db.orders.create_index(
        [("idempotency_key", ASCENDING)],
        sparse=True,
        name="orders_idempotency_key_sparse",
    )
    # Backstop for next_order_number()'s atomic counter (database.py) —
    # order_number used to be generated via count_documents()+1, which two
    # concurrent completions could race and both mint identically, silently
    # dropping one from any list that dedupes by order_number. Own
    # try/except: if any pre-existing duplicate order_number already made
    # it into the database before this fix, index creation fails safely
    # here without blocking every OTHER index below it in this function.
    try:
        await db.orders.create_index(
            [("order_number", ASCENDING)],
            unique=True,
            sparse=True,
            name="orders_order_number_unique",
        )
    except Exception as e:
        print(f"orders_order_number_unique index skipped (likely pre-existing duplicates): {e}")

    # ── Stock: lookups are always (subject_id, outlet, store) ───────────────
    await db.stock.create_index([("ingredient_id", ASCENDING), ("outlet_id", ASCENDING), ("store", ASCENDING)])
    await db.stock.create_index([("product_id", ASCENDING), ("outlet_id", ASCENDING), ("store", ASCENDING)])
    await db.stock.create_index([("outlet_id", ASCENDING), ("store", ASCENDING)])

    # ── Stock movements / waste ──────────────────────────────────────────────
    await db.stock_movements.create_index([("created_at", DESCENDING)])
    await db.stock_movements.create_index([("outlet_id", ASCENDING), ("created_at", DESCENDING)])
    await db.waste.create_index([("created_at", DESCENDING)])

    # ── Auth / users — login path ───────────────────────────────────────────
    await db.users.create_index([("username", ASCENDING)], unique=False)
    await db.users.create_index([("email", ASCENDING)])
    await db.users.create_index([("role", ASCENDING)])

    # ── Catalog: products / ingredients ─────────────────────────────────────
    await db.products.create_index([("outlet_id", ASCENDING)])
    await db.products.create_index([("category", ASCENDING)])
    await db.products.create_index([("name", ASCENDING)])
    await db.ingredients.create_index([("name", ASCENDING)])

    # ── Customers ───────────────────────────────────────────────────────────
    await db.customers.create_index([("phone", ASCENDING)])
    await db.customers.create_index([("email", ASCENDING)])

    # ── Tables / bar tabs ───────────────────────────────────────────────────
    await db.tables.create_index([("outlet_id", ASCENDING), ("status", ASCENDING)])
    await db.bar_tabs.create_index([("outlet_id", ASCENDING), ("status", ASCENDING)])

    # ── Payments / journals ─────────────────────────────────────────────────
    await db.payments.create_index([("created_at", DESCENDING)])
    await db.payments.create_index([("order_id", ASCENDING)])
    await db.journal_entries.create_index([("created_at", DESCENDING)])

    # ── Notifications ───────────────────────────────────────────────────────
    await db.notifications.create_index([("recipient_id", ASCENDING), ("created_at", DESCENDING)])
    await db.notifications.create_index([("read", ASCENDING), ("created_at", DESCENDING)])

    # ── Reservations ────────────────────────────────────────────────────────
    await db.reservations.create_index([("date", ASCENDING)])
    await db.reservations.create_index([("outlet_id", ASCENDING), ("date", ASCENDING)])
