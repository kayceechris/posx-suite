import asyncio
import base64
import uuid as _uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from typing import List
from pydantic import BaseModel

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")

# Simple collections — fully wiped on clear
SIMPLE_CLEARABLE = {
    "tables":       "tables",
    "floors":       "floors",
    "orders":       "orders",
    "bar_tabs":     "bar_tabs",
    "customers":    "customers",
    "reservations": "reservations",
    "stores":       "stores",      # non-main stores only (see special handling)
    "inventory":    "stock",       # stock records (across all stores/outlets)
    "products":     "products",
    "outlets":      "outlets",
    "users":        "users",       # everyone except role=admin (see special handling)
    # Optional auxiliary cleanups that travel with their parents
    "ingredients":     "ingredients",
    "recipes":         "recipes",
    "stock_movements": "stock_movements",
    "purchases":       "purchases",
    "requisitions":    "requisitions",
}

# Keys that need custom handling instead of a blanket delete_many({})
SPECIAL_KEYS = {"stores", "users"}


class ClearDataRequest(BaseModel):
    collections: List[str]


@router.post("/admin/clear-data")
async def clear_data(body: ClearDataRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    invalid = [c for c in body.collections if c not in SIMPLE_CLEARABLE]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown collections: {invalid}")

    result: dict = {}
    for col in body.collections:
        if col == "stores":
            # Keep the Main Store (is_main=True). Wipe the rest.
            r = await db.stores.delete_many({"is_main": {"$ne": True}})
            result[col] = r.deleted_count
        elif col == "users":
            # Always preserve admin accounts.
            r = await db.users.delete_many({"role": {"$ne": "admin"}})
            result[col] = r.deleted_count
        else:
            r = await db[SIMPLE_CLEARABLE[col]].delete_many({})
            result[col] = r.deleted_count

    return {"cleared": result}


# ─── Wipe a single user's order history ──────────────────────────────────────

@router.post("/admin/clear-user-orders")
async def clear_user_orders(body: dict, current_user: User = Depends(get_current_user)):
    """Delete every order created by a specific user. Optionally release any
    tables that were holding one of those orders and roll back the customer
    purchase stats those orders contributed to."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    user_id   = (body or {}).get("user_id")
    user_name = (body or {}).get("user_name")
    if not user_id and not user_name:
        raise HTTPException(400, "user_id or user_name required")

    match: dict = {}
    if user_id and user_name:
        match["$or"] = [{"created_by": user_id}, {"created_by_name": user_name}]
    elif user_id:
        match["created_by"] = user_id
    else:
        match["created_by_name"] = user_name

    # Gather orders before deleting so we can clean up linked state.
    orders = await db.orders.find(
        match,
        {"_id": 0, "id": 1, "table_id": 1, "bar_tab_id": 1, "customer_id": 1, "total": 1, "status": 1},
    ).to_list(50000)

    table_ids = {o["table_id"] for o in orders if o.get("table_id")}
    tab_ids   = {o["bar_tab_id"] for o in orders if o.get("bar_tab_id")}

    # Roll back customer stats — only for orders that were actually counted
    # (status='completed'). Held / sent_to_kitchen / pending didn't bump the
    # stats in the first place.
    customer_deltas: dict = {}
    for o in orders:
        if o.get("status") != "completed":
            continue
        cid = o.get("customer_id")
        if not cid:
            continue
        d = customer_deltas.setdefault(cid, {"orders": 0, "spent": 0.0})
        d["orders"] += 1
        d["spent"]  += float(o.get("total") or 0)
    for cid, d in customer_deltas.items():
        await db.customers.update_one(
            {"id": cid},
            {"$inc": {"total_orders": -d["orders"], "total_spent": -d["spent"]}},
        )

    delete_result = await db.orders.delete_many(match)

    # Release any tables / bar tabs the deleted orders were holding.
    if table_ids:
        await db.tables.update_many(
            {"id": {"$in": list(table_ids)}, "current_order_id": {"$ne": None}},
            {"$set": {
                "status": "available",
                "current_order_id": None,
                "waiter_id": None,
                "waiter_name": None,
                "merged_into": None,
            }},
        )
    if tab_ids:
        await db.bar_tabs.update_many(
            {"id": {"$in": list(tab_ids)}, "current_order_id": {"$ne": None}},
            {"$set": {"status": "closed", "current_order_id": None}},
        )

    return {
        "orders_deleted":    delete_result.deleted_count,
        "tables_released":   len(table_ids),
        "bar_tabs_closed":   len(tab_ids),
        "customers_adjusted": len(customer_deltas),
    }


# ─── Sync product images to Image Library ─────────────────────────────────────

_ALLOWED_MIME = {
    "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
    "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg",
}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB cap per image


def _is_library_ref(url: str) -> bool:
    """True if this image URL already points to our Image Library."""
    if not url:
        return False
    return "/api/images/" in url


def _download_image(url: str) -> tuple[bytes, str, str] | None:
    """Download a remote image; return (bytes, content_type, suggested_name) or None on failure."""
    import urllib.request, urllib.error
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "POSx-ImageSync/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            ct = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if ct not in _ALLOWED_MIME:
                return None
            data = resp.read(_MAX_BYTES + 1)
            if len(data) > _MAX_BYTES:
                return None
            ext = _ALLOWED_MIME[ct]
            # Try to extract a readable filename from the URL
            base = url.rstrip("/").split("/")[-1].split("?")[0]
            name = base if base else f"product{ext}"
            if "." not in name:
                name = f"{name}{ext}"
            return data, ct, name
    except Exception:
        return None


# ─── Flush Image Library ──────────────────────────────────────────────────────

@router.post("/admin/clear-image-library")
async def clear_image_library(current_user: User = Depends(get_current_user)):
    """Delete every image stored in the library and unlink any product that
    pointed at /api/images/... so the UI doesn't display broken references."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    image_count = await db.images.count_documents({})
    await db.images.delete_many({})

    # Unlink products whose image field referenced the library
    unlink_result = await db.products.update_many(
        {"image": {"$regex": "^/api/images/"}},
        {"$set": {"image": ""}},
    )

    return {
        "images_deleted": image_count,
        "products_unlinked": unlink_result.modified_count,
    }


# ─── Image search backends (no API key needed) ────────────────────────────────

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def _ddg_image_search(query: str, max_results: int = 6) -> list[dict]:
    """Image search via DuckDuckGo. Returns [{url, thumb, title}] or []."""
    import urllib.request, urllib.parse, re, json
    try:
        q = urllib.parse.quote(query)
        # Try several vqd-token patterns — DDG has changed this format a few times
        req1 = urllib.request.Request(
            f"https://duckduckgo.com/?q={q}&iax=images&ia=images",
            headers={"User-Agent": _UA, "Accept-Language": "en-US,en;q=0.9"},
        )
        with urllib.request.urlopen(req1, timeout=10) as r:
            html = r.read().decode("utf-8", errors="ignore")
        vqd = None
        for pattern in (
            r'vqd=([\d-]+)&',
            r'vqd=["\']([\d-]+)["\']',
            r"vqd=['\"]?([^'\"&]+)['\"]?",
        ):
            m = re.search(pattern, html)
            if m:
                vqd = m.group(1)
                break
        if not vqd:
            return []
        req2 = urllib.request.Request(
            f"https://duckduckgo.com/i.js?l=us-en&o=json&q={q}&vqd={vqd}&f=,,,,,&p=1",
            headers={"User-Agent": _UA, "Referer": "https://duckduckgo.com/"},
        )
        with urllib.request.urlopen(req2, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8", errors="ignore"))
        out = []
        for item in (data.get("results") or [])[:max_results]:
            url = item.get("image")
            if not url:
                continue
            out.append({"url": url, "thumb": item.get("thumbnail") or url, "title": item.get("title") or ""})
        return out
    except Exception:
        return []


def _bing_image_search(query: str, max_results: int = 6) -> list[dict]:
    """Image search via Bing HTML scrape. Returns [{url, thumb, title}] or [].
    Bing lazy-loads most results but the first 1-2 are server-rendered."""
    import urllib.request, urllib.parse, re, html as html_lib, json
    try:
        q = urllib.parse.quote(query)
        req = urllib.request.Request(
            f"https://www.bing.com/images/search?q={q}&form=HDRSC2",
            headers={"User-Agent": _UA, "Accept-Language": "en-US,en;q=0.9"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            html_text = r.read().decode("utf-8", errors="ignore")
        out = []
        for m in re.finditer(r'class="iusc"[^>]*?m="([^"]+)"', html_text):
            try:
                meta = json.loads(html_lib.unescape(m.group(1)))
                url = meta.get("murl") or meta.get("imgurl")
                if not url:
                    continue
                out.append({
                    "url": url,
                    "thumb": meta.get("turl") or url,
                    "title": meta.get("t") or meta.get("desc") or "",
                })
                if len(out) >= max_results:
                    break
            except Exception:
                continue
        return out
    except Exception:
        return []


def _wikipedia_image_search(query: str, max_results: int = 3) -> list[dict]:
    """Find product images via Wikipedia. Excellent for named brands & dishes."""
    import urllib.request, urllib.parse, json
    try:
        q = urllib.parse.quote(query)
        url = (
            "https://en.wikipedia.org/w/api.php?"
            "action=query&format=json&prop=pageimages&piprop=original&pithumbsize=800"
            f"&generator=search&gsrsearch={q}&gsrlimit={max_results}&origin=*"
        )
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8", errors="ignore"))
        pages = (data.get("query") or {}).get("pages") or {}
        out = []
        for page in pages.values():
            orig = (page.get("original") or {}).get("source")
            thumb = (page.get("thumbnail") or {}).get("source")
            img = orig or thumb
            if not img:
                continue
            out.append({"url": img, "thumb": thumb or img, "title": page.get("title", "")})
        return out[:max_results]
    except Exception:
        return []


def _image_search(query: str, max_results: int = 6) -> list[dict]:
    """Best-effort image search. Tries multiple sources, returns the first
    that yields results. Order: Wikipedia → Bing → DuckDuckGo."""
    for fn in (_wikipedia_image_search, _bing_image_search, _ddg_image_search):
        try:
            results = fn(query, max_results)
            if results:
                return results
        except Exception:
            continue
    return []


@router.post("/admin/search-product-image")
async def search_product_image(body: dict, current_user: User = Depends(get_current_user)):
    """Return image candidates for a product name (for manual pick)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(400, "query required")
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, _image_search, query, 8)
    return {"results": results}


@router.post("/admin/auto-fetch-product-images")
async def auto_fetch_product_images(body: dict | None = None, current_user: User = Depends(get_current_user)):
    """Iterate every product missing an image, search the web for one, download
    the top result into the Image Library, and attach it. Best-effort: rate-limited
    by DuckDuckGo so this runs synchronously, item by item."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    only_missing = bool((body or {}).get("only_missing", True))
    query_suffix = (body or {}).get("suffix") or ""

    query: dict = {} if not only_missing else {"$or": [{"image": {"$exists": False}}, {"image": ""}, {"image": None}]}
    products = await db.products.find(query, {"_id": 0, "id": 1, "name": 1}).to_list(5000)

    counts = {"scanned": len(products), "attached": 0, "no_result": 0, "download_failed": 0}
    errors: list[str] = []
    loop = asyncio.get_event_loop()

    for prod in products:
        name = (prod.get("name") or "").strip()
        if not name:
            counts["no_result"] += 1
            continue
        candidates = await loop.run_in_executor(None, _image_search, f"{name} {query_suffix}".strip(), 3)
        if not candidates:
            counts["no_result"] += 1
            errors.append(f'No image found for "{name}"')
            continue

        # Try candidates in order until one downloads
        attached = False
        for cand in candidates:
            dl = await loop.run_in_executor(None, _download_image, cand["url"])
            if dl is None:
                continue
            data, content_type, fname = dl
            image_id = str(_uuid.uuid4())
            await db.images.insert_one({
                "id": image_id,
                "name": fname,
                "data": base64.b64encode(data).decode(),
                "content_type": content_type,
                "size": len(data),
                "created_at": datetime.utcnow().isoformat(),
            })
            await db.products.update_one({"id": prod["id"]}, {"$set": {"image": f"/api/images/{image_id}"}})
            counts["attached"] += 1
            attached = True
            break

        if not attached:
            counts["download_failed"] += 1
            errors.append(f'Could not download any candidate for "{name}"')

    return {**counts, "errors": errors[:50]}


@router.post("/admin/sync-product-images")
async def sync_product_images(current_user: User = Depends(get_current_user)):
    """Scan all products. For each product with an external image URL, download
    the image into the Image Library and update the product to reference the
    library copy. Products already using a library reference are skipped."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "image": 1}).to_list(10000)

    counts = {"scanned": len(products), "already_in_library": 0, "downloaded": 0, "skipped": 0, "failed": 0}
    errors: list[str] = []

    loop = asyncio.get_event_loop()
    for prod in products:
        img = (prod.get("image") or "").strip()
        if not img:
            counts["skipped"] += 1
            continue
        if _is_library_ref(img):
            counts["already_in_library"] += 1
            continue
        if not (img.startswith("http://") or img.startswith("https://")):
            # data: / blob: / unknown — skip
            counts["skipped"] += 1
            continue

        result = await loop.run_in_executor(None, _download_image, img)
        if result is None:
            counts["failed"] += 1
            errors.append(f'Failed to download image for "{prod.get("name", prod["id"])}"')
            continue

        data, content_type, name = result
        image_id = str(_uuid.uuid4())
        await db.images.insert_one({
            "id": image_id,
            "name": name,
            "data": base64.b64encode(data).decode(),
            "content_type": content_type,
            "size": len(data),
            "created_at": datetime.utcnow().isoformat(),
        })
        await db.products.update_one(
            {"id": prod["id"]},
            {"$set": {"image": f"/api/images/{image_id}"}},
        )
        counts["downloaded"] += 1

    return {**counts, "errors": errors[:50]}
