from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
import os
import logging

from database import db, client
from routes import all_routers
from db_indexes import ensure_indexes

app = FastAPI()


# ── Browser cache hints for slow-changing catalog reads ────────────────────
# Adds private Cache-Control + stale-while-revalidate to a small allowlist
# of GET endpoints whose contents are practically static during a service.
# Browsers (and the service worker) skip the network for repeat visits;
# the SWR window means edits still propagate within a minute or two.
_CACHED_PREFIXES = (
    "/api/products",
    "/api/categories",
    "/api/groups",
    "/api/units",
    "/api/brands",
    "/api/payment-types",
    "/api/printers",
    "/api/printer-groups",
    "/api/outlets",
    "/api/terminals",
    "/api/floors",
    "/api/settings",
)

@app.middleware("http")
async def _add_catalog_cache_headers(request: Request, call_next):
    response = await call_next(request)
    try:
        if (request.method == "GET"
                and response.status_code == 200
                and any(request.url.path.startswith(p) for p in _CACHED_PREFIXES)
                and "cache-control" not in {k.lower() for k in response.headers.keys()}):
            response.headers["Cache-Control"] = "private, max-age=60, stale-while-revalidate=300"
    except Exception:
        pass
    return response

# Include all route modules
for router in all_routers:
    app.include_router(router)

# Compress JSON / static responses larger than 500 bytes — typical 60-80%
# reduction on report and list endpoints.
app.add_middleware(GZipMiddleware, minimum_size=500)

# If CORS_ORIGINS is unset or '*', allow any origin via a regex — Starlette
# silently strips Access-Control-Allow-Origin when allow_origins=["*"] is
# combined with allow_credentials=True, which broke <img crossOrigin> and
# fetch() against the image / static routes. allow_origin_regex echoes the
# request origin back, which is valid with credentials.
_cors_env = os.environ.get('CORS_ORIGINS', '*').strip()
if not _cors_env or _cors_env == '*':
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origin_regex=r".*",
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=[o.strip() for o in _cors_env.split(',') if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.get("/api/ping")
async def ping():
    return {"ok": True}


@app.on_event("startup")
async def _ensure_indexes_on_startup():
    try:
        await ensure_indexes(db)
        logger.info("MongoDB indexes ensured.")
    except Exception as e:
        logger.warning(f"Index creation skipped: {e}")


@app.on_event("startup")
async def _sync_user_permissions_from_types():
    """Backfill: ensure every user's permissions match the current state of
    their assigned user-type. Without this, edits the admin made to a
    user-type before the propagation fix landed never took effect for
    existing staff — they kept the snapshot taken at user-creation time.

    Idempotent — for users already in sync this is a no-op. Runs on
    every deploy so any future drift (a manual DB edit, an import) is
    self-healing on next restart."""
    try:
        types = await db.user_types.find({}, {"_id": 0, "name": 1, "permissions": 1}).to_list(1000)
        synced = 0
        for ut in types:
            role_name = (ut.get("name") or "").strip().lower()
            if not role_name:
                continue
            perms = ut.get("permissions") or []
            # Only touch users whose permission list isn't already exactly
            # the type's list — avoids rewriting the same doc on every
            # restart. We can't sort a $eq match on arrays cheaply, so
            # iterate users and compare in-memory.
            users = await db.users.find(
                {"role": role_name},
                {"_id": 0, "id": 1, "permissions": 1},
            ).to_list(2000)
            for u in users:
                current = list(u.get("permissions") or [])
                if sorted(current) != sorted(perms):
                    await db.users.update_one(
                        {"id": u["id"]},
                        {"$set": {"permissions": perms}},
                    )
                    synced += 1
        if synced:
            logger.info(f"User-type permission sync: refreshed {synced} user(s) from their type.")
    except Exception as e:
        logger.warning(f"User-type permission sync skipped: {e}")


@app.on_event("startup")
async def _dedupe_main_store_stock():
    """Collapse legacy duplicate Main Store stock rows that accumulated
    before the GET/POST outlet_id normalization landed. Each ingredient
    or product should have at most one Main Store row at the canonical
    MAIN_STORE_OUTLET. When duplicates exist (e.g. one at outlet_id="",
    one at the user's outlet_id, one at "global") keep the one with the
    highest quantity (tie-broken by most-recent updated_at), normalize
    its outlet_id, and delete the rest. Idempotent — a no-op once the
    collection is clean."""
    try:
        from routes.inventory import MAIN_STORE_OUTLET
        rows = await db.stock.find({"store": "main"}).to_list(10000)
        groups: dict = {}
        for r in rows:
            key = (r.get("ingredient_id"), r.get("product_id"))
            if key == (None, None):
                continue
            groups.setdefault(key, []).append(r)
        merged = 0
        normalized = 0
        for group in groups.values():
            group.sort(
                key=lambda r: (float(r.get("quantity", 0) or 0), r.get("updated_at", "")),
                reverse=True,
            )
            winner = group[0]
            for loser in group[1:]:
                await db.stock.delete_one({"_id": loser["_id"]})
                merged += 1
            if winner.get("outlet_id") != MAIN_STORE_OUTLET:
                await db.stock.update_one(
                    {"_id": winner["_id"]},
                    {"$set": {"outlet_id": MAIN_STORE_OUTLET}},
                )
                normalized += 1
        if merged or normalized:
            logger.info(
                f"Main Store stock dedupe: merged {merged} duplicate(s), "
                f"normalized {normalized} outlet_id(s)"
            )
    except Exception as e:
        logger.warning(f"Main Store stock dedupe skipped: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
