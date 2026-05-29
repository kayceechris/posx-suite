import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { BusinessProvider, useBusiness } from "./context/BusinessContext";
import { ThemeProvider } from "./context/ThemeContext";
import { OfflineProvider } from "./context/OfflineContext";
import OfflineBanner from "./components/OfflineBanner";
import { useKeepAlive } from "./hooks/useKeepAlive";
import SetupPage from "./pages/SetupPage";
import LoginPage from "./pages/LoginPage";
import HeldOrdersPage from "./pages/HeldOrdersPage";
import OrdersPage from "./pages/OrdersPage";
import POSPage from "./pages/POSPage";
import AdminPage from "./pages/AdminPage";
import TablesPage from "./pages/TablesPage";
import TablePOSPage from "./pages/TablePOSPage";
import CustomerDisplayPage from "./pages/CustomerDisplayPage";

function AppRoutes() {
  const { user } = useAuth();
  const { settings, loading } = useBusiness();
  useKeepAlive();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-body text-foreground-muted">Loading POSx Suite…</p>
        </div>
      </div>
    );
  }

  if (!settings?.setup_completed) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // hasTableSupport drives whether root redirects to /tables or /pos, and whether /tables is accessible.
  // Bar uses tabs (still routed through the Tables page), so any business with tables OR tabs counts.
  const TABS_OR_TABLES = ["restaurant", "nightclub", "bar"];
  const hasTableSupport = TABS_OR_TABLES.includes(settings?.business_type);
  const adminPerms = ["view_dashboard","view_users","view_outlets","view_products","view_inventory","view_stores","view_purchases","view_customers","view_orders","view_sales_report","view_accounts","view_tables","view_settings","manage_users","manage_products","approve_purchase"];
  const canAccessAdmin = user?.role === "admin" || user?.role === "manager" || user?.permissions?.some(p => adminPerms.includes(p));
  const defaultPath = canAccessAdmin ? "/admin" : hasTableSupport ? "/tables" : "/pos";

  return (
    <Routes>
      <Route path="/held-orders" element={<HeldOrdersPage />} />
      <Route path="/pos" element={hasTableSupport ? <Navigate to="/tables" replace /> : <POSPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/tables" element={hasTableSupport ? <TablesPage /> : <Navigate to="/pos" replace />} />
      <Route path="/table/:tableId" element={<TablePOSPage />} />
      <Route path="/bar-tab/:barTabId" element={<TablePOSPage />} />
      <Route
        path="/admin"
        element={
          canAccessAdmin ? (
            <AdminPage />
          ) : (
            <Navigate to={defaultPath} replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/display" element={<CustomerDisplayPage />} />
        <Route path="*" element={
          <BusinessProvider>
            <AuthProvider>
              <OfflineProvider>
                <AppRoutes />
                <OfflineBanner />
              </OfflineProvider>
            </AuthProvider>
          </BusinessProvider>
        } />
      </Routes>
      <SpeedInsights />
    </BrowserRouter>
    </ThemeProvider>
  );
}
