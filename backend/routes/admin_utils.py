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


# ─── DuckDuckGo image search (no API key needed) ──────────────────────────────

def _ddg_image_search(query: str, max_results: int = 6) -> list[dict]:
    """Best-effort image search via DuckDuckGo. Returns [{url, thumb, title}].
    Returns [] if DDG changes its endpoint or blocks the request."""
    import urllib.request, urllib.parse, re, json
    try:
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        q = urllib.parse.quote(query)
        # Step 1: scrape vqd token from a normal search page
        req1 = urllib.request.Request(
            f"https://duckduckgo.com/?q={q}&iax=images&ia=images",
            headers={"User-Agent": ua},
        )
        with urllib.request.urlopen(req1, timeout=10) as r:
            html = r.read().decode("utf-8", errors="ignore")
        m = re.search(r'vqd=["\']?([\d\-]+)["\']?', html)
        if not m:
            return []
        vqd = m.group(1)
        # Step 2: hit the i.js endpoint
        req2 = urllib.request.Request(
            f"https://duckduckgo.com/i.js?l=us-en&o=json&q={q}&vqd={vqd}&f=,,,,,&p=1",
            headers={"User-Agent": ua, "Referer": "https://duckduckgo.com/"},
        )
        with urllib.request.urlopen(req2, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8", errors="ignore"))
        out = []
        for item in (data.get("results") or [])[:max_results]:
            url = item.get("image")
            if not url:
                continue
            out.append({
                "url": url,
                "thumb": item.get("thumbnail") or url,
                "title": item.get("title") or "",
            })
        return out
    except Exception:
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
    results = await loop.run_in_executor(None, _ddg_image_search, query, 8)
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
        candidates = await loop.run_in_executor(None, _ddg_image_search, f"{name} {query_suffix}".strip(), 3)
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
