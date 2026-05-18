import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { BusinessProvider, useBusiness } from "./context/BusinessContext";
import { ThemeProvider } from "./context/ThemeContext";
import { OfflineProvider } from "./context/OfflineContext";
import OfflineBanner from "./components/OfflineBanner";
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

  const hasTableSupport = ["restaurant", "nightclub", "bar", "cafe"].includes(settings?.business_type);
  const canAccessAdmin = user?.role === "admin" || user?.permissions?.includes("approve_purchase");
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
          user?.role === "admin" || user?.permissions?.includes("approve_purchase") ? (
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
    </BrowserRouter>
    </ThemeProvider>
  );
}
