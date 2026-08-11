import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Picks "Main Restaurant" (case-insensitive substring match) if present,
// else the first outlet. Shared so every page that reads the pos_outlet
// localStorage key bootstraps it the same way — previously only
// POSPage.js/TablePOSPage.js had this default, so visiting Tables or
// Held Orders first (neither had it) could leave the shared key empty,
// making those pages show every outlet's tables/orders merged together.
export function pickDefaultOutlet(outlets) {
  if (!outlets || outlets.length === 0) return null;
  return outlets.find((o) => (o.name || "").toLowerCase().includes("main restaurant")) || outlets[0];
}

// Business operating timezone — Nigeria doesn't observe DST, so this is a
// safe fixed constant rather than a per-browser setting. Used to compute
// "today"/report date defaults in the business's actual calendar day
// instead of the viewing device's local zone or UTC.
const BUSINESS_TIMEZONE = "Africa/Lagos";

// YYYY-MM-DD for a given instant, as seen in the business's timezone.
// Date.toISOString().split("T")[0] (the pattern this replaces) reads the
// UTC calendar day instead — for the ~1 hour after local midnight (WAT is
// UTC+1), that meant "today" on a report/date-range default still pointed
// at yesterday's UTC date, making that morning's/previous day's sales look
// like they hadn't "synced" yet when they were really just filtered out by
// the wrong date.
export function localDateStr(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

let _currencySymbol = "₦";

export function setCurrencySymbol(symbol) {
  _currencySymbol = symbol || "₦";
}

export function formatCurrency(amount, symbol) {
  const sym = symbol !== undefined ? symbol : _currencySymbol;
  const num = Number(amount || 0);
  return `${sym}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} mins ago`;

  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs === 1) return "1 hr ago";
  if (diffHrs < 24) return `${diffHrs} hrs ago`;

  return date.toLocaleDateString();
}

// Classify a cart item as "kitchen" (food) or "bar" (drinks) by walking
// product → category.main_category. Items the catalog has lost track of
// default to "kitchen". Shared by HeldOrdersPage's reprint routing and the
// KDS board's Kitchen/Bar tabs, so ticket printing and on-screen display
// agree on which station an item belongs to.
export function itemStation(item, productById, categoryById) {
  const catId = item.category_id || productById.get(item.product_id)?.category_id || "";
  const cat = categoryById.get(catId);
  return (cat?.main_category || "food").toLowerCase() === "drinks" ? "bar" : "kitchen";
}

export function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// How urgent a reservation is relative to now, used to color-code
// reservation cards / reserved-table tiles: "soon" = starting within the
// next hour (or already started), "today" = later today, "future" = any
// later date. Reused by ReservationsSection.js and TablesPage.js so the
// color scale matches everywhere it appears.
export function reservationUrgency(dateStr, timeStr) {
  if (!dateStr || !timeStr) return "future";
  const resDt = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(resDt.getTime())) return "future";
  const now = new Date();
  const diffMs = resDt - now;
  if (diffMs <= 60 * 60 * 1000) return "soon";
  const isToday = resDt.toDateString() === now.toDateString();
  return isToday ? "today" : "future";
}

export const RESERVATION_URGENCY_COLORS = {
  soon:   { dot: "bg-red-500",    text: "text-red-600 dark:text-red-400" },
  today:  { dot: "bg-amber-500",  text: "text-amber-600 dark:text-amber-400" },
  future: { dot: "bg-purple-400", text: "text-purple-600 dark:text-purple-400" },
};

export function formatReservationDateTime(dateStr, timeStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T${timeStr || "00:00"}:00`);
  if (Number.isNaN(d.getTime())) return `${dateStr} ${timeStr || ""}`.trim();
  const datePart = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  if (!timeStr) return datePart;
  const timePart = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

// Umbrella → fine-grained permission implications. The 'Add User' dialog
// lists a short set of umbrella perms (manage_products, manage_users, …)
// while the per-section gates check fine-grained perms (view_products,
// view_users, …). Without this map a Floor Manager with manage_products
// can't open the Products section because the gate is looking for the
// exact string 'view_products'. Granting an umbrella now grants
// everything beneath it.
const PERMISSION_IMPLIES = {
  manage_products: [
    "view_products", "create_product", "edit_product", "delete_product",
    "manage_categories", "manage_groups", "manage_brands", "manage_units",
    "manage_recipes", "print_labels", "import_products", "manage_image_library",
  ],
  manage_users: [
    "view_users", "create_user", "edit_user", "delete_user", "manage_user_types",
  ],
  manage_inventory: [
    "view_inventory", "manage_stock_count", "update_stock", "add_stock",
    "receive_stock", "transfer_stock", "low_stock_alerts",
    "view_reorder_alerts", "record_waste", "view_stock_valuation",
    "view_consolidated_stock", "manage_requisitions",
    // Store Management items live under Inventory in most roles' mental
    // model — grant view + transfer-history when the umbrella is held.
    "view_stores", "view_transfer_record",
  ],
  manage_tables: [
    "view_tables", "create_table", "edit_table", "delete_table",
    "assign_table", "transfer_tables", "release_tables", "move_order",
    "merge_tables", "print_bill",
  ],
  manage_floors: [
    "view_floors", "create_floor", "edit_floor", "delete_floor",
  ],
  view_reports: [
    "view_sales_report", "view_financial_report", "view_staff_report",
    "view_payment_report", "view_product_report", "view_daily_summary",
  ],
  view_accounts: [
    "view_accounts", "view_accounts_dashboard", "view_profit_loss",
    "view_balance_sheet", "view_general_ledger", "view_invoice_tracking",
    "view_bank_reconciliation", "view_budgets", "view_tax_vat",
    "manage_currencies", "manage_payroll", "manage_cash_flow",
  ],
  manage_settings: [
    "view_settings",
  ],
  manage_purchases: [
    "view_purchases", "create_purchase", "edit_purchase", "approve_purchase",
  ],
  manage_suppliers: [
    "view_suppliers", "create_supplier", "edit_supplier", "delete_supplier",
  ],
  manage_expenses: [
    "view_accounts", "view_accounts_dashboard",
  ],
  manage_deposits: [
    "view_accounts", "view_accounts_dashboard",
  ],
  manage_transfers: [
    "view_accounts", "view_accounts_dashboard",
  ],
  view_all_orders: [
    "view_orders", "view_void_orders",
  ],
  process_payment: [
    "view_orders", "use_pos",
  ],
  process_sales: [
    "view_orders", "use_pos",
  ],
};

// True when the user holds `perm` directly OR an umbrella permission that
// implies it. Use this in every UI gate that checks a single permission.
export function userHasPermission(user, perm) {
  if (!perm) return true;
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager") return true;
  const perms = user.permissions || [];
  if (perms.includes(perm)) return true;
  for (const [umbrella, implies] of Object.entries(PERMISSION_IMPLIES)) {
    if (perms.includes(umbrella) && implies.includes(perm)) return true;
  }
  return false;
}

// True for users who should be allowed to act on ANY table, not just the
// ones they personally claimed. Admin / manager roles always pass; custom
// roles (like 'Floor Manager') pass when they hold one of the permissions
// that imply table-management authority. Keep this list in sync with the
// matching backend permission gates.
const _TABLE_OVERRIDE_PERMISSIONS = [
  "manage_tables",
  "transfer_tables",
  "release_tables",
  "move_order",
  "assign_table",
  "process_payment",
  "close_order",
  "complete_order",
  "view_all_orders",
];
export function canManageAnyTable(user) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager") return true;
  const perms = user.permissions || [];
  return _TABLE_OVERRIDE_PERMISSIONS.some((p) => perms.includes(p));
}

// Sort table-like records by their .number field in natural order so 'T2'
// comes before 'T19' (not after). Falls back to lexicographic when no
// number can be parsed.
export function sortByTableNumber(tables) {
  const parse = (raw) => {
    const s = String(raw ?? "");
    const m = s.match(/^(\D*)(\d+)?(.*)$/);
    const prefix = (m?.[1] || "").toLowerCase();
    const num = m?.[2] != null ? parseInt(m[2], 10) : Number.POSITIVE_INFINITY;
    const suffix = (m?.[3] || "").toLowerCase();
    return { prefix, num, suffix, raw: s.toLowerCase() };
  };
  return [...(tables || [])].sort((a, b) => {
    const A = parse(a?.number);
    const B = parse(b?.number);
    if (A.prefix !== B.prefix) return A.prefix < B.prefix ? -1 : 1;
    if (A.num    !== B.num)    return A.num    < B.num    ? -1 : 1;
    if (A.suffix !== B.suffix) return A.suffix < B.suffix ? -1 : 1;
    return A.raw < B.raw ? -1 : A.raw > B.raw ? 1 : 0;
  });
}

// Collapse pending / held / sent_to_kitchen order duplicates into the latest
// record per (table_id || table_number || bar_tab_id || cashier). Completed
// and voided records pass through untouched so sales history stays intact.
const _PENDING_STATUSES = new Set(["pending", "held", "sent_to_kitchen"]);
export function dedupePendingOrders(orders) {
  const sorted = [...(orders || [])].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const seen = new Set();
  const out = [];
  for (const o of sorted) {
    const isStale =
      _PENDING_STATUSES.has(o.status) || (o.payment_method || "") === "pending";
    if (!isStale) {
      out.push(o);
      continue;
    }
    const key = o.table_id
      ? `t:${o.table_id}`
      : o.table_number != null && o.table_number !== ""
      ? `tn:${o.table_number}`
      : o.bar_tab_id
      ? `b:${o.bar_tab_id}`
      : `walkin:${o.created_by || o.created_by_name || "anon"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

// Aggressive dedupe for completed / settled orders. Used in Orders, Reports
// and Accounts views where offline-sync replays or pre-fix duplicate-create
// bugs can leave the DB with two records for the same real transaction.
//
// Strategy: keep only the LATEST record per logical bucket. Two orders land
// in the same bucket when:
//   - the order_number is the same (true duplicate), OR
//   - same table/bar-tab/(cashier+customer) AND same total AND same payment
//     method AND created within DEDUP_WINDOW_MS of each other.
// Items rows still keep distinct same-table sales as long as totals differ
// or the close times are spread out.
// Heuristic dedupe window — only applied to legacy orders that have
// NEITHER idempotency_key NOR order_number. Tightened from 5 min so
// distinct back-to-back sales (same table, same total, same method —
// e.g. two different customers paying ₦5,000 cash a couple minutes
// apart) don't get falsely collapsed and disappear from Total Sales.
const DEDUP_WINDOW_MS = 60 * 1000;
export function dedupeOrders(orders) {
  const list = [...(orders || [])].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const out = [];
  const seenKeys = new Set();
  const seenOrderNumbers = new Set();
  // Buckets: key → [{ ts, order }, ...]
  const buckets = new Map();

  for (const o of list) {
    // Layer 1: idempotency_key (authoritative, set on every modern order)
    const ikey = o.idempotency_key;
    if (ikey) {
      if (seenKeys.has(ikey)) continue;
      seenKeys.add(ikey);
    }
    // Layer 2: order_number
    const num = o.order_number;
    if (num) {
      if (seenOrderNumbers.has(num)) continue;
      seenOrderNumbers.add(num);
    }
    // Layer 3: heuristic — ONLY for orders missing both ikey and num.
    // Modern orders skip this entirely so legitimate distinct sales
    // (same table, same amount, same method, close in time) aren't
    // wrongly collapsed and dropped from Total Sales.
    if (!ikey && !num) {
      const ts = new Date(o.created_at || 0).getTime() || 0;
      const subject = o.table_id
        ? `t:${o.table_id}`
        : o.bar_tab_id
        ? `b:${o.bar_tab_id}`
        : o.table_number != null && o.table_number !== ""
        ? `tn:${o.table_number}`
        : `walkin:${o.created_by || o.created_by_name || "anon"}:${(o.customer_name || "").toLowerCase()}`;
      const totalKey = Math.round((Number(o.total) || 0) * 100);
      const methodKey = (o.payment_method || "").toLowerCase();
      const statusKey = (o.status || "").toLowerCase();
      const bucketKey = `${subject}|${statusKey}|${totalKey}|${methodKey}`;
      const peers = buckets.get(bucketKey) || [];
      const isDup = peers.some((p) => Math.abs(p.ts - ts) <= DEDUP_WINDOW_MS);
      if (isDup) continue;
      peers.push({ ts, order: o });
      buckets.set(bucketKey, peers);
    }
    out.push(o);
  }
  // Restore original (descending) order
  return out;
}
