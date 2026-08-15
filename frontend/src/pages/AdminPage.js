import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Building2, Package, Warehouse, ShoppingBag, UserCircle,
  ClipboardList, BarChart2, BookOpen, ArrowLeft, LogOut, ChevronRight, ChevronDown,
  Menu, Moon, ShoppingCart, DollarSign, Sun, UserCheck, Box, LayoutGrid, Settings, Store, Bell, CalendarClock,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import { useTheme } from "../context/ThemeContext";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import { api } from "../lib/api";
import { cn, formatCurrency, userHasPermission } from "../lib/utils";

// Admin sections are large — lazy-load so the initial bundle only contains
// the shell, the sidebar, and whichever section the user opens first.
const UsersSection         = lazy(() => import("../admin/UsersSection"));
const OutletsSection       = lazy(() => import("../admin/OutletsSection"));
const ProductsSection      = lazy(() => import("../admin/ProductsSection"));
const InventorySection     = lazy(() => import("../admin/InventorySection"));
const CustomersSection     = lazy(() => import("../admin/CustomersSection"));
const OrdersSection        = lazy(() => import("../admin/OrdersSection"));
const VoidOrdersSection    = lazy(() => import("../admin/VoidOrdersSection"));
const ReportsSection       = lazy(() => import("../admin/ReportsSection"));
const AccountsSection      = lazy(() => import("../admin/AccountsSection"));
const TablesSection        = lazy(() => import("../admin/TablesSection"));
const BarTabsAdminSection  = lazy(() => import("../admin/BarTabsAdminSection"));
const ReservationsSection  = lazy(() => import("../admin/ReservationsSection"));
const SettingsSection      = lazy(() => import("../admin/SettingsSection"));
const PurchasesSection     = lazy(() => import("../admin/PurchasesSection"));

// Hold raw import promises so we can also kick them off on idle. React's
// lazy() runs the import the first time the component is rendered, but we
// want every chunk in the browser cache before the user clicks anything.
const ADMIN_CHUNK_IMPORTS = [
  () => import("../admin/UsersSection"),
  () => import("../admin/OutletsSection"),
  () => import("../admin/ProductsSection"),
  () => import("../admin/InventorySection"),
  () => import("../admin/CustomersSection"),
  () => import("../admin/OrdersSection"),
  () => import("../admin/ReportsSection"),
  () => import("../admin/AccountsSection"),
  () => import("../admin/TablesSection"),
  () => import("../admin/BarTabsAdminSection"),
  () => import("../admin/ReservationsSection"),
  () => import("../admin/SettingsSection"),
  () => import("../admin/PurchasesSection"),
  () => import("../admin/VoidOrdersSection"),
];
function prefetchAdminChunks() {
  const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 800));
  ric(() => {
    // Fire them in sequence but without awaiting — each chunk request goes
    // out as a low-priority background fetch. Browser keeps the body in
    // module cache, so the first click into a section is now instant.
    ADMIN_CHUNK_IMPORTS.forEach((load, i) => {
      setTimeout(() => { try { load().catch(() => {}); } catch {} }, i * 60);
    });
  });
}

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const EXPANDABLE = {
  users: [{ id: "list", label: "User List" }, { id: "types", label: "User Types" }],
  outlets: [{ id: "outlets", label: "All Outlets" }, { id: "terminals", label: "Terminals" }],
  products: [
    { id: "all-products", label: "All Products" }, { id: "create-product", label: "Create Product" },
    { id: "groups", label: "Groups" }, { id: "brands", label: "Brands" },
    { id: "units", label: "Units" }, { id: "recipes", label: "Recipes" },
    { id: "print-labels", label: "Print Labels" }, { id: "import", label: "Import Products" },
    { id: "image-library", label: "Image Library" },
  ],
  orders: [
    { id: "all-orders",   label: "All Orders" },
    { id: "void-orders",  label: "Void Orders" },
  ],
  reports: [
    { id: "sales",         label: "Sales" },
    { id: "cost",          label: "Cost Analysis" },
    { id: "staff",         label: "Staff Performance" },
    { id: "payments",      label: "Payment Methods" },
    { id: "items",         label: "Sales by Item" },
    { id: "category",      label: "Report by Category" },
    { id: "discounts",     label: "Discount Report" },
    { id: "daily-summary", label: "Daily Summary" },
    { id: "shifts",        label: "Shift Report" },
    { id: "tax",           label: "Tax Report" },
    { id: "floors",        label: "Floor Report" },
  ],
  inventory: [
    { id: "stock", label: "Stock Levels" },
    { id: "stock-count", label: "Stock Count" },
    { id: "update-stock", label: "Update Stock" },
    { id: "reorder", label: "Reorder Alerts" },
    { id: "waste", label: "Waste Recording" },
    { id: "valuation", label: "Stock Valuation" },
    { id: "consolidated", label: "Consolidated View" },
  ],
  stores: [
    { id: "main-store", label: "Main Store" },
    { id: "transfer-record", label: "Transfer Record" },
    { id: "create-store", label: "Create Store" },
  ],
  purchases: [
    { id: "pending", label: "Pending Orders" },
    { id: "approved", label: "Approved Orders" },
    { id: "suppliers", label: "Suppliers" },
  ],
  floor: [
    { id: "tables", label: "Tables" },
    { id: "bar-tabs", label: "Bar Tabs" },
    { id: "reservations", label: "Reservations" },
  ],
  settings: [
    { id: "company", label: "Company" }, { id: "receipt", label: "Receipt & Bill" },
    { id: "currencies", label: "Currencies" }, { id: "payment-types", label: "Payment Types" },
    { id: "tax", label: "Tax" }, { id: "printer-groups", label: "Printer Groups" },
    { id: "label-printer", label: "Label Printer" }, { id: "print-bridge", label: "Print Bridge" },
    { id: "danger", label: "Data Management" },
  ],
  accounts: [
    { id: "dashboard",           label: "Dashboard" },
    { id: "profit-loss",         label: "Profit & Loss" },
    { id: "balance-sheet",       label: "Balance Sheet" },
    { id: "cash-flow",           label: "Cash Flow" },
    { id: "ledger",              label: "General Ledger" },
    { id: "invoices",            label: "Invoice Tracking" },
    { id: "bank-reconciliation", label: "Bank Reconciliation" },
    { id: "budgeting",           label: "Budgeting & Forecast" },
    { id: "tax-summary",         label: "Tax & VAT" },
    { id: "payroll",             label: "Payroll" },
    { id: "currencies",          label: "Currencies & Rates" },
    { id: "expenses",            label: "All Expenses" },
    { id: "create-expense",      label: "Create Expense" },
    { id: "expense-categories",  label: "Expense Categories" },
    { id: "deposits",            label: "All Deposits" },
    { id: "create-deposit",      label: "Create Deposit" },
    { id: "deposit-categories",  label: "Deposit Categories" },
    { id: "transfers",           label: "Transfers Money" },
  ],
};

// Top-level section → minimum permission needed (admin/manager bypass all)
const SECTION_PERMISSION = {
  users: "view_users",
  outlets: "view_outlets",
  products: "view_products",
  inventory: "view_inventory",
  stores: "view_stores",
  purchases: "view_purchases",
  customers: "view_customers",
  orders: "view_orders",
  reports: "view_sales_report",
  accounts: "view_accounts",
  floor: "view_tables",
  settings: "view_settings",
};

// Sub-item → required permission (undefined = always visible to anyone who can see the section)
const SUB_ITEM_PERMISSION = {
  // ── Inventory ───────────────────────────────────────────────────────────────
  "inventory.stock":            "view_inventory",
  "inventory.stock-count":      "manage_stock_count",
  "inventory.update-stock":     "update_stock",
  "inventory.reorder":          "view_reorder_alerts",
  "inventory.waste":            "record_waste",
  "inventory.valuation":        "view_stock_valuation",
  "inventory.consolidated":     "view_consolidated_stock",
  // ── Store Management ────────────────────────────────────────────────────────
  "stores.main-store":          "view_stores",
  "stores.transfer-record":     "view_transfer_record",
  "stores.create-store":        "create_store",
  // ── Products ────────────────────────────────────────────────────────────────
  "products.create-product":    "create_product",
  "products.groups":            "manage_groups",
  "products.brands":            "manage_brands",
  "products.units":             "manage_units",
  "products.recipes":           "manage_recipes",
  "products.print-labels":      "print_labels",
  "products.import":            "import_products",
  "products.image-library":     "manage_image_library",
  // ── Purchases ───────────────────────────────────────────────────────────────
  "purchases.approved":         "approve_purchase",
  // ── Floor ───────────────────────────────────────────────────────────────────
  "floor.bar-tabs":             "view_bar_tabs",
  "floor.reservations":         "view_reservations",
  // ── Outlets ─────────────────────────────────────────────────────────────────
  "outlets.terminals":          "manage_terminals",
  // ── Orders ──────────────────────────────────────────────────────────────────
  "orders.all-orders":          "view_orders",
  "orders.void-orders":         "view_void_orders",
  // ── Reports ─────────────────────────────────────────────────────────────────
  "reports.sales":              "view_sales_report",
  "reports.cost":               "view_financial_report",
  "reports.staff":              "view_staff_report",
  "reports.payments":           "view_payment_report",
  "reports.items":              "view_product_report",
  "reports.category":           "view_sales_report",
  "reports.discounts":          "view_sales_report",
  "reports.daily-summary":      "view_daily_summary",
  "reports.shifts":             "view_staff_report",
  "reports.tax":                "view_financial_report",
  "reports.floors":             "view_sales_report",
  // ── Users ───────────────────────────────────────────────────────────────────
  "users.types":                "manage_user_types",
  // ── Accounts ────────────────────────────────────────────────────────────────
  "accounts.dashboard":            "view_accounts_dashboard",
  "accounts.profit-loss":          "view_profit_loss",
  "accounts.balance-sheet":        "view_balance_sheet",
  "accounts.cash-flow":            "manage_cash_flow",
  "accounts.ledger":               "view_general_ledger",
  "accounts.invoices":             "view_invoice_tracking",
  "accounts.bank-reconciliation":  "view_bank_reconciliation",
  "accounts.budgeting":            "view_budgets",
  "accounts.tax-summary":          "view_tax_vat",
  "accounts.payroll":              "manage_payroll",
  "accounts.currencies":           "manage_currencies",
  "accounts.expenses":             "manage_expenses",
  "accounts.create-expense":       "manage_expenses",
  "accounts.expense-categories":   "manage_expenses",
  "accounts.deposits":             "manage_deposits",
  "accounts.create-deposit":       "manage_deposits",
  "accounts.deposit-categories":   "manage_deposits",
  "accounts.transfers":            "manage_transfers",
};

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "User Management", icon: Users, expandable: true },
  { id: "outlets", label: "Outlets", icon: Building2, expandable: true },
  { id: "products", label: "Products", icon: Package, expandable: true },
  { id: "inventory", label: "Inventory", icon: Warehouse, expandable: true },
  { id: "stores", label: "Store Management", icon: Store, expandable: true },
  { id: "purchases", label: "Purchases", icon: ShoppingBag, expandable: true },
  { id: "customers", label: "Customers", icon: UserCircle },
  { id: "orders", label: "Orders", icon: ClipboardList, expandable: true },
  { id: "reports", label: "Reports", icon: BarChart2, expandable: true },
  { id: "accounts", label: "Accounts", icon: BookOpen, expandable: true },
  { id: "floor", label: "Floor Management", icon: LayoutGrid, expandable: true },
  { id: "settings", label: "Settings", icon: Settings, expandable: true },
];

// Top-level sections to hide based on business capability flags
const SECTION_REQUIRES_CAP = {
  floor:    "hasFloorManagement",
  stores:   "hasIngredients",   // ingredient-based stores only
};

// Sub-items to hide based on business capability flags
const SUB_ITEM_REQUIRES_CAP = {
  "products.recipes":         "hasRecipes",
  "floor.tables":             "hasTables",
  "floor.bar-tabs":           "hasTabs",
  "floor.reservations":       "hasReservations",
  // Ingredient-only inventory pages
  "stores.main-store":        "hasIngredients",
  "stores.create-store":      "hasIngredients",
  "inventory.waste":          "hasIngredients",  // ingredient waste — keep simple in retail
};

export default function AdminPage() {
  const { user, logout } = useAuth();
  const { settings } = useBusiness();
  const businessConfig = useBusinessConfig();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [expandedSection, setExpandedSection] = useState(null);
  const [subViews, setSubViews] = useState({ users: "list", outlets: "outlets", products: "all-products", reports: "sales", inventory: "stock", stores: "main-store", purchases: "pending", floor: "tables", settings: "company", accounts: "dashboard", orders: "all-orders" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [notifSummary, setNotifSummary] = useState({ low_stock: 0, todays_orders: 0, pending_purchases: 0, upcoming_reservations: 0 });
  const [preFillPO, setPreFillPO] = useState(null);

  const isPrivileged = user?.role === "admin" || user?.role === "manager";
  // can() now honors permission implications — granting an umbrella like
  // 'manage_products' unlocks 'view_products', 'create_product', etc.
  const can = (perm) => userHasPermission(user, perm);
  // Capability check: a feature is enabled if the business config flag is true (default true if undefined)
  const hasCap = (capKey) => !capKey || businessConfig?.[capKey] !== false;
  const visibleSubs = (sectionId) =>
    (EXPANDABLE[sectionId] || []).filter((sub) => {
      const key = `${sectionId}.${sub.id}`;
      return can(SUB_ITEM_PERMISSION[key]) && hasCap(SUB_ITEM_REQUIRES_CAP[key]);
    });
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    can(SECTION_PERMISSION[item.id]) && hasCap(SECTION_REQUIRES_CAP[item.id])
  );

  useEffect(() => {
    api.getDashboardAnalytics().then(setAnalytics).catch(console.error).finally(() => setAnalyticsLoading(false));
    const fetchNotifs = () => api.getNotificationsSummary().then(setNotifSummary).catch(() => {});
    fetchNotifs();
    const notifTimer = setInterval(fetchNotifs, 30000);

    // Ensure the three default stores (main/kitchen/bar) exist. A
    // deployment that only ever had "main" created (pre-dating
    // kitchen/bar, or a partial init) would otherwise silently never
    // get kitchen/bar auto-created, breaking anything that depends on
    // them existing as real Store records (e.g. the stock Transfer
    // modal's destination picker). init-stores only creates whichever
    // of the three are missing, so this is safe to call on every load.
    api.getStores().then((s) => {
      const existingIds = new Set(s.map((x) => x.id));
      if (["main", "kitchen", "bar"].some((id) => !existingIds.has(id))) {
        api.initStores().catch(() => {});
      }
    }).catch(() => {});

    // Warm every admin chunk in the background so the first click into
    // Users / Reports / etc. is instant instead of waiting on a chunk
    // download.
    prefetchAdminChunks();

    const handleNavPurchases = (e) => {
      const detail = e.detail;
      const sub = typeof detail === "string" ? detail : (detail?.sub || "pending");
      const prefill = typeof detail === "object" ? detail?.prefill : null;
      setActiveSection("purchases");
      setExpandedSection("purchases");
      setSubViews((s) => ({ ...s, purchases: sub }));
      if (prefill) setPreFillPO(prefill);
    };
    const handleClickOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);

    window.addEventListener("nav-purchases", handleNavPurchases);
    return () => {
      clearInterval(notifTimer);
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("nav-purchases", handleNavPurchases);
    };
  }, []);

  const handleNavClick = (id) => {
    setActiveSection(id);
    if (EXPANDABLE[id]) {
      setExpandedSection((prev) => {
        if (prev === id) return null;
        const firstVisible = visibleSubs(id)[0];
        if (firstVisible) setSubViews((s) => ({ ...s, [id]: firstVisible.id }));
        return id;
      });
    } else {
      setExpandedSection(null);
      if (window.innerWidth < 1024) setSidebarOpen(false);
    }
  };

  const handleSubClick = (section, subId) => {
    setSubViews((prev) => ({ ...prev, [section]: subId }));
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Backdrop for mobile + tablet */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 w-60 bg-gray-900 dark:bg-gray-950 flex flex-col z-50 transition-transform duration-200",
        "lg:relative lg:translate-x-0 lg:z-30 lg:flex-shrink-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
          <div className="px-5 py-5 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <LayoutDashboard size={20} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{settings?.business_name || "POSx Suite"}</p>
                <p className="text-gray-400 text-xs">Admin</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto scrollbar-hide py-3 px-3">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              const isExpanded = item.expandable && expandedSection === item.id;
              const subItems = visibleSubs(item.id);

              return (
                <React.Fragment key={item.id}>
                  <button
                    onClick={() => handleNavClick(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors",
                      active ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    )}
                  >
                    <Icon size={18} />
                    <span className="flex-1 text-left font-medium">{item.label}</span>
                    {item.id === "inventory" && notifSummary.low_stock > 0 && (
                      <span className="ml-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                        {Math.min(notifSummary.low_stock, 99) || "99+"}
                      </span>
                    )}
                    {item.id === "purchases" && notifSummary.pending_purchases > 0 && (
                      <span className="ml-1 min-w-[18px] h-[18px] px-1 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                        {notifSummary.pending_purchases > 99 ? "99+" : notifSummary.pending_purchases}
                      </span>
                    )}
                    {item.expandable ? (
                      isExpanded
                        ? <ChevronDown size={14} className="text-white/60" />
                        : <ChevronRight size={14} className="text-gray-600" />
                    ) : active ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    ) : null}
                  </button>

                  {isExpanded && subItems.length > 0 && (
                    <div className="ml-4 mb-1 border-l border-gray-700 pl-3">
                      {subItems.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => handleSubClick(item.id, sub.id)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors mb-0.5",
                            subViews[item.id] === sub.id
                              ? "bg-gray-700 text-white"
                              : "text-gray-400 hover:bg-gray-800 hover:text-white"
                          )}
                        >
                          <span className="flex-1 text-left">{sub.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          <div className="p-3 border-t border-gray-800 space-y-1">
            {(() => {
              const role = (user?.role || "").toLowerCase();
              // Default-allowed: built-in operational roles, anything containing
              // 'manager'/'waiter'/'cashier'/'admin' (covers custom types like
              // 'Store Manager', 'Floor Manager', 'Head Waiter', 'Senior Cashier'),
              // or anyone with the explicit use_pos permission.
              const roleAllowed = ["admin", "manager", "waiter", "cashier"].some(
                (r) => role === r || role.includes(r)
              );
              return roleAllowed || userHasPermission(user, "use_pos");
            })() && (
              <button onClick={() => navigate("/pos")}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-green-400 bg-green-950/60 hover:bg-green-900/50 transition-colors font-medium">
                <ArrowLeft size={18} />
                Back to POS
              </button>
            )}
            <button onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setSidebarOpen((v) => !v)} className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <div ref={bellRef} className="relative">
              <button
                onClick={() => setBellOpen((v) => !v)}
                title="View alerts"
                className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Bell size={17} />
                {(notifSummary.low_stock > 0 || notifSummary.pending_purchases > 0 || notifSummary.upcoming_reservations > 0) && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {Math.min(notifSummary.low_stock + notifSummary.pending_purchases + notifSummary.upcoming_reservations, 99)}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="fixed top-14 left-2 right-2 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl z-50 overflow-hidden max-h-[80vh] overflow-y-auto">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Alerts</p>
                  </div>
                  {notifSummary.low_stock === 0 && notifSummary.pending_purchases === 0 && notifSummary.upcoming_reservations === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">No active alerts</p>
                  ) : (
                    <div className="py-1">
                      {notifSummary.upcoming_reservations > 0 && (
                        <button
                          onClick={() => { setBellOpen(false); setActiveSection("floor"); setExpandedSection("floor"); setSubViews((s) => ({ ...s, floor: "reservations" })); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                          <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                            <CalendarClock size={15} className="text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Upcoming Reservations</p>
                            <p className="text-xs text-gray-400">{notifSummary.upcoming_reservations} table{notifSummary.upcoming_reservations !== 1 ? "s" : ""} reserved within 2 hours</p>
                          </div>
                          <span className="min-w-[20px] h-5 px-1.5 bg-purple-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{notifSummary.upcoming_reservations > 99 ? "99+" : notifSummary.upcoming_reservations}</span>
                        </button>
                      )}
                      {notifSummary.low_stock > 0 && (
                        <button
                          onClick={() => { setBellOpen(false); setActiveSection("inventory"); setExpandedSection("inventory"); setSubViews((s) => ({ ...s, inventory: "reorder" })); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                          <div className="w-8 h-8 bg-red-100 dark:bg-red-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Warehouse size={15} className="text-red-600 dark:text-red-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Low Stock</p>
                            <p className="text-xs text-gray-400">{notifSummary.low_stock} item{notifSummary.low_stock !== 1 ? "s" : ""} running low</p>
                          </div>
                          <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{notifSummary.low_stock > 99 ? "99+" : notifSummary.low_stock}</span>
                        </button>
                      )}
                      {notifSummary.pending_purchases > 0 && (
                        <button
                          onClick={() => { setBellOpen(false); setActiveSection("purchases"); setExpandedSection("purchases"); setSubViews((s) => ({ ...s, purchases: "pending" })); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                            <ShoppingBag size={15} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Pending Purchases</p>
                            <p className="text-xs text-gray-400">{notifSummary.pending_purchases} order{notifSummary.pending_purchases !== 1 ? "s" : ""} pending</p>
                          </div>
                          <span className="min-w-[20px] h-5 px-1.5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{notifSummary.pending_purchases > 99 ? "99+" : notifSummary.pending_purchases}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-blue-600 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {user?.photo
                  ? <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
                  : user?.name?.[0]?.toUpperCase() || "A"}
              </div>
              <span className="hidden sm:block text-sm font-semibold text-gray-700 dark:text-gray-200">{user?.name || "Admin"}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {activeSection === "dashboard" && (
              <DashboardContent analytics={analytics} loading={analyticsLoading} userName={user?.name} />
            )}
            <Suspense fallback={<SectionLoader />}>
              {activeSection === "users" && <UsersSection view={subViews.users} />}
              {activeSection === "outlets" && <OutletsSection view={subViews.outlets} />}
              {activeSection === "products" && (
                <ProductsSection view={subViews.products} onViewChange={(v) => handleSubClick("products", v)} />
              )}
              {activeSection === "inventory" && <InventorySection view={subViews.inventory} />}
              {activeSection === "stores" && <InventorySection view={subViews.stores === "create-store" ? "stores" : subViews.stores} />}
              {activeSection === "customers" && <CustomersSection />}
              {activeSection === "orders" && subViews.orders !== "void-orders" && <OrdersSection />}
              {activeSection === "orders" && subViews.orders === "void-orders" && <VoidOrdersSection />}
              {activeSection === "reports" && <ReportsSection view={subViews.reports} />}
              {activeSection === "accounts" && <AccountsSection view={subViews.accounts} onViewChange={(v) => handleSubClick("accounts", v)} />}
              {activeSection === "floor" && subViews.floor === "tables" && <TablesSection />}
              {activeSection === "floor" && subViews.floor === "bar-tabs" && <BarTabsAdminSection />}
              {activeSection === "floor" && subViews.floor === "reservations" && <ReservationsSection />}
              {activeSection === "settings" && <SettingsSection view={subViews.settings} onViewChange={(v) => handleSubClick("settings", v)} />}
              {activeSection === "purchases" && (
                <PurchasesSection
                  view={subViews.purchases}
                  preFillPO={preFillPO}
                  onPreFillUsed={() => setPreFillPO(null)}
                />
              )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, bgColor, iconBg, valueColor }) {
  return (
    <div className={cn("rounded-2xl border-2 border-gray-300/80 dark:border-gray-600/80 p-4 sm:p-5 flex items-center justify-between shadow-sm", bgColor)}>
      <div className="min-w-0 flex-1 mr-3 overflow-hidden">
        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 leading-tight">{title}</p>
        <p className={cn("text-xl sm:text-2xl font-black leading-tight truncate", valueColor)}>{value}</p>
      </div>
      <div className={cn("w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0", iconBg)}>
        <Icon size={22} className="text-white" />
      </div>
    </div>
  );
}

function DashboardContent({ analytics, loading, userName }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = [
    { title: "Total Orders", value: analytics?.total_orders ?? 0, icon: ShoppingCart, bgColor: "bg-blue-50 dark:bg-blue-900/30", iconBg: "bg-blue-500", valueColor: "text-blue-600 dark:text-blue-400" },
    { title: "Total Revenue", value: formatCurrency(analytics?.total_revenue ?? 0), icon: DollarSign, bgColor: "bg-green-50 dark:bg-green-900/30", iconBg: "bg-green-500", valueColor: "text-green-600 dark:text-green-400" },
    { title: "Total Customers", value: analytics?.total_customers ?? 0, icon: UserCheck, bgColor: "bg-orange-50 dark:bg-orange-900/30", iconBg: "bg-orange-500", valueColor: "text-orange-500 dark:text-orange-400" },
    { title: "Active Products", value: analytics?.total_products ?? 0, icon: Box, bgColor: "bg-yellow-50 dark:bg-yellow-900/30", iconBg: "bg-yellow-500", valueColor: "text-yellow-600 dark:text-yellow-400" },
  ];

  const recentOrders = analytics?.recent_orders ?? [];
  const topProducts = analytics?.top_products ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Welcome back, {userName || "Admin"}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => <StatCard key={stat.title} {...stat} />)}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm mb-8">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white text-base">Recent Orders</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-3 sm:px-4 py-3">Order #</th>
                <th className="text-left px-3 sm:px-4 py-3 hidden sm:table-cell">Customer</th>
                <th className="text-left px-3 sm:px-4 py-3 hidden sm:table-cell">Items</th>
                <th className="text-left px-3 sm:px-4 py-3">Total</th>
                <th className="text-left px-3 sm:px-4 py-3 hidden sm:table-cell">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentOrders.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No orders yet</td></tr>
              ) : recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm whitespace-nowrap">{order.order_number}</td>
                  <td className="px-3 sm:px-4 py-3 text-gray-600 dark:text-gray-300 text-sm hidden sm:table-cell">{order.customer_name || "Walk-in"}</td>
                  <td className="px-3 sm:px-4 py-3 text-gray-600 dark:text-gray-300 text-sm hidden sm:table-cell">{order.items?.length ?? 0}</td>
                  <td className="px-3 sm:px-4 py-3 font-semibold text-green-600 dark:text-green-400 text-sm whitespace-nowrap">{formatCurrency(order.total)}</td>
                  <td className="px-3 sm:px-4 py-3 text-sm hidden sm:table-cell">
                    <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                      !order.payment_method || order.payment_method === "pending"
                        ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                        : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400")}>
                      {order.payment_method || "pending"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {topProducts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-white text-base">Top Selling Products</h2>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {topProducts.map((product, i) => (
              <div key={product._id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.total_quantity} sold</p>
                  </div>
                </div>
                <p className="font-semibold text-green-600 dark:text-green-400 text-sm">{formatCurrency(product.total_revenue)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
