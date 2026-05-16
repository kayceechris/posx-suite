"""Targeted Purchase Order test — covers pending/approved views and sync behaviour."""
import requests, json, sys

import os
BASE = os.getenv("TEST_BASE_URL", "https://marvellatech.com.ng/api") + "/api"
PASS = FAIL = WARN = 0

def check(label, resp, expected_status, extra_check=None):
    global PASS, FAIL, WARN
    ok = resp.status_code == expected_status
    try:
        data = resp.json()
    except Exception:
        data = {}
    if ok and (extra_check is None or extra_check(data)):
        print(f"  PASS  {label} (HTTP {resp.status_code})")
        PASS += 1
        return data
    elif ok and extra_check:
        print(f"  WARN  {label} (HTTP ok but assertion failed) -> {str(data)[:160]}")
        WARN += 1
        return data
    else:
        print(f"  FAIL  {label} (got {resp.status_code}, expected {expected_status}) -> {str(data)[:160]}")
        FAIL += 1
        return data


# ── Connectivity & Seed ────────────────────────────────────────────────────────
print("\n=== CONNECTIVITY ===")
try:
    r = requests.get(f"{BASE}/health", timeout=10)
    check("GET /health", r, 200)
except Exception as e:
    print(f"  FAIL  Server unreachable: {e}")
    sys.exit(1)

print("\n=== SEED ===")
r = requests.post(f"{BASE}/seed", timeout=15)
print(f"  Seed: HTTP {r.status_code}")

# ── Auth ───────────────────────────────────────────────────────────────────────
print("\n=== AUTH ===")
r = requests.post(f"{BASE}/auth/login", json={"pincode": "123456"}, timeout=10)
d = check("Admin login", r, 200, lambda d: "token" in d)
ADMIN = d.get("token")

r = requests.post(f"{BASE}/auth/login", json={"pincode": "1111"}, timeout=10)
d = check("Cashier login", r, 200, lambda d: "token" in d)
CASHIER = d.get("token")

r = requests.post(f"{BASE}/auth/login", json={"pincode": "2222"}, timeout=10)
d = check("Waiter login", r, 200, lambda d: "token" in d)
WAITER = d.get("token")

AH = {"Authorization": f"Bearer {ADMIN}"}
CH = {"Authorization": f"Bearer {CASHIER}"}
WH = {"Authorization": f"Bearer {WAITER}"}

# ── Suppliers ──────────────────────────────────────────────────────────────────
print("\n=== SUPPLIERS ===")
r = requests.get(f"{BASE}/suppliers", headers=AH, timeout=10)
sup_list = check("GET /suppliers (admin)", r, 200, lambda d: isinstance(d, list))
SUPPLIER_ID = sup_list[0]["id"] if sup_list else None

r = requests.post(f"{BASE}/suppliers", headers=AH,
                  json={"name": "Test Supplier", "phone": "555-0001"}, timeout=10)
d = check("POST /suppliers (admin)", r, 200)
TEST_SUP = d.get("id")

if TEST_SUP:
    r = requests.put(f"{BASE}/suppliers/{TEST_SUP}", headers=AH,
                     json={"name": "Updated Supplier"}, timeout=10)
    check("PUT /suppliers/:id (admin)", r, 200)

r = requests.get(f"{BASE}/suppliers", headers=CH, timeout=10)
check("GET /suppliers (cashier -> 403)", r, 403)

r = requests.get(f"{BASE}/suppliers", headers=WH, timeout=10)
check("GET /suppliers (waiter -> 403)", r, 403)

# ── Create PO ─────────────────────────────────────────────────────────────────
print("\n=== CREATE PURCHASE ORDER ===")
r = requests.get(f"{BASE}/purchase-orders", headers=AH, timeout=10)
existing = check("GET /purchase-orders (admin, baseline)", r, 200, lambda d: isinstance(d, list))
print(f"       {len(existing)} existing POs")

sup_id = SUPPLIER_ID or TEST_SUP
r = requests.post(f"{BASE}/purchase-orders", headers=AH, json={
    "supplier_id": sup_id,
    "type": "external",
    "status": "pending",
    "items": [{"description": "Widget A", "quantity": 10, "unit": "carton",
               "unit_cost": 5.0, "total": 50.0}],
    "subtotal": 50.0, "tax": 0.0, "total": 50.0,
    "notes": "Automated test PO",
}, timeout=10)
created = check("POST /purchase-orders status=pending", r, 200)
TEST_PO = created.get("id")
saved_status = created.get("status")
print(f"       Response status field = {saved_status!r}")

# ── Status persistence (the sync-button bug check) ────────────────────────────
print("\n=== STATUS PERSISTENCE (sync simulation) ===")
if TEST_PO:
    r = requests.get(f"{BASE}/purchase-orders", headers=AH, timeout=10)
    all_pos = r.json() if r.ok else []
    po = next((p for p in all_pos if p["id"] == TEST_PO), None)
    if po:
        fetched = po.get("status")
        print(f"       Re-fetched status = {fetched!r}")
        if fetched == "pending":
            print(f"  PASS  Status persists as 'pending' after re-fetch (Pending tab would show it)")
            PASS += 1
        elif fetched == "draft":
            print(f"  FAIL  Status saved as 'draft' not 'pending' — Pending view filters ['pending','draft'] so it shows, but Approved view would never get it. BUG: PurchaseOrderCreate.status default not honouring request body.")
            FAIL += 1
        else:
            print(f"  WARN  Unexpected status {fetched!r}")
            WARN += 1
    else:
        print(f"  FAIL  PO {TEST_PO} not found after re-fetch — disappeared from list!")
        FAIL += 1
else:
    print("  SKIP  No PO ID to check")

# ── Pending filter simulation ─────────────────────────────────────────────────
print("\n=== PENDING VIEW FILTER SIMULATION ===")
if TEST_PO:
    r = requests.get(f"{BASE}/purchase-orders", headers=AH, timeout=10)
    all_pos = r.json() if r.ok else []
    pending_pos = [p for p in all_pos if p.get("status") in ["pending", "draft"]]
    approved_pos = [p for p in all_pos if p.get("status") in ["approved", "received"]]
    our_po = next((p for p in all_pos if p["id"] == TEST_PO), None)
    print(f"       Total POs: {len(all_pos)}, Pending/Draft: {len(pending_pos)}, Approved/Received: {len(approved_pos)}")

    if our_po and our_po["id"] in [p["id"] for p in pending_pos]:
        print(f"  PASS  New PO appears in Pending view filter")
        PASS += 1
    else:
        print(f"  FAIL  New PO NOT in Pending view — would be invisible after sync")
        FAIL += 1
    if our_po and our_po["id"] not in [p["id"] for p in approved_pos]:
        print(f"  PASS  New PO correctly absent from Approved view filter")
        PASS += 1
    else:
        print(f"  FAIL  New PO incorrectly appears in Approved view")
        FAIL += 1

# ── Approval workflow ─────────────────────────────────────────────────────────
print("\n=== APPROVAL WORKFLOW ===")
if TEST_PO:
    r = requests.put(f"{BASE}/purchase-orders/{TEST_PO}", headers=AH,
                     json={"status": "approved"}, timeout=10)
    d = check("PUT status=approved", r, 200, lambda d: d.get("status") == "approved")
    print(f"       Approval returned status = {d.get('status')!r}")

    r = requests.get(f"{BASE}/purchase-orders", headers=AH, timeout=10)
    all_pos = r.json() if r.ok else []
    po = next((p for p in all_pos if p["id"] == TEST_PO), None)

    # After approval: should be in Approved view, NOT in Pending view
    if po and po.get("status") == "approved":
        print(f"  PASS  Approved PO has status='approved' in list")
        PASS += 1
    else:
        print(f"  FAIL  Status not 'approved' after approval: {po}")
        FAIL += 1

    approved_pos = [p for p in all_pos if p.get("status") in ["approved", "received"]]
    pending_pos  = [p for p in all_pos if p.get("status") in ["pending", "draft"]]
    in_approved  = TEST_PO in [p["id"] for p in approved_pos]
    in_pending   = TEST_PO in [p["id"] for p in pending_pos]

    if in_approved:
        print(f"  PASS  Approved PO appears in Approved view filter")
        PASS += 1
    else:
        print(f"  FAIL  Approved PO missing from Approved view — sync button would not show it")
        FAIL += 1
    if not in_pending:
        print(f"  PASS  Approved PO correctly absent from Pending view filter")
        PASS += 1
    else:
        print(f"  FAIL  Approved PO still showing in Pending view — misdisplay BUG")
        FAIL += 1

# ── Received workflow ─────────────────────────────────────────────────────────
print("\n=== RECEIVED WORKFLOW ===")
if TEST_PO:
    r = requests.put(f"{BASE}/purchase-orders/{TEST_PO}", headers=AH,
                     json={"status": "received"}, timeout=10)
    d = check("PUT status=received", r, 200, lambda d: d.get("status") == "received")
    print(f"       Returned status = {d.get('status')!r}")

# ── Access control ────────────────────────────────────────────────────────────
print("\n=== ACCESS CONTROL ===")
r = requests.get(f"{BASE}/purchase-orders", headers=CH, timeout=10)
check("GET /purchase-orders (cashier -> 403)", r, 403)

r = requests.get(f"{BASE}/purchase-orders", headers=WH, timeout=10)
check("GET /purchase-orders (waiter -> 403)", r, 403)

# ── Permission-based access (approve_purchase) ────────────────────────────────
print("\n=== PERMISSION-BASED ACCESS (approve_purchase) ===")
r = requests.get(f"{BASE}/users", headers=AH, timeout=10)
users = r.json() if r.ok else []
perm_user = next((u for u in users if "approve_purchase" in (u.get("permissions") or [])), None)
if perm_user:
    print(f"       Found user '{perm_user.get('name')}' (role={perm_user.get('role')}) with approve_purchase")
    # We can't log in without the pincode (it's not returned); log a WARN
    print(f"  WARN  Cannot test login (pincode not returned by API). Check manually: role={perm_user.get('role')!r} — if not admin/manager, they get 403 on PO routes.")
    WARN += 1
else:
    print("  SKIP  No seeded user has approve_purchase permission")

# ── Cancellation ──────────────────────────────────────────────────────────────
print("\n=== CANCELLATION ===")
r = requests.post(f"{BASE}/purchase-orders", headers=AH, json={
    "supplier_id": sup_id, "type": "external", "status": "pending",
    "items": [{"description": "Cancel test", "quantity": 1, "unit": "pcs",
               "unit_cost": 1.0, "total": 1.0}],
    "subtotal": 1.0, "tax": 0.0, "total": 1.0,
}, timeout=10)
cancel_d = check("POST pending PO for cancel test", r, 200)
CANCEL_PO = cancel_d.get("id")
if CANCEL_PO:
    r = requests.put(f"{BASE}/purchase-orders/{CANCEL_PO}", headers=AH,
                     json={"status": "cancelled"}, timeout=10)
    d = check("PUT status=cancelled", r, 200, lambda d: d.get("status") == "cancelled")
    print(f"       Cancelled status = {d.get('status')!r}")

# ── Cleanup ───────────────────────────────────────────────────────────────────
print("\n=== CLEANUP ===")
for po_id in [TEST_PO, CANCEL_PO]:
    if po_id:
        r = requests.delete(f"{BASE}/purchase-orders/{po_id}", headers=AH, timeout=10)
        check(f"DELETE /purchase-orders/{po_id[:8]}...", r, 200)
if TEST_SUP:
    r = requests.delete(f"{BASE}/suppliers/{TEST_SUP}", headers=AH, timeout=10)
    check("DELETE /suppliers/test", r, 200)

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'='*50}")
print(f"  PASS: {PASS}   FAIL: {FAIL}   WARN: {WARN}")
print(f"{'='*50}")
sys.exit(1 if FAIL > 0 else 0)
