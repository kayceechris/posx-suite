# POSx Suite - Product Requirements Document

## Original Problem Statement
Create a point of sale software, multi user, multi waiter, admin panel, inventory management, stock management, customer management, cashier management, multi platform, multi terminal to server, multi outlet and warehouse.

**Requirements:** Web + mobile, no payment integration, users login using pincode, colourful and vibrant, all features equally.

## Architecture
- **Backend:** FastAPI + MongoDB (Motor async driver)
- **Frontend:** React + Tailwind CSS + shadcn/ui
- **Auth:** Pincode-based JWT authentication
- **Offline:** Service Worker + offline manager
- **CDS:** In-memory display store, polled at 1.5s intervals

### Backend Structure (Refactored Feb 2026)
```
/app/backend/
├── server.py          (Slim entry: app creation, middleware, router inclusion)
├── database.py        (MongoDB connection singleton)
├── auth.py            (JWT helpers, get_current_user, check_permission)
├── models.py          (All Pydantic models)
├── routes/
│   ├── __init__.py    (Aggregates all routers)
│   ├── auth.py        (Login, /auth/me)
│   ├── users.py       (CRUD + waiters list)
│   ├── outlets.py     (CRUD)
│   ├── products.py    (Products + Categories CRUD)
│   ├── inventory.py   (Stock + Stock Movements)
│   ├── orders.py      (Orders CRUD + Complete + Split Bills + Held)
│   ├── tables.py      (Tables + Claim/Transfer/Release)
│   ├── settings.py    (Business Settings + Registration)
│   ├── payments.py    (Payment Types + Currencies)
│   ├── printers.py    (Printers + Assigned)
│   ├── customers.py   (Customers CRUD)
│   ├── suppliers.py   (Suppliers + Purchase Orders)
│   ├── accounts.py    (Expenses + P&L Summary)
│   ├── reports.py     (Sales, Cost, Staff, Payment Methods)
│   ├── analytics.py   (Dashboard Analytics)
│   ├── roles.py       (Roles + Permissions)
│   ├── display.py     (Customer-Facing Display)
│   ├── peripherals.py (Peripherals CRUD)
│   ├── upload.py      (File Upload + Serve)
│   └── seed.py        (Seed Data)
├── uploads/           (Static directory for local images)
└── tests/
```

## What's Been Implemented
- [x] Base Backend & Frontend Setup with Pincode Auth
- [x] Admin Dashboard (13 modules)
- [x] Cashier POS Interface (quick service + table order modes)
- [x] Waiter Table Management Interface (claim, hold order, lock tables)
- [x] Table Transfers Between Waiters
- [x] Mobile responsive Cart + PaymentWidget
- [x] Offline Mode (service-worker.js & offlineManager.js)
- [x] Advanced Permissions Matrix & Currency Multi-support
- [x] Split Bill UI in Table Ordering
- [x] Printer Integration (ESC/POS) with USB/LAN/Bluetooth modes
- [x] Suppliers Module — Full CRUD
- [x] Purchases Module — Internal/external requisition with PO workflow
- [x] Reports Module — Split into 4 sub-pages under Reports submenu: Sales, Cost Analysis, Staff Performance, Payment Methods (Feb 2026)
- [x] Settings Module — Split into 6 sub-pages under Settings submenu (in-page tabs hidden, sidebar drives navigation) (Feb 2026)
- [x] CSV Import — Resolves Brand/Unit/Outlet/Terminal columns by name OR id (Feb 2026)
- [x] Multi-Terminal Pricing — Products can carry an array of terminal-specific prices (`terminal_prices: [{outlet_id, terminal_id, price, cost_price}]`). Cashier auto-picks the terminal-specific price based on the active terminal in `pos_terminal_config` (localStorage). UI in Add/Edit Product dialog with `+ Add Terminal Price` button. (Feb 2026)
- [x] Bulk Set Terminal Prices — Admin → Products page has a "Bulk Set Terminal Prices" button. Dialog lets admin pick terminal/outlet, mode (fixed/% from base/% from cost/delta), value, optional rounding, and multi-select products with live preview. Backend endpoint `POST /api/products/bulk-terminal-price`. (Feb 2026)
- [x] Active Terminal Chip — Quick terminal switcher visible in Cashier + Waiter page headers (`ActiveTerminalChip` component). Fires `pos-terminal-changed` event so price displays update live. (Feb 2026)
- [x] Products List — Search by name, filter by category and brand, clear filters button, "+ New Product" header button. Fixed sidebar "Create Product" submenu autoOpen reactivity bug. (Feb 2026)
- [x] Tax Settings — Enable/disable master toggle + Inclusive/Exclusive mode + CRUD tax rates (one default). Cashier checkout uses default tax rate from Settings → Tax. Endpoints: `GET/POST/PUT/DELETE /api/taxes`, `tax_enabled`/`tax_mode` on `/api/settings`. (Feb 2026)
- [x] Real Test Print — `printUtil.js` uses hidden iframe + `window.print()` so the OS print dialog opens for "Browser / System Printer" mode. Replaces the fake setTimeout success toast that didn't print. New mode "Browser / System Printer (recommended)" supports any OS-installed printer (USB/LAN/AirPrint/PDF). (Feb 2026)
- [x] Outlet & Warehouse Delete — `DELETE /api/outlets/{id}` with reference-integrity guard (blocks delete if products/terminals/orders reference it). Trash-icon button on Outlets page next to Edit. (Feb 2026)
- [x] Cashier/Waiter Name on Orders & Receipts — `Order` model gained `created_by_name`, `created_by_role`, `terminal_id`. Cashier + Table flows now send `terminal_id` from `pos_terminal_config`. Receipt template prints "Cashier: {name}". (Feb 2026)
- [x] Purchase Orders Mobile Layout — Centred max-w-5xl, vertical item cards (qty/cost/total in 3-col grid) instead of horizontal row that wrapped on mobile. (Feb 2026)
- [x] Order Management Filters — Filter by Outlet AND Terminal. Cashier/Waiter name + Terminal columns added to table and detail dialog. Clear filters button. (Feb 2026)
- [x] Import/Export Fixed — Auth-aware downloads via axios blob (replaced broken `window.open()` that was failing 401). Added "Download Example Sheet" templates for both Products and Stock with 3 pre-filled example rows using real category/brand/unit/outlet/terminal names. Stock export/import uses Outlet **name** column (not raw id). Roundtrip verified: template → import → reflects in DB. (Feb 2026)
- [x] F&B Role Gating — Restaurant / Cafe / Bar / Nightclub business types: only Admin/Manager/Cashier roles see Complete Cash/Card buttons on TableOrderPage. Waiters see "Checkout is handled by a cashier" notice + can still Hold + Send to Kitchen. (Feb 2026)
- [x] Send to Kitchen / Bar — New orange button on Cashier + Table Order pages. Routes items by Printer Group (matched on category/product) and prints one ESC/POS kitchen ticket per destination printer. Reports back e.g. "2 tickets printed, 1 unrouted". (Feb 2026)
- [x] Android LAN Printer (RawBT bridge) — `printUtil.js` now builds raw ESC/POS bytes + base64-encodes them and triggers `rawbt:` URL scheme so the free RawBT Android app handles the actual TCP/Bluetooth/USB-OTG print. Resolves the mixed-content / no-raw-TCP limitation that broke direct LAN printing on Android browsers. UI shows an Android-specific "install RawBT" hint when LAN mode is selected. (Feb 2026)
- [x] Receipt Print Cleanup — Cashier `printReceipt` now uses `printHtml(buildReceiptHtml(...))` instead of page-level `window.print()`. Receipt is bold (font-weight: 700, all-black ink), tighter line spacing, 80mm @page size, no browser URL footer. Auto-prints on order completion (configurable via `pos_terminal_config.auto_print_receipt`). (Feb 2026)
- [x] Printer Group Assignment — Add Printer dialog (Cashier/Waiter Terminal Settings) now has a Printer Group dropdown so admins can assign the new printer to an existing group inline. (Feb 2026)
- [x] Printer Mode Simplified — Renamed "Browser / System Printer" → "Installed Printer (recommended)". Removed confusing USB raw mode (didn't work for most installed printers anyway). (Feb 2026)
- [x] Deployment Artefacts — `DEPLOYMENT.md`, `render.yaml`, `frontend/vercel.json`, `frontend/public/.htaccess`, `backend/passenger_wsgi.py`. Production build verified at `frontend/build/` (200KB gzipped). (Feb 2026)
- [x] Accounts Module — P&L dashboard + expense tracking by category
- [x] Product Cost Price, Markup %, Sales Price, Barcode
- [x] Company Configuration — Logo, address, phone, email, tax ID
- [x] Receipt Header & Footer text customization with live preview
- [x] User Permissions System — 16 granular permissions for Admin and POS modules
- [x] Cashier Hold Order + Held Orders Panel
- [x] First-time Setup & Registration from login
- [x] Toast Notifications at Top Center
- [x] Local File Upload — Product images and company logo
- [x] Peripherals Setup — Cash drawer, customer display, barcode scanner
- [x] Customer-Facing Display System (CDS) — Real-time order display at /display route
- [x] Logo on ESC/POS Receipts — imageToEscPos() raster bitmap + Bluetooth printing support
- [x] Dynamic Business Type Switching from Settings (conditional Tables/Waiter visibility)
- [x] Backend Refactoring — Modular route structure (17 route files)

## Pending Issues
- None critical

## Future/Backlog (P2)
- Automated email reports for managers
- Kitchen Display System (KDS)
- Multi-language support

## Test Credentials
- Admin PIN: 123456
- Cashier PIN: 1111
- Waiter PIN: 2222

## DB Collections
users, products, categories, tables, orders, settings, currencies, payment_types, printers, outlets, customers, inventory (stock), stock_movements, suppliers, expenses, purchase_orders, peripherals, split_bills, roles
