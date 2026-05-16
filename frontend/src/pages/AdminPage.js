import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Building2, Package, Warehouse, ShoppingBag, UserCircle,
  ClipboardList, BarChart2, BookOpen, ArrowLeft, LogOut, ChevronRight, ChevronDown,
  Menu, Moon, ShoppingCart, DollarSign, Sun, UserCheck, Box, LayoutGrid, Settings,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";
import UsersSection from "../admin/UsersSection";
import OutletsSection from "../admin/OutletsSection";
import ProductsSection from "../admin/ProductsSection";
import InventorySection from "../admin/InventorySection";
import CustomersSection from "../admin/CustomersSection";
import OrdersSection from "../admin/OrdersSection";
import ReportsSection from "../admin/ReportsSection";
import AccountsSection from "../admin/AccountsSection";
import TablesSection from "../admin/TablesSection";
import BarTabsAdminSection from "../admin/BarTabsAdminSection";
import SettingsSection from "../admin/SettingsSection";
import PurchasesSection from "../admin/PurchasesSection";

const EXPANDABLE = {
  users: [{ id: "list", label: "User List" }, { id: "types", label: "User Types" }],
  outlets: [{ id: "outlets", label: "All Outlets" }, { id: "terminals", label: "Terminals" }],
  products: [
    { id: "all-products", label: "All Products" }, { id: "create-product", label: "Create Product" },
    { id: "categories", label: "Categories" }, { id: "brands", label: "Brands" },
    { id: "units", label: "Units" }, { id: "print-labels", label: "Print Labels" },
    { id: "import", label: "Import Products" },
  ],
  reports: [
    { id: "sales", label: "Sales" }, { id: "cost", label: "Cost Analysis" },
    { id: "staff", label: "Staff Performance" }, { id: "payments", label: "Payment Methods" },
  ],
  inventory: [
    { id: "stock", label: "Stock Levels" }, { id: "stock-count", label: "Stock Count" },
    { id: "update-stock", label: "Update Stock" }, { id: "transfer-stock", label: "Transfer Stock" },
  ],
  purchases: [
    { id: "pending", label: "Pending Orders" },
    { id: "approved", label: "Approved Orders" },
    { id: "suppliers", label: "Suppliers" },
  ],
  floor: [{ id: "tables", label: "Tables" }, { id: "bar-tabs", label: "Bar Tabs" }],
  settings: [
    { id: "company", label: "Company" }, { id: "receipt", label: "Receipt & Bill" },
    { id: "currencies", label: "Currencies" }, { id: "payment-types", label: "Payment Types" },
    { id: "tax", label: "Tax" }, { id: "printer-groups", label: "Printer Groups" },
    { id: "label-printer", label: "Label Printer" },
  ],
  accounts: [
    { id: "dashboard", label: "Dashboard" }, { id: "profit-loss", label: "Profit & Loss" },
    { id: "tax-summary", label: "Tax Summary" }, { id: "expenses", label: "All Expenses" },
    { id: "create-expense", label: "Create Expense" }, { id: "expense-categories", label: "Expense Categories" },
    { id: "deposits", label: "All Deposits" }, { id: "create-deposit", label: "Create Deposit" },
    { id: "deposit-categories", label: "Deposit Categories" }, { id: "transfers", label: "Transfers Money" },
  ],
};

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "User Management", icon: Users, expandable: true },
  { id: "outlets", label: "Outlets", icon: Building2, expandable: true },
  { id: "products", label: "Products", icon: Package, expandable: true },
  { id: "inventory", label: "Inventory", icon: Warehouse, expandable: true },
  { id: "purchases", label: "Purchases", icon: ShoppingBag, expandable: true },
  { id: "customers", label: "Customers", icon: UserCircle },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: BarChart2, expandable: true },
  { id: "accounts", label: "Accounts", icon: BookOpen, expandable: true },
  { id: "floor", label: "Floor Management", icon: LayoutGrid, expandable: true },
  { id: "settings", label: "Settings", icon: Settings, expandable: true },
];

export default function AdminPage() {
  const { user, logout } = useAuth();
  const { settings } = useBusiness();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [expandedSection, setExpandedSection] = useState(null);
  const [subViews, setSubViews] = useState({ users: "list", outlets: "outlets", products: "all-products", reports: "sales", inventory: "stock", purchases: "pending", floor: "tables", settings: "company", accounts: "dashboard" });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    api.getDashboardAnalytics().then(setAnalytics).catch(console.error).finally(() => setAnalyticsLoading(false));
  }, []);

  const handleNavClick = (id) => {
    setActiveSection(id);
    if (EXPANDABLE[id]) {
      setExpandedSection((prev) => {
        if (prev === id) return null;
        setSubViews((s) => ({ ...s, [id]: EXPANDABLE[id][0].id }));
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
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {sidebarOpen && (
        <aside className="fixed inset-y-0 left-0 w-60 bg-gray-900 dark:bg-gray-950 flex flex-col z-50 lg:relative lg:z-30 lg:flex-shrink-0">
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
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              const isExpanded = item.expandable && expandedSection === item.id;
              const subItems = EXPANDABLE[item.id] || [];

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
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          <div className="p-3 border-t border-gray-800 space-y-1">
            <button onClick={() => navigate("/pos")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-green-400 bg-green-950/60 hover:bg-green-900/50 transition-colors font-medium">
              <ArrowLeft size={18} />
              Back to POS
            </button>
            <button onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setSidebarOpen((v) => !v)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {user?.name?.[0]?.toUpperCase() || "A"}
              </div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{user?.name || "Admin"}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {activeSection === "dashboard" && (
              <DashboardContent analytics={analytics} loading={analyticsLoading} userName={user?.name} />
            )}
            {activeSection === "users" && <UsersSection view={subViews.users} />}
            {activeSection === "outlets" && <OutletsSection view={subViews.outlets} />}
            {activeSection === "products" && (
              <ProductsSection view={subViews.products} onViewChange={(v) => handleSubClick("products", v)} />
            )}
            {activeSection === "inventory" && <InventorySection view={subViews.inventory} />}
            {activeSection === "customers" && <CustomersSection />}
            {activeSection === "orders" && <OrdersSection />}
            {activeSection === "reports" && <ReportsSection view={subViews.reports} />}
            {activeSection === "accounts" && <AccountsSection view={subViews.accounts} onViewChange={(v) => handleSubClick("accounts", v)} />}
            {activeSection === "floor" && subViews.floor === "tables" && <TablesSection />}
            {activeSection === "floor" && subViews.floor === "bar-tabs" && <BarTabsAdminSection />}
            {activeSection === "settings" && <SettingsSection view={subViews.settings} />}
            {activeSection === "purchases" && <PurchasesSection view={subViews.purchases} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, bgColor, iconBg, valueColor }) {
  return (
    <div className={cn("rounded-2xl border-2 border-gray-300/80 dark:border-gray-600/80 p-5 flex items-center justify-between shadow-sm", bgColor)}>
      <div>
        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{title}</p>
        <p className={cn("text-3xl font-black", valueColor)}>{value}</p>
      </div>
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", iconBg)}>
        <Icon size={26} className="text-white" />
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
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Dashboard</h1>
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
                <th className="text-left px-6 py-3">Order #</th>
                <th className="text-left px-6 py-3">Customer</th>
                <th className="text-left px-6 py-3">Items</th>
                <th className="text-left px-6 py-3">Total</th>
                <th className="text-left px-6 py-3">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {recentOrders.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No orders yet</td></tr>
              ) : recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-sm">{order.order_number}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300 text-sm">{order.customer_name || "Walk-in Customer"}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300 text-sm">{order.items?.length ?? 0} items</td>
                  <td className="px-6 py-4 font-semibold text-green-600 dark:text-green-400 text-sm">{formatCurrency(order.total)}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium",
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
