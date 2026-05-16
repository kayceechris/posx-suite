#!/usr/bin/env python3
"""
POSx Suite — Print Utility AI Test Agent
Autonomous tester for all print-related infrastructure powered by Claude claude-opus-4-7.

Covers:
  - Printer CRUD (GET /printers, POST, DELETE)
  - Printer assignment by outlet (GET /printers/assigned)
  - Printer Groups CRUD (GET/POST/PUT/DELETE /printer-groups)
  - Peripherals CRUD (GET/POST/DELETE /peripherals)
  - Customer-facing Display (POST /display/update, GET /display/current, POST /display/clear)
  - Receipt settings (GET /settings → receipt_header, receipt_footer, company_logo)
  - Role-based access (cashier/waiter blocked from admin printer endpoints)
  - Input validation (missing fields, 404 on unknown IDs)
  - Full lifecycle: create → verify → update → delete

Usage:
    pip install anthropic requests
    set ANTHROPIC_API_KEY=sk-ant-...
    python test_agent_print.py

Override target:
    set TEST_BASE_URL=https://marvellatech.com.ng/api
    python test_agent_print.py
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
            headers=headers, params=params, timeout=TIMEOUT,
        )
        try:
            data = r.json()
        except Exception:
            data = {"raw": r.text[:800]}
        return {"status_code": r.status_code, "ok": r.status_code < 400, "data": data}
    except requests.exceptions.ConnectionError:
        return {"status_code": 0, "ok": False,
                "data": {"error": "Connection refused — is the server running?"}}
    except requests.exceptions.Timeout:
        return {"status_code": 0, "ok": False,
                "data": {"error": f"Timed out after {TIMEOUT}s"}}
    except Exception as e:
        return {"status_code": 0, "ok": False, "data": {"error": str(e)}}


# ── Tool executor ─────────────────────────────────────────────────────────────

def execute_tool(name: str, inp: dict) -> str:
    if name == "http_get":
        return json.dumps(_make_request(
            "GET", inp["endpoint"],
            token=inp.get("token"), params=inp.get("params"),
        ))
    if name == "http_post":
        return json.dumps(_make_request(
            "POST", inp["endpoint"],
            body=inp.get("body", {}), token=inp.get("token"),
        ))
    if name == "http_put":
        return json.dumps(_make_request(
            "PUT", inp["endpoint"],
            body=inp.get("body", {}), token=inp.get("token"),
        ))
    if name == "http_delete":
        return json.dumps(_make_request(
            "DELETE", inp["endpoint"], token=inp.get("token"),
        ))
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
        "description": "HTTP GET to the restaurant POS API.",
        "input_schema": {
            "type": "object",
            "properties": {
                "endpoint": {"type": "string"},
                "token":    {"type": "string"},
                "params":   {"type": "object"},
            },
            "required": ["endpoint"],
        },
    },
    {
        "name": "http_post",
        "description": "HTTP POST to the restaurant POS API.",
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
        "description": "HTTP PUT to the restaurant POS API.",
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
        "description": "HTTP DELETE to the restaurant POS API.",
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
        "description": "Record a test result. Call for EVERY test — even quick checks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "test_name": {"type": "string"},
                "status":    {"type": "string", "enum": ["PASS", "FAIL", "WARN", "SKIP"]},
                "details":   {"type": "string"},
                "expected":  {"type": "string"},
                "actual":    {"type": "string"},
            },
            "required": ["test_name", "status", "details"],
        },
    },
]


# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM = f"""You are an expert API test engineer focused exclusively on the **print utility** of
the POSx Suite restaurant POS system. Work methodically through every test section below,
log every result with log_result, and reason carefully about any failures.

Target API: {API_URL}

## Authentication
Login with POST /auth/login using {{"pincode": "<pin>"}}. Save the token from the response.
- Admin  → pincode "123456"   (role: admin — full printer access)
- Cashier → pincode "1111"    (role: cashier — outlet printers only via /assigned)
- Waiter  → pincode "2222"    (role: waiter — same as cashier)

To get an outlet_id for printer creation, call GET /outlets after admin login and use
the first outlet's id.

## Printer Models
POST /printers body:
{{
  "name": str,
  "mode": str,      -- "lan" | "usb" | "bluetooth"
  "type": str,      -- "receipt" | "kitchen" | "label"
  "ip_address": str | null,
  "port": int | null,
  "outlet_id": str,
  "terminal_id": str | null
}}

## Printer Group Model
POST /printer-groups body:
{{
  "name": str,
  "printer_id": str | null,
  "product_ids": [],
  "category_ids": []
}}

## Peripheral Model
POST /peripherals body:
{{
  "name": str,
  "type": str,          -- e.g. "cash_drawer", "barcode_scanner", "customer_display"
  "connection": str,    -- "usb" | "lan" | "bluetooth"
  "ip_address": str | null,
  "port": int | null,
  "outlet_id": str | null
}}

## Display Model
POST /display/update body:
{{
  "terminal_id": str,
  "business_name": str,
  "company_logo": null,
  "items": [{{"product_name": str, "quantity": int, "price": float, "total": float}}],
  "subtotal": float,
  "tax": float,
  "total": float,
  "status": str,
  "message": str
}}

---

## FULL PRINT TEST PLAN — execute every section in order

### SECTION A — Setup
A1. GET /health — verify server is reachable
A2. POST /seed  — seed demo data (idempotent)
A3. Login admin (pin 123456)   → save ADMIN_TOKEN
A4. Login cashier (pin 1111)   → save CASHIER_TOKEN
A5. Login waiter (pin 2222)    → save WAITER_TOKEN
A6. GET /outlets (admin)       → save first outlet's id as OUTLET_ID

### SECTION B — Printer CRUD (admin)
B1.  GET /printers (admin)         → expect 200, list (may be empty)
B2.  POST /printers — LAN receipt printer:
       name "Test LAN Receipt", mode "lan", type "receipt",
       ip_address "192.168.1.100", port 9100, outlet_id OUTLET_ID
       → expect 200/201, save id as LAN_PRINTER_ID
B3.  POST /printers — USB kitchen printer:
       name "Test USB Kitchen", mode "usb", type "kitchen",
       ip_address null, port null, outlet_id OUTLET_ID
       → expect 200/201, save id as USB_PRINTER_ID
B4.  POST /printers — Bluetooth label printer:
       name "Test BT Label", mode "bluetooth", type "label",
       ip_address null, port null, outlet_id OUTLET_ID
       → expect 200/201, save id as BT_PRINTER_ID
B5.  GET /printers (admin)         → expect list contains all 3 new printers
B6.  DELETE /printers/LAN_PRINTER_ID → expect 200, message "Printer deleted successfully"
B7.  DELETE /printers/nonexistent-printer-id → expect 404
B8.  POST /printers missing outlet_id (omit it) → expect 422 validation error
B9.  DELETE /printers/USB_PRINTER_ID  → clean up
B10. DELETE /printers/BT_PRINTER_ID  → clean up

### SECTION C — Printer Access Control
C1. GET /printers with CASHIER_TOKEN → expect 403 (cashier is not admin/manager)
C2. GET /printers with WAITER_TOKEN  → expect 403
C3. GET /printers/assigned with CASHIER_TOKEN → expect 200 (cashier can see outlet printers)
C4. GET /printers/assigned with WAITER_TOKEN  → expect 200
C5. GET /printers/assigned with ADMIN_TOKEN   → expect 200
C6. POST /printers with CASHIER_TOKEN → expect 403
C7. DELETE /printers/any-id with CASHIER_TOKEN → expect 403

### SECTION D — Printer Groups CRUD (admin)
D1. GET /printer-groups (admin)          → expect 200, list
D2. POST /printer-groups:
      name "Kitchen Group", printer_id USB_PRINTER_ID (if available, else null),
      product_ids [], category_ids []
      → expect 200/201, save id as GROUP_ID
D3. GET /printer-groups (admin)          → verify new group appears
D4. PUT /printer-groups/GROUP_ID:
      name "Kitchen Group Updated", printer_id null, product_ids [], category_ids []
      → expect 200
D5. GET /printer-groups (admin)          → verify name updated
D6. DELETE /printer-groups/GROUP_ID     → expect 200
D7. DELETE /printer-groups/nonexistent  → expect 404
D8. GET /printer-groups with CASHIER_TOKEN → expect 403

### SECTION E — Peripherals CRUD (admin)
E1. GET /peripherals (admin)             → expect 200, list
E2. POST /peripherals — USB cash drawer:
      name "Test Cash Drawer", type "cash_drawer",
      connection "usb", ip_address null, port null, outlet_id OUTLET_ID
      → expect 200/201, save id as PERIPHERAL_ID
E3. POST /peripherals — LAN barcode scanner:
      name "Test Scanner", type "barcode_scanner",
      connection "lan", ip_address "192.168.1.200", port 5000, outlet_id null
      → expect 200/201, save id as SCANNER_ID
E4. GET /peripherals (admin)             → verify both appear
E5. DELETE /peripherals/PERIPHERAL_ID   → expect 200
E6. DELETE /peripherals/SCANNER_ID      → expect 200
E7. DELETE /peripherals/nonexistent     → expect 404
E8. GET /peripherals with CASHIER_TOKEN → expect 403

### SECTION F — Customer-Facing Display
F1. GET /display/current (no auth, default terminal) → expect 200, welcome state
F2. POST /display/update — push a test order to display:
      terminal_id "test-terminal-001",
      business_name "Test Restaurant",
      items: [{{"product_name": "Burger", "quantity": 2, "price": 9.99, "total": 19.98}}],
      subtotal: 19.98, tax: 1.60, total: 21.58,
      status: "ordering", message: "Order in progress"
      → expect 200, ok: true
F3. GET /display/current?terminal_id=test-terminal-001 → expect 200, items shows Burger
F4. GET /display/current?terminal_id=test-terminal-001 → verify subtotal 19.98, total 21.58
F5. POST /display/clear?terminal_id=test-terminal-001  → expect 200, ok: true
F6. GET /display/current?terminal_id=test-terminal-001 → expect 200, items empty, status "paid"
F7. GET /display/current?terminal_id=unknown-terminal  → expect 200, welcome/empty state (no 404)
F8. POST /display/update — empty cart:
      terminal_id "test-terminal-002", items [], subtotal 0, tax 0, total 0,
      status "idle", message "No items"
      → expect 200

### SECTION G — Receipt / Settings Configuration
G1. GET /settings                          → expect 200
G2. Verify settings has receipt_header field  (check response body)
G3. Verify settings has receipt_footer field
G4. Verify settings has company_logo field
G5. Verify settings has business_name field
G6. Verify settings has tax_enabled and tax_mode fields

### SECTION H — Edge Cases & Validation
H1. POST /printers — LAN printer missing ip_address (provide mode "lan" but no ip_address)
    → Note actual behaviour (may accept null, may reject)
H2. POST /printers — port out of typical range (port: 99999, mode "lan", outlet_id OUTLET_ID)
    → Note actual behaviour
H3. POST /display/update — empty terminal_id ""  → note response
H4. POST /printer-groups with no body     → expect 422

---

## Rules
- log_result for EVERY test above (use section+number as test_name, e.g. "B2: Create LAN printer")
- PASS = expected status code + valid response body
- FAIL = wrong status code or error body
- WARN = unexpected but non-blocking (e.g. returns 200 where 201 expected, or extra fields)
- SKIP only if server unreachable
- Include actual HTTP status code in the `actual` field
- After completing all tests, print a full text summary with pass/fail counts and a list of failures
"""


# ── Agent loop ────────────────────────────────────────────────────────────────

def run():
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY is not set.")
        print("  set ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    print(f"\n{'='*64}")
    print(f"  POSx Suite — Print Utility AI Test Agent")
    print(f"  Target : {BASE_URL}")
    print(f"  Model  : claude-opus-4-7 (adaptive thinking)")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*64}\n")
    print("Running print utility tests...\n")

    client = anthropic.Anthropic()
    messages = [
        {
            "role": "user",
            "content": (
                "Execute the full print utility test plan now. "
                "Work through every section A–H in order, call log_result for every "
                "individual test, then finish with a comprehensive summary."
            ),
        }
    ]

    while True:
        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=16000,
            thinking={"type": "adaptive"},
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
        )

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
    print(f"\n{'='*64}")
    print(f"  PRINT UTILITY TEST RESULTS")
    print(f"{'='*64}")
    print(f"  Total  : {total}")
    print(f"  ✅ Pass : {counts['PASS']}")
    print(f"  ❌ Fail : {counts['FAIL']}")
    print(f"  ⚠️  Warn : {counts['WARN']}")
    print(f"  ⏭️  Skip : {counts['SKIP']}")
    print(f"{'='*64}")

    if counts["FAIL"] > 0:
        print("\nFailed tests:")
        for r in test_results:
            if r["status"] == "FAIL":
                print(f"  ❌ {r['test']}")
                print(f"       {r['details']}")
                if r["actual"]:
                    print(f"       actual: {r['actual']}")

    if counts["WARN"] > 0:
        print("\nWarnings:")
        for r in test_results:
            if r["status"] == "WARN":
                print(f"  ⚠️  {r['test']}: {r['details']}")

    report_file = f"print_test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({
            "suite":     "Print Utility",
            "target":    BASE_URL,
            "timestamp": datetime.now().isoformat(),
            "summary":   counts,
            "results":   test_results,
        }, f, indent=2)
    print(f"\nJSON report saved → {report_file}")


if __name__ == "__main__":
    run()
