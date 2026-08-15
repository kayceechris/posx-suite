"""
Mother Store: cross-deployment stock requisition and delivery.

A Mother Store is a SEPARATE deployment of this same codebase, used purely
as a warehouse (no POS/Tables/KDS, no Kitchen/Bar of its own — all of its
own stock legitimately lives at store="main"). One or more regular
business deployments each requisition stock from Mother when running low.

Both roles live in the same codebase (every deployment has both sets of
endpoints available); which side actually gets used depends on how that
particular deployment is configured:
  - Mother-side data: db.linked_businesses, db.mother_requisitions
  - Business-side data: db.mother_connection (a single doc)

Cross-deployment calls (Business -> Mother, and Mother -> Business) never
use a normal user JWT — there's no shared user account between two
separate deployments. Both directions authenticate with the SAME shared
secret ("link key"), issued once by Mother when a Linked Business is
created. Because the one secret has to work in both directions, Mother
keeps the plaintext (to present it when pushing a delivery) alongside a
hash of it (for a fast/indexed lookup when verifying an incoming call) —
see LinkedBusiness in models.py and get_linked_business/verify_mother_
caller in auth.py. Neither the key nor its hash is ever returned by any
endpoint after the one-time creation response.

A Business's own frontend never sees or handles the link key — it only
ever talks to its OWN backend (normal JWT auth), which then proxies the
Mother-facing calls server-side. See POST/GET /api/mother/* below.
"""

import asyncio
import uuid as _uuid
import requests
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models import (
    User, LinkedBusinessCreate,
    MotherRequisition, MotherRequisitionCreate,
    MotherConnectionUpdate, ReceiveFromMotherRequest,
)
from auth import (
    get_current_user, has_perm,
    get_linked_business, verify_mother_caller,
    generate_link_key, hash_link_key,
)

router = APIRouter(prefix="/api")

_PRIVATE_FIELDS = {"_id": 0, "link_key": 0, "link_key_hash": 0}


def _require_mother_admin(user: User):
    # Reuses the existing inventory umbrella rather than inventing a new
    # permission just for this — admin/manager already bypass via has_perm.
    if not has_perm(user, "manage_inventory"):
        raise HTTPException(403, "Not authorized")


# ============================================================
# MOTHER-SIDE: Linked Businesses
# ============================================================

@router.get("/linked-businesses")
async def list_linked_businesses(current_user: User = Depends(get_current_user)):
    _require_mother_admin(current_user)
    return await db.linked_businesses.find({}, _PRIVATE_FIELDS).sort("created_at", -1).to_list(200)


@router.post("/linked-businesses")
async def create_linked_business(data: LinkedBusinessCreate, current_user: User = Depends(get_current_user)):
    _require_mother_admin(current_user)
    plaintext_key = generate_link_key()
    doc = {
        "id": _uuid.uuid4().hex,
        "name": data.name,
        "base_url": data.base_url.rstrip("/"),
        "link_key": plaintext_key,
        "link_key_hash": hash_link_key(plaintext_key),
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.linked_businesses.insert_one(doc)
    # The ONLY response that ever includes the plaintext key — copy it
    # into the business's Mother Store Connection settings now.
    return {
        "id": doc["id"], "name": doc["name"], "base_url": doc["base_url"],
        "active": doc["active"], "created_at": doc["created_at"],
        "link_key": plaintext_key,
    }


@router.put("/linked-businesses/{business_id}")
async def update_linked_business(business_id: str, data: dict, current_user: User = Depends(get_current_user)):
    _require_mother_admin(current_user)
    allowed = {"name", "base_url", "active"}
    update = {k: v for k, v in data.items() if k in allowed}
    if "base_url" in update:
        update["base_url"] = update["base_url"].rstrip("/")
    if not update:
        raise HTTPException(400, "Nothing to update")
    result = await db.linked_businesses.update_one({"id": business_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Linked business not found")
    return await db.linked_businesses.find_one({"id": business_id}, _PRIVATE_FIELDS)


@router.delete("/linked-businesses/{business_id}")
async def delete_linked_business(business_id: str, current_user: User = Depends(get_current_user)):
    _require_mother_admin(current_user)
    result = await db.linked_businesses.delete_one({"id": business_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Linked business not found")
    return {"message": "Linked business removed"}


# ============================================================
# MOTHER-SIDE: incoming requisitions from linked businesses
# ============================================================

@router.post("/mother-requisitions")
async def create_mother_requisition(
    data: MotherRequisitionCreate,
    linked_business: dict = Depends(get_linked_business),
):
    req = MotherRequisition(
        linked_business_id=linked_business["id"],
        items=data.items,
        destination_store=data.destination_store,
        destination_outlet_id=data.destination_outlet_id,
        notes=data.notes,
    )
    doc = req.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.mother_requisitions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/mother-requisitions")
async def list_mother_requisitions(status: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Mother admin's view — every linked business's requests."""
    _require_mother_admin(current_user)
    query = {"status": status} if status else {}
    items = await db.mother_requisitions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    if not items:
        return items
    biz_ids = list({i["linked_business_id"] for i in items})
    bizs = await db.linked_businesses.find({"id": {"$in": biz_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    biz_map = {b["id"]: b["name"] for b in bizs}
    for i in items:
        i["business_name"] = biz_map.get(i["linked_business_id"], "Unknown business")
    return items


@router.get("/mother-requisitions/mine")
async def list_my_mother_requisitions(linked_business: dict = Depends(get_linked_business)):
    """A linked business's own view of what IT has requested — link-key
    authenticated, scoped to only its own requisitions. This is what the
    business-side GET /api/mother/requests proxy calls."""
    items = await db.mother_requisitions.find(
        {"linked_business_id": linked_business["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items


async def _find_stock_by_sku(sku: str):
    """Main-store stock row for the ingredient/product tagged with this
    SKU, or None. Returns (subject_field, subject_id, stock_doc_or_None)."""
    ing = await db.ingredients.find_one({"sku": sku}, {"_id": 0, "id": 1})
    if ing:
        stock = await db.stock.find_one({"ingredient_id": ing["id"], "store": "main"}, {"_id": 0})
        return "ingredient_id", ing["id"], stock
    prod = await db.products.find_one({"sku": sku}, {"_id": 0, "id": 1})
    if prod:
        stock = await db.stock.find_one({"product_id": prod["id"], "store": "main"}, {"_id": 0})
        return "product_id", prod["id"], stock
    return None, None, None


async def _push_delivery(req: dict, linked_business: dict) -> tuple[bool, str]:
    """Fire the outbound delivery call to the business. Runs the
    synchronous `requests` call off the event loop, mirroring the pattern
    lib/email_service.py already uses for its SMTP send."""
    payload = {
        "mother_requisition_id": req["id"],
        "items": req["items"],
        "store": req["destination_store"],
        "outlet_id": req["destination_outlet_id"],
    }

    def _send():
        return requests.post(
            f"{linked_business['base_url']}/api/stock/receive-from-mother",
            json=payload,
            headers={"X-Link-Key": linked_business["link_key"]},
            timeout=15,
        )

    try:
        resp = await asyncio.to_thread(_send)
        if resp.status_code == 200:
            return True, None
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        return False, f"HTTP {resp.status_code}: {detail}"
    except requests.RequestException as e:
        return False, f"Could not reach business: {e}"


@router.put("/mother-requisitions/{req_id}/approve")
async def approve_mother_requisition(req_id: str, current_user: User = Depends(get_current_user)):
    _require_mother_admin(current_user)
    req = await db.mother_requisitions.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Requisition not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Cannot approve a requisition with status '{req['status']}'")

    linked_business = await db.linked_businesses.find_one({"id": req["linked_business_id"]}, {"_id": 0})
    if not linked_business:
        raise HTTPException(404, "The linked business for this requisition no longer exists")

    # Resolve every line and confirm Mother actually has enough — check
    # everything BEFORE changing anything, so a short line blocks the
    # whole approval instead of partially decrementing stock.
    resolved = []
    for item in req["items"]:
        subject_field, subject_id, stock = await _find_stock_by_sku(item["sku"])
        if not subject_field:
            raise HTTPException(400, f"No ingredient/product in Mother's catalog is tagged with SKU '{item['sku']}'")
        available = float(stock.get("quantity", 0)) if stock else 0
        if available < item["quantity_requested"]:
            raise HTTPException(400, f"'{item['name']}' ({item['sku']}): only {available} available in Main Store, {item['quantity_requested']} requested")
        resolved.append((subject_field, subject_id, item["quantity_requested"]))

    for subject_field, subject_id, qty in resolved:
        await db.stock.update_one(
            {subject_field: subject_id, "store": "main"},
            {"$inc": {"quantity": -qty}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )

    ok, error = await _push_delivery(req, linked_business)
    new_status = "delivered" if ok else "delivery_failed"
    await db.mother_requisitions.update_one(
        {"id": req_id},
        {"$set": {
            "status": new_status,
            "delivery_error": error,
            "decided_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.mother_requisitions.find_one({"id": req_id}, {"_id": 0})
    return updated


@router.put("/mother-requisitions/{req_id}/retry-delivery")
async def retry_mother_requisition_delivery(req_id: str, current_user: User = Depends(get_current_user)):
    """Re-attempt the delivery push only — Mother's stock was already
    decremented on approval and must NOT be deducted again here."""
    _require_mother_admin(current_user)
    req = await db.mother_requisitions.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Requisition not found")
    if req["status"] != "delivery_failed":
        raise HTTPException(400, f"Can only retry a failed delivery (current status: '{req['status']}')")

    linked_business = await db.linked_businesses.find_one({"id": req["linked_business_id"]}, {"_id": 0})
    if not linked_business:
        raise HTTPException(404, "The linked business for this requisition no longer exists")

    ok, error = await _push_delivery(req, linked_business)
    new_status = "delivered" if ok else "delivery_failed"
    await db.mother_requisitions.update_one(
        {"id": req_id},
        {"$set": {"status": new_status, "delivery_error": error, "decided_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await db.mother_requisitions.find_one({"id": req_id}, {"_id": 0})


@router.put("/mother-requisitions/{req_id}/reject")
async def reject_mother_requisition(req_id: str, current_user: User = Depends(get_current_user)):
    _require_mother_admin(current_user)
    req = await db.mother_requisitions.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Requisition not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Cannot reject a requisition with status '{req['status']}'")
    await db.mother_requisitions.update_one(
        {"id": req_id},
        {"$set": {"status": "rejected", "decided_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await db.mother_requisitions.find_one({"id": req_id}, {"_id": 0})


# ============================================================
# BUSINESS-SIDE: receiving a delivery from Mother
# ============================================================

@router.post("/stock/receive-from-mother")
async def receive_from_mother(data: ReceiveFromMotherRequest, mother: dict = Depends(verify_mother_caller)):
    # Idempotency: if this exact delivery already landed (e.g. Mother's
    # first attempt actually succeeded but its response never arrived,
    # so Mother retried), don't credit the same stock twice.
    already = await db.stock_movements.find_one({"mother_requisition_id": data.mother_requisition_id}, {"_id": 0, "id": 1})
    if already:
        return {"message": "Already received — ignoring duplicate delivery", "duplicate": True}

    # Resolve every line before crediting anything — a delivery with even
    # one unmatched SKU fails as a whole rather than partially landing,
    # so its status on Mother's side stays an honest single outcome.
    resolved = []
    for item in data.items:
        ing = await db.ingredients.find_one({"sku": item.sku}, {"_id": 0, "id": 1})
        if ing:
            resolved.append(("ingredient_id", ing["id"], item.quantity_requested))
            continue
        prod = await db.products.find_one({"sku": item.sku}, {"_id": 0, "id": 1})
        if prod:
            resolved.append(("product_id", prod["id"], item.quantity_requested))
            continue
        raise HTTPException(404, f"No ingredient/product here is tagged with SKU '{item.sku}' — cannot receive this delivery")

    now = datetime.now(timezone.utc).isoformat()
    for subject_field, subject_id, qty in resolved:
        key = {subject_field: subject_id, "outlet_id": data.outlet_id, "store": data.store}
        existing = await db.stock.find_one(key, {"_id": 0, "id": 1})
        if existing:
            await db.stock.update_one(key, {"$inc": {"quantity": qty}, "$set": {"updated_at": now}})
        else:
            await db.stock.insert_one({
                "id": _uuid.uuid4().hex,
                **key,
                "quantity": qty,
                "min_quantity": 10,
                "updated_at": now,
            })

    await db.stock_movements.insert_one({
        "id": _uuid.uuid4().hex,
        "mother_requisition_id": data.mother_requisition_id,
        "from_store": "mother",
        "to_store": data.store,
        "outlet_id": data.outlet_id,
        "type": "in",
        "notes": f"Delivery from Mother Store ({len(resolved)} item(s))",
        "created_by": "mother",
        "created_at": now,
    })
    return {"message": "Delivery received", "items_credited": len(resolved)}


# ============================================================
# BUSINESS-SIDE: Mother connection settings + outbound proxy
# ============================================================

@router.get("/mother-connection")
async def get_mother_connection(current_user: User = Depends(get_current_user)):
    conn = await db.mother_connection.find_one({}, {"_id": 0, "link_key": 0})
    return {"base_url": conn.get("base_url") if conn else None, "configured": bool(conn and conn.get("link_key"))}


@router.put("/mother-connection")
async def set_mother_connection(data: MotherConnectionUpdate, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_settings"):
        raise HTTPException(403, "Not authorized")
    await db.mother_connection.delete_many({})
    await db.mother_connection.insert_one({"base_url": data.base_url.rstrip("/"), "link_key": data.link_key})
    return {"base_url": data.base_url.rstrip("/"), "configured": True}


async def _mother_conn_or_400():
    conn = await db.mother_connection.find_one({}, {"_id": 0})
    if not conn or not conn.get("link_key"):
        raise HTTPException(400, "Mother Store isn't configured yet — set it up under Settings → Mother Store Connection")
    return conn


@router.post("/mother/request")
async def send_mother_request(data: MotherRequisitionCreate, current_user: User = Depends(get_current_user)):
    if not has_perm(current_user, "manage_inventory"):
        raise HTTPException(403, "Not authorized")
    conn = await _mother_conn_or_400()

    def _send():
        return requests.post(
            f"{conn['base_url']}/api/mother-requisitions",
            json=data.model_dump(),
            headers={"X-Link-Key": conn["link_key"]},
            timeout=15,
        )

    try:
        resp = await asyncio.to_thread(_send)
    except requests.RequestException as e:
        raise HTTPException(502, f"Could not reach Mother Store: {e}")
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise HTTPException(resp.status_code, f"Mother Store rejected the request: {detail}")
    return resp.json()


@router.get("/mother/requests")
async def get_mother_requests(current_user: User = Depends(get_current_user)):
    conn = await _mother_conn_or_400()

    def _send():
        return requests.get(
            f"{conn['base_url']}/api/mother-requisitions/mine",
            headers={"X-Link-Key": conn["link_key"]},
            timeout=15,
        )

    try:
        resp = await asyncio.to_thread(_send)
    except requests.RequestException as e:
        raise HTTPException(502, f"Could not reach Mother Store: {e}")
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, "Mother Store could not list requests")
    return resp.json()
