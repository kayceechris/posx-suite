import React, { useState } from "react";
import {
  ClipboardList, Download, LayoutDashboard, LogOut, Moon, Monitor, PanelLeftClose, PanelLeftOpen,
  RefreshCw, Settings, Share, ShoppingCart, Sun, X,
} from "lucide-react";
import { triggerSync } from "../serviceWorkerRegistration";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import { useInstallPWA } from "../hooks/useInstallPWA";
import { useTheme } from "../context/ThemeContext";
import { cn } from "../lib/utils";

export default function Sidebar({ extraItems = [], onSettingsClick, mobileOpen = false, onMobileClose }) {
  const { user, logout } = useAuth();
  const { settings } = useBusiness();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [syncing, setSyncing] = React.useState(false);
  const [online, setOnline] = React.useState(navigator.onLine);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const { isInstallable, isIOS, isInstalled, promptInstall } = useInstallPWA();
  const { theme, toggleTheme } = useTheme();

  React.useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const handleSync = () => {
    if (syncing || !online) return;
    setSyncing(true);
    triggerSync();
    setTimeout(() => setSyncing(false), 1500);
  };

  const handleInstall = () => {
    if (isIOS) { setShowIOSModal(true); return; }
    promptInstall();
  };

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; }
    catch { return false; }
  });

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
      return next;
    });
  };

  const hasTableSupport = ["restaurant", "nightclub", "bar", "cafe"].includes(
    settings?.business_type
  );

  const navItems = [
    ...(!hasTableSupport ? [{ label: "POS", icon: ShoppingCart, path: "/pos" }] : []),
    { label: "Held Orders", icon: ClipboardList, path: "/held-orders" },
    ...(hasTableSupport ? [{ label: "Tables", icon: Monitor, path: "/tables" }] : []),
    ...(user?.role === "admin" || user?.permissions?.includes("approve_purchase")
      ? [{ label: "Admin", icon: LayoutDashboard, path: "/admin" }] : []),
    ...extraItems,
  ];

  const isActive = (path) => {
    if (path === "/pos") return pathname === "/pos";
    if (path === "/tables") return pathname === "/tables" || pathname.startsWith("/table/") || pathname.startsWith("/bar-tab/");
    return pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* iOS install instructions modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 pb-8 px-4">
          <div className="bg-[#1f2937] rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-base">Install POSx Suite</h3>
              <button onClick={() => setShowIOSModal(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-gray-400 text-sm mb-4">Follow these steps to add the app to your home screen:</p>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <div>
                  <p className="text-gray-200 text-sm font-medium">Tap the Share button</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Share size={14} className="text-blue-400" />
                    <span className="text-gray-500 text-xs">in your Safari browser toolbar</span>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <div>
                  <p className="text-gray-200 text-sm font-medium">Scroll down and tap</p>
                  <p className="text-blue-400 text-sm font-semibold mt-0.5">"Add to Home Screen"</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <div>
                  <p className="text-gray-200 text-sm font-medium">Tap <span className="text-blue-400 font-semibold">Add</span> in the top-right corner</p>
                </div>
              </li>
            </ol>
            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

    <aside
      className={cn(
        "bg-[#111827] flex flex-col flex-shrink-0 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        // Mobile: fixed overlay, slide in/out
        "fixed top-0 left-0 h-screen z-40",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop: static in flex layout, always visible
        "lg:relative lg:h-full lg:z-30 lg:translate-x-0",
        collapsed ? "w-[68px]" : "w-56"
      )}
    >
      {/* Brand + collapse toggle */}
      <div className="px-3 py-4 border-b border-white/5 flex items-center gap-3 min-h-[68px]">
        <div
          className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-900/40 cursor-pointer"
          onClick={toggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ShoppingCart size={19} className="text-white" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">
                {settings?.business_name || "POSx Suite"}
              </p>
              <p className="text-gray-500 text-[11px] mt-0.5">POS Station</p>
            </div>
            <button
              onClick={toggleCollapse}
              className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 ml-1"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-hidden">
        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={toggleCollapse}
            className="w-full flex items-center justify-center py-2.5 mb-1 text-gray-500 hover:text-gray-300 transition-colors"
            title="Expand sidebar"
          >
            <PanelLeftOpen size={17} />
          </button>
        )}

        {navItems.map(({ label, icon: Icon, path }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              title={collapsed ? label : undefined}
              className={cn(
                "w-full flex items-center rounded-xl text-sm font-medium transition-all duration-150",
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon
                size={17}
                className={active ? "text-white" : "text-gray-500"}
                strokeWidth={active ? 2.5 : 2}
              />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom: sync + settings + user + logout */}
      <div className="px-2 py-4 border-t border-white/5 space-y-0.5">
        <button
          onClick={handleSync}
          disabled={syncing || !online}
          title={collapsed ? (online ? "Sync" : "Offline") : undefined}
          className={cn(
            "w-full flex items-center rounded-xl text-sm font-medium transition-all duration-150",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
            !online
              ? "text-red-400 hover:bg-red-500/10"
              : "text-gray-400 hover:bg-white/5 hover:text-white"
          )}
        >
          <RefreshCw
            size={17}
            className={cn(
              syncing ? "animate-spin" : "",
              !online ? "text-red-500" : "text-gray-500"
            )}
            strokeWidth={2}
          />
          {!collapsed && (
            <span>{syncing ? "Syncing…" : online ? "Sync" : "Offline"}</span>
          )}
          {!collapsed && !online && (
            <span className="ml-auto w-2 h-2 rounded-full bg-red-500" />
          )}
        </button>

        {isInstallable && !isInstalled && (
          <button
            onClick={handleInstall}
            title={collapsed ? "Install App" : undefined}
            className={cn(
              "w-full flex items-center rounded-xl text-sm font-medium text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-all duration-150",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
            )}
          >
            <Download size={17} className="text-blue-500" strokeWidth={2} />
            {!collapsed && <span>Install App</span>}
          </button>
        )}

        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={cn(
            "w-full flex items-center rounded-xl text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-all duration-150",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
          )}
        >
          {theme === "dark"
            ? <Sun size={17} className="text-yellow-400" strokeWidth={2} />
            : <Moon size={17} className="text-gray-500" strokeWidth={2} />
          }
          {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>

        {!["waiter", "cashier"].includes(user?.role) && (
          <button
            onClick={onSettingsClick ?? (() => navigate("/admin"))}
            title={collapsed ? "Settings" : undefined}
            className={cn(
              "w-full flex items-center rounded-xl text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-all duration-150",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
            )}
          >
            <Settings size={17} className="text-gray-500" strokeWidth={2} />
            {!collapsed && <span>Settings</span>}
          </button>
        )}

        {/* User chip */}
        <div
          className={cn(
            "flex items-center rounded-xl",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
          )}
          title={collapsed ? (user?.name || "Staff") : undefined}
        >
          <div className="w-7 h-7 bg-blue-700/40 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-blue-300 text-xs font-bold uppercase">
              {(user?.name || "S")[0]}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-gray-300 text-xs font-semibold truncate">
                {user?.name || "Staff"}
              </p>
              <p className="text-gray-600 text-[10px] capitalize">{user?.role}</p>
            </div>
          )}
        </div>

        <button
          onClick={logout}
          title={collapsed ? "Logout" : undefined}
          className={cn(
            "w-full flex items-center rounded-xl text-sm font-medium text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
          )}
        >
          <LogOut size={17} className="text-gray-500" strokeWidth={2} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
