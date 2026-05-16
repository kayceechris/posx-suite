#!/usr/bin/env python3
"""
POSx Suite AI Test Agent
Autonomous API tester powered by Claude claude-opus-4-7 with tool use.

Usage:
    pip install anthropic requests
    set ANTHROPIC_API_KEY=sk-ant-...
    python test_agent.py

Override target URL:
    set TEST_BASE_URL=https://marvellatech.com.ng/api
    python test_agent.py
"""

import anthropic
import requests
import json
import os
import sys
from datetime import datetime

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_URL = os.getenv("TEST_BASE_URL", "https://posx-suite.preview.emergentagent.com")
API_URL = f"{BASE_URL}/api"
TIMEOUT = 20

# ── State ─────────────────────────────────────────────────────────────────────
test_results: list[dict] = []

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _make_request(method: str, endpoint: str, body: dict | None = None,
                  token: str | None = None, params: dict | None = None) -> dict:
    url = f"{API_URL}{endpoint}" if not endpoint.startswith("http") else endpoint
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = requests.request(
            method=method.upper(), url=url, json=body,
            headers=headers, params=params, timeout=TIMEOUT
        )
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text[:800]}
        return {"status_code": r.status_code, "ok": r.status_code < 400, "data": data}
    except requests.exceptions.ConnectionError:
        return {"status_code": 0, "ok": False, "data": {"error": "Connection refused — is the server running?"}}
    except requests.exceptions.Timeout:
        return {"status_code": 0, "ok": False, "data": {"error": f"Timed out after {TIMEOUT}s"}}
    except Exception as e:
        return {"status_code": 0, "ok": False, "data": {"error": str(e)}}


# ── Tool executor ─────────────────────────────────────────────────────────────

def execute_tool(name: str, inp: dict) -> str:
    if name == "http_get":
        return json.dumps(_make_request("GET", inp["endpoint"],
                                        token=inp.get("token"),
                                        params=inp.get("params")))

    if name == "http_post":
        return json.dumps(_make_request("POST", inp["endpoint"],
                                        body=inp.get("body", {}),
                                        token=inp.get("token")))

    if name == "http_put":
        return json.dumps(_make_request("PUT", inp["endpoint"],
                                        body=inp.get("body", {}),
                                        token=inp.get("token")))

    if name == "http_delete":
        return json.dumps(_make_request("DELETE", inp["endpoint"],
                                        token=inp.get("token")))

    if name == "log_result":
        entry = {
            "test":      inp["test_name"],
            "status":    inp["status"],
            "details":   inp["details"],
            "expected":  inp.get("expected", ""),
            "actual":    inp.get("actual", ""),
            "timestamp": datetime.now().isoformat(),
        }
        test_results.append(entry)
        icon = {"PASS": "✅", "FAIL": "❌", "WARN": "⚠️ ", "SKIP": "⏭️ "}.get(inp["status"], "•")
        print(f"  {icon} {inp['test_name']}: {inp['details']}")
        return f"Logged: {inp['test_name']} → {inp['status']}"

    return f"Unknown tool: {name}"


# ── Tool schemas ──────────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "http_get",
        "description": "HTTP GET request to the restaurant POS API.",
        "input_schema": {
            "type": "object",
            "properties": {
                "endpoint": {"type": "string", "description": "Path, e.g. /products or /health"},
                "token":    {"type": "string", "description": "JWT bearer token (omit if public)"},
                "params":   {"type": "object", "description": "URL query parameters"},
            },
            "required": ["endpoint"],
        },
    },
    {
        "name": "http_post",
        "description": "HTTP POST request to the restaurant POS API.",
        "input_schema": {
            "type": "object",
            "properties": {
                "endpoint": {"type": "string"},
                "body":     {"type": "object"},
                "token":    {"type": "string"},
            },
            "required": ["endpoint", "body"],
        },
    },
    {
        "name": "http_put",
        "description": "HTTP PUT request to the restaurant POS API.",
        "input_schema": {
            "type": "object",
            "properties": {
                "endpoint": {"type": "string"},
                "body":     {"type": "object"},
                "token":    {"type": "string"},
            },
            "required": ["endpoint", "body"],
        },
    },
    {
        "name": "http_delete",
        "description": "HTTP DELETE request to the restaurant POS API.",
        "input_schema": {
            "type": "object",
            "properties": {
                "endpoint": {"type": "string"},
                "token":    {"type": "string"},
            },
            "required": ["endpoint"],
        },
    },
    {
        "name": "log_result",
        "description": (
            "Record a test result. Call this for EVERY test performed — "
            "even quick HTTP checks. This is what builds the report."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "test_name": {"type": "string", "description": "Short descriptive test name"},
                "status":    {"type": "string", "enum": ["PASS", "FAIL", "WARN", "SKIP"]},
                "details":   {"type": "string", "description": "What happened"},
                "expected":  {"type": "string", "description": "Expected outcome"},
                "actual":    {"type": "string", "description": "Actual outcome"},
            },
            "required": ["test_name", "status", "details"],
        },
    },
]


# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM = f"""You are an expert API test engineer autonomously testing the POSx Suite
restaurant POS system. Work methodically, log every result, and reason about failures.

Target API base: {API_URL}

## Credentials (use POST /auth/login with {{"pincode": "<pin>"}})
- Admin  → pincode: "123456"   (full access)
- Cashier → pincode: "1111"    (limited access)
- Waiter  → pincode: "2222"    (limited access)

## Full Test Plan — execute every section in order

### 1. Connectivity
- GET /health  →  expect 200

### 2. Database Seed
- POST /seed   →  creates demo data (idempotent, safe to repeat)

### 3. Authentication
- Login admin   (pin 123456) → save token as ADMIN_TOKEN
- Login cashier (pin 1111)   → save token as CASHIER_TOKEN
- Login waiter  (pin 2222)   → save token as WAITER_TOKEN
- Login invalid (pin 9999)   → expect 401 or 403 (security test)

### 4. Category CRUD  (use ADMIN_TOKEN)
- GET /categories
- POST /categories  (name: "Test Category", color: "#FF0000")
- GET /categories/{{id}}
- PUT /categories/{{id}}  (rename to "Updated Category")
- DELETE /categories/{{id}}

### 5. Product CRUD  (use ADMIN_TOKEN)
- GET /products
- POST /products  (name, price, category_id from step 4 or existing)
- GET /products/{{id}}
- PUT /products/{{id}}  (update price)
- DELETE /products/{{id}}

### 6. Tables & Orders
- GET /tables                 (admin)
- GET /orders                 (admin)
- GET /orders (cashier token) (should succeed)

### 7. Role-Based Access Control
- GET /users  with ADMIN_TOKEN   → expect 200
- GET /users  with CASHIER_TOKEN → expect 401 or 403

### 8. Settings & Lookup Data
- GET /settings
- GET /currencies
- GET /payment-types
- GET /printers

### 9. Customer & Supplier Management
- GET /customers
- GET /suppliers

### 10. Reports
- GET /reports/sales
- GET /reports/cost-analysis

### 11. Inventory
- GET /inventory

### 12. Purchase Orders & Suppliers — THOROUGH (focus area)

#### 12a. Supplier CRUD
- GET /suppliers with ADMIN_TOKEN → expect 200, note first supplier ID as SUPPLIER_ID
- POST /suppliers body={{"name":"Test Supplier","contact_name":"John","phone":"555-1234","email":"test@supplier.com","address":"123 Main St"}} → expect 200/201, save id as TEST_SUPPLIER_ID
- PUT /suppliers/{{TEST_SUPPLIER_ID}} body={{"name":"Updated Supplier"}} → expect 200
- GET /suppliers with CASHIER_TOKEN → expect 403 (cashiers cannot manage suppliers)
- GET /suppliers with WAITER_TOKEN  → expect 403

#### 12b. Purchase Order CRUD
- GET /purchase-orders with ADMIN_TOKEN → expect 200, note current count
- POST /purchase-orders with ADMIN_TOKEN body={{
    "supplier_id": "{{SUPPLIER_ID or TEST_SUPPLIER_ID}}",
    "type": "external",
    "status": "pending",
    "items": [{{"description":"Item A","quantity":10,"unit":"carton","unit_cost":5.00,"total":50.0}}],
    "subtotal": 50.0,
    "tax": 0.0,
    "total": 50.0,
    "notes": "Test PO"
  }} → expect 200/201, save id as TEST_PO_ID
- CRITICAL: GET /purchase-orders again, find TEST_PO_ID, verify its status field equals "pending" (NOT "draft") — if status is "draft" this is a BUG
- GET /purchase-orders with CASHIER_TOKEN → expect 403
- GET /purchase-orders with WAITER_TOKEN  → expect 403

#### 12c. Approval workflow
- PUT /purchase-orders/{{TEST_PO_ID}} with ADMIN_TOKEN body={{"status":"approved"}} → expect 200
- GET /purchase-orders, find TEST_PO_ID, verify status is now "approved"
- Verify GET /purchase-orders returns the PO in the list (sync test — simulates the frontend Refresh button re-fetching data)

#### 12d. Received workflow
- PUT /purchase-orders/{{TEST_PO_ID}} with ADMIN_TOKEN body={{"status":"received"}} → expect 200
- GET /purchase-orders, verify status is "received"

#### 12e. Cancellation
- Create another PO with status "pending", then PUT status="cancelled", verify it reflects

#### 12f. Permission-based access (approve_purchase permission)
- POST /users with ADMIN_TOKEN to create a staff user with permissions=["approve_purchase"] and role="cashier", pin "9876"
- Login with pin "9876" → save PERM_TOKEN
- GET /purchase-orders with PERM_TOKEN → note result: if 403, log WARN "Backend only allows admin/manager roles for PO routes — users with approve_purchase permission get blocked"
- GET /suppliers with PERM_TOKEN → note result similarly

#### 12g. Cleanup
- DELETE /purchase-orders/{{TEST_PO_ID}} with ADMIN_TOKEN → expect 200
- DELETE /suppliers/{{TEST_SUPPLIER_ID}} with ADMIN_TOKEN → expect 200

## Rules
- Call log_result for EVERY test (use specific test names like "Auth: admin login")
- Include the actual HTTP status code in the `actual` field
- PASS = correct status + valid response body
- FAIL = wrong status or error body
- WARN = unexpected but non-blocking issue
- SKIP only if the server is unreachable
- If /seed fails, continue testing with whatever data exists
- After finishing ALL tests, print a text summary with counts and a list of failures
"""


# ── Agent loop ────────────────────────────────────────────────────────────────

def run():
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable is not set.")
        print("Set it with:  set ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    print(f"\n{'='*62}")
    print(f"  POSx Suite AI Test Agent")
    print(f"  Target : {BASE_URL}")
    print(f"  Model  : claude-opus-4-7")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*62}\n")
    print("Running tests...\n")

    client = anthropic.Anthropic()
    messages = [
        {
            "role": "user",
            "content": (
                "Execute the full test plan now. Work through every section, "
                "call log_result for each test, then finish with a summary."
            ),
        }
    ]

    # Agentic loop — runs until Claude returns end_turn
    while True:
        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=16000,
            thinking={"type": "adaptive"},
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
        )

        # Append full assistant turn (preserves tool_use blocks)
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            for block in response.content:
                if getattr(block, "type", None) == "text" and block.text.strip():
                    print(f"\n{block.text}")
            break

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if getattr(block, "type", None) == "tool_use":
                    result = execute_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
            messages.append({"role": "user", "content": tool_results})

    _print_summary()


# ── Summary & report ──────────────────────────────────────────────────────────

def _print_summary():
    counts = {"PASS": 0, "FAIL": 0, "WARN": 0, "SKIP": 0}
    for r in test_results:
        counts[r["status"]] += 1

    total = sum(counts.values())
    print(f"\n{'='*62}")
    print(f"  RESULTS")
    print(f"{'='*62}")
    print(f"  Total  : {total}")
    print(f"  ✅ Pass : {counts['PASS']}")
    print(f"  ❌ Fail : {counts['FAIL']}")
    print(f"  ⚠️  Warn : {counts['WARN']}")
    print(f"  ⏭️  Skip : {counts['SKIP']}")
    print(f"{'='*62}")

    if counts["FAIL"] > 0:
        print("\nFailed tests:")
        for r in test_results:
            if r["status"] == "FAIL":
                print(f"  ❌ {r['test']}")
                print(f"       {r['details']}")
                if r["actual"]:
                    print(f"       actual: {r['actual']}")

    report_file = f"test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({
            "target":    BASE_URL,
            "timestamp": datetime.now().isoformat(),
            "summary":   counts,
            "results":   test_results,
        }, f, indent=2)
    print(f"\nJSON report saved → {report_file}")


if __name__ == "__main__":
    run()
