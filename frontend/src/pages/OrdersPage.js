import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search, X } from "lucide-react";
import { useBusiness } from "../context/BusinessContext";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import { BottomNav } from "../components/BottomNav";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";

const STATUS_STYLES = {
  completed: "bg-emerald-100 text-emerald-700",
  held:      "bg-amber-100 text-amber-700",
  voided:    "bg-red-100 text-red-600",
};

export default function OrdersPage() {
  const navigate = useNavigate();
  const { settings } = useBusiness();
  const config = useBusinessConfig();

  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [orderNumberInput, setOrderNumberInput] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [filters, setFilters] = useState({ order_number: "", created_by: "" });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOrders(filters);
      setOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const applyFilters = () =>
    setFilters({ order_number: orderNumberInput.trim(), created_by: selectedUser });

  const clearFilters = () => {
    setOrderNumberInput("");
    setSelectedUser("");
    setFilters({ order_number: "", created_by: "" });
  };

  const hasActiveFilters = filters.order_number || filters.created_by;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className={`bg-gradient-to-r ${config.headerBg} text-white`}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            data-testid="back-btn"
            onClick={() => navigate("/held-orders")}
            className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-white/10 btn-tactile touch-manipulation transition-all"
          >
            <ArrowLeft size={20} strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-body text-white/70 text-xs uppercase tracking-wider truncate">
              {settings?.business_name || "POSx Suite"}
            </p>
            <h1 className="font-heading font-black text-lg lg:text-xl">
              Order History
            </h1>
          </div>
          <button
            data-testid="refresh-orders-btn"
            onClick={fetchOrders}
            disabled={loading}
            className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-white/10 btn-tactile touch-manipulation transition-all"
          >
            <RefreshCw
              size={18}
              strokeWidth={2.5}
              className={loading ? "animate-spin" : ""}
            />
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="max-w-6xl mx-auto px-4 py-5 pb-safe lg:pb-8">
        {/* ── Filter bar ── */}
        <div className="bg-white rounded-2xl border-2 border-border p-4 mb-5">
          {/* On mobile: stacked; on desktop: single row */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            {/* Order number */}
            <div className="flex-1">
              <label className="block font-body text-xs font-semibold text-foreground-muted mb-1">
                Order Number
              </label>
              <div className="relative">
                <Search
                  size={14}
                  strokeWidth={2.5}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
                />
                <input
                  data-testid="filter-order-number"
                  type="text"
                  value={orderNumberInput}
                  onChange={(e) => setOrderNumberInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                  placeholder="e.g. ORD000001"
                  className="w-full pl-8 pr-3 py-2.5 border-2 border-border rounded-xl font-body text-sm text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            {/* Staff filter */}
            <div className="flex-1">
              <label className="block font-body text-xs font-semibold text-foreground-muted mb-1">
                {config.staffTitle}
              </label>
              <select
                data-testid="filter-user"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-border rounded-xl font-body text-sm text-foreground bg-white focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all appearance-none"
              >
                <option value="">All {config.staffTitlePlural}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                data-testid="apply-filters-btn"
                onClick={applyFilters}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-primary text-white font-heading font-bold text-sm rounded-xl border-b-4 border-blue-700 btn-tactile touch-manipulation hover:bg-primary-hover transition-all"
              >
                Search
              </button>
              {hasActiveFilters && (
                <button
                  data-testid="clear-filters-btn"
                  onClick={clearFilters}
                  className="px-3 py-2.5 border-2 border-border rounded-xl text-foreground-muted hover:bg-surface-alt btn-tactile touch-manipulation transition-all"
                  title="Clear filters"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-destructive text-sm font-body mb-4">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div
              className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${config.accent} transparent ${config.accent} ${config.accent}` }}
            />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-foreground-muted font-body">
            No orders found{hasActiveFilters ? " for the selected filters" : ""}.
          </div>
        ) : (
          <>
            {/* ── Mobile + Tablet: Card list (< lg) ── */}
            <div className="flex flex-col gap-3 lg:hidden" data-testid="orders-card-list">
              {orders.map((order) => (
                <div
                  key={order.id}
                  data-testid={`order-card-${order.id}`}
                  className="bg-white rounded-2xl border-2 border-border px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-sm text-foreground">
                        {config.orderIdLabel(order)}
                      </p>
                      <p className="font-body text-xs text-foreground-muted mt-0.5 font-mono">
                        {order.order_number}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <p className="font-heading font-black text-base text-foreground">
                        {formatCurrency(order.total)}
                      </p>
                      <span
                        className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full capitalize",
                          STATUS_STYLES[order.status] || "bg-surface-alt text-foreground-muted"
                        )}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-body text-foreground-muted">
                    {order.created_by_name && (
                      <span>{order.created_by_name}</span>
                    )}
                    {order.payment_method && (
                      <span className="capitalize">{order.payment_method}</span>
                    )}
                    <span className="ml-auto">
                      {new Date(order.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop: scrollable table (lg+) ── */}
            <div
              className="hidden lg:block bg-white rounded-2xl border-2 border-border overflow-hidden"
              data-testid="orders-table"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-border bg-surface-alt">
                      <th className="text-left px-5 py-3 font-heading font-bold text-foreground-muted text-xs uppercase tracking-wider">
                        Order #
                      </th>
                      <th className="text-left px-5 py-3 font-heading font-bold text-foreground-muted text-xs uppercase tracking-wider">
                        {config.staffTitle}
                      </th>
                      <th className="text-left px-5 py-3 font-heading font-bold text-foreground-muted text-xs uppercase tracking-wider">
                        Identifier
                      </th>
                      <th className="text-left px-5 py-3 font-heading font-bold text-foreground-muted text-xs uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left px-5 py-3 font-heading font-bold text-foreground-muted text-xs uppercase tracking-wider">
                        Payment
                      </th>
                      <th className="text-right px-5 py-3 font-heading font-bold text-foreground-muted text-xs uppercase tracking-wider">
                        Total
                      </th>
                      <th className="text-left px-5 py-3 font-heading font-bold text-foreground-muted text-xs uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        data-testid={`order-row-${order.id}`}
                        className="border-b border-border last:border-0 hover:bg-surface-alt/60 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-mono text-xs font-semibold text-foreground-muted">
                          {order.order_number}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-body font-medium text-foreground">
                            {order.created_by_name || "—"}
                          </span>
                          {order.created_by_role && (
                            <span className="ml-1 text-xs text-foreground-muted capitalize">
                              ({order.created_by_role})
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-body text-sm text-foreground">
                          {config.orderIdLabel(order)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-bold capitalize",
                              STATUS_STYLES[order.status] || "bg-surface-alt text-foreground-muted"
                            )}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-body text-sm text-foreground-muted capitalize">
                          {order.payment_method || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right font-heading font-bold text-foreground">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="px-5 py-3.5 font-body text-xs text-foreground-muted whitespace-nowrap">
                          {new Date(order.created_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-2.5 border-t border-border font-body text-xs text-foreground-muted">
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Bottom navigation (mobile + tablet) ── */}
      <BottomNav />
    </div>
  );
}
