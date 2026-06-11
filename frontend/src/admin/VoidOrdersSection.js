import React, { useEffect, useState } from "react";
import { Eye, Trash2, X, Ban, Search, Calendar, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency, dedupeOrders } from "../lib/utils";
import { useAuth } from "../context/AuthContext";

const PAYMENT_BADGE = {
  pending:  "bg-yellow-100 text-yellow-700",
  cash:     "bg-green-100 text-green-700",
  card:     "bg-blue-100 text-blue-700",
  transfer: "bg-purple-100 text-purple-700",
  wallet:   "bg-indigo-100 text-indigo-700",
};

function VoidDetailModal({ order, outlets, terminals, onClose, onDelete }) {
  const { user } = useAuth();
  const canDelete = user?.role === "admin";
  const outletName = outlets.find((o) => o.id === order.outlet_id)?.name || "—";
  const terminalName = terminals.find((t) => t.id === order.terminal_id)?.name || "—";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
              <Ban size={18} className="text-red-500" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 dark:text-white text-lg">{order.order_number}</h3>
              <p className="text-xs text-red-500 font-semibold uppercase tracking-wider">Voided</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Order Date", new Date(order.created_at).toLocaleString()],
              ["Customer", order.customer_name || "Walk-in Customer"],
              ["Cashier / Waiter", order.created_by_name || "—"],
              ["Outlet", outletName],
              ["Terminal", terminalName],
              ["Payment", order.payment_method
                ? <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold uppercase",
                    PAYMENT_BADGE[order.payment_method] || "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300")}>
                    {order.payment_method}
                  </span>
                : "—"],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{val}</p>
              </div>
            ))}
          </div>

          {/* Items */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Items</p>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-600">
                    <th className="text-left px-4 py-2">Item</th>
                    <th className="text-center px-3 py-2">Qty</th>
                    <th className="text-right px-4 py-2">Price</th>
                    <th className="text-right px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                  {(order.items || []).map((item, i) => (
                    <tr key={i} className="text-gray-700 dark:text-gray-300">
                      <td className="px-4 py-2 font-medium">{item.product_name || item.name}</td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.price)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Void Reason */}
          {order.void_reason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl p-4">
              <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-1">Void Reason</p>
              <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{order.void_reason}</p>
            </div>
          )}

          {/* Totals */}
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 space-y-1.5 text-sm">
            {[
              ["Subtotal", formatCurrency(order.subtotal || 0)],
              ...(order.discount ? [["Discount", `- ${formatCurrency(order.discount)}`]] : []),
              ...(order.tax ? [["Tax", formatCurrency(order.tax)]] : []),
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>{label}</span><span>{val}</span>
              </div>
            ))}
            <div className="flex justify-between font-black text-red-600 dark:text-red-400 text-base pt-1 border-t border-red-200 dark:border-red-700/50 mt-1">
              <span>Total (Voided)</span>
              <span className="line-through">{formatCurrency(order.total || 0)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            Close
          </button>
          {canDelete && (
            <button onClick={() => onDelete(order)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">
              <Trash2 size={15} />
              Delete Permanently
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VoidOrdersSection() {
  const [orders, setOrders]       = useState([]);
  const [outlets, setOutlets]     = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [outletFilter, setOutletFilter]   = useState("");
  const [orderSearch, setOrderSearch]     = useState("");
  const [waiterSearch, setWaiterSearch]   = useState("");
  const [dateFrom, setDateFrom]           = useState("");
  const [dateTo, setDateTo]               = useState("");
  const [viewOrder, setViewOrder] = useState(null);
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 25;

  const load = () => {
    setLoading(true);
    Promise.all([api.getOrders(), api.getOutlets(), api.getTerminals()])
      .then(([o, out, term]) => {
        setOrders(o);
        setOutlets(out);
        setTerminals(term);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const voided = dedupeOrders(orders.filter((o) => o.status === "voided"));

  const filtered = voided.filter((o) => {
    if (outletFilter && o.outlet_id !== outletFilter) return false;
    if (orderSearch && !(o.order_number || "").toLowerCase().includes(orderSearch.toLowerCase())) return false;
    if (waiterSearch && !(o.created_by_name || "").toLowerCase().includes(waiterSearch.toLowerCase())) return false;
    if (dateFrom && new Date(o.created_at) < new Date(dateFrom)) return false;
    if (dateTo  && new Date(o.created_at) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalVoidValue = voided.reduce((s, o) => s + (o.total || 0), 0);
  const todayVoided    = voided.filter((o) => {
    const d = new Date(o.created_at);
    const n = new Date();
    return d.toDateString() === n.toDateString();
  });

  const outletName   = (id) => outlets.find((o) => o.id === id)?.name || "—";
  const terminalName = (id) => terminals.find((t) => t.id === id)?.name || "—";

  const handleDelete = async (order) => {
    if (!window.confirm(`Permanently delete voided order ${order.order_number}? This cannot be undone.`)) return;
    try { await api.deleteOrder(order.id); setViewOrder(null); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
          <Ban size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Void Order Records</h1>
          <p className="text-xs text-gray-400 mt-0.5">All cancelled and voided transactions</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-3 sm:p-5 flex items-center justify-between">
          <div className="min-w-0 mr-3">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Voided Orders</p>
            <p className="text-2xl sm:text-4xl font-black text-red-500 dark:text-red-400">{voided.length}</p>
          </div>
          <div className="w-11 h-11 sm:w-14 sm:h-14 bg-red-100 dark:bg-red-800/40 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Ban size={22} className="text-red-400" />
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-3 sm:p-5 flex items-center justify-between">
          <div className="min-w-0 mr-3">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Void Value</p>
            <p className="text-2xl sm:text-4xl font-black text-orange-500 dark:text-orange-400 truncate">{formatCurrency(totalVoidValue)}</p>
          </div>
          <div className="w-11 h-11 sm:w-14 sm:h-14 bg-orange-100 dark:bg-orange-800/40 rounded-2xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={22} className="text-orange-400" />
          </div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-2xl p-3 sm:p-5 flex items-center justify-between">
          <div className="min-w-0 mr-3">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Voided Today</p>
            <p className="text-2xl sm:text-4xl font-black text-yellow-600 dark:text-yellow-400">{todayVoided.length}</p>
          </div>
          <div className="w-11 h-11 sm:w-14 sm:h-14 bg-yellow-100 dark:bg-yellow-800/40 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Calendar size={22} className="text-yellow-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 mb-3">
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Outlet</label>
          <div className="relative">
            <select value={outletFilter} onChange={(e) => { setOutletFilter(e.target.value); setPage(1); }}
              className="w-full appearance-none pl-3 pr-7 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-red-400 sm:min-w-[140px]">
              <option value="">All Outlets</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Order #</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="text" value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setPage(1); }}
              placeholder="Search order #"
              className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-red-400 sm:min-w-[140px]" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cashier / Waiter</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="text" value={waiterSearch} onChange={(e) => { setWaiterSearch(e.target.value); setPage(1); }}
              placeholder="Search by name"
              className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-red-400 sm:min-w-[140px]" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">From</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="py-2 px-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-red-400 sm:min-w-[140px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">To</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="py-2 px-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-red-400 sm:min-w-[140px]" />
        </div>
        <div className="col-span-2 sm:col-span-1 sm:ml-auto text-sm text-gray-400 font-medium self-end pb-0.5 text-right">
          {filtered.length} void{filtered.length !== 1 ? "s" : ""}{totalPages > 1 ? ` · page ${safePage}/${totalPages}` : ""}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-red-100 dark:border-red-900/30 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-red-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Ban size={40} className="mb-3 opacity-20" />
            <p className="font-semibold">No voided orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-red-50/60 dark:bg-red-900/10">
                  <th className="text-left px-3 sm:px-4 py-3">Order #</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden sm:table-cell">Date &amp; Time</th>
                  <th className="text-left px-3 sm:px-4 py-3">Customer</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden md:table-cell">Cashier / Waiter</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden md:table-cell">Outlet</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden lg:table-cell">Terminal</th>
                  <th className="text-center px-3 sm:px-4 py-3 hidden sm:table-cell">Items</th>
                  <th className="text-right px-3 sm:px-4 py-3">Total</th>
                  <th className="text-center px-3 sm:px-4 py-3 hidden sm:table-cell">Payment</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden xl:table-cell">Void Reason</th>
                  <th className="text-center px-3 sm:px-4 py-3">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {paginated.map((o) => (
                  <tr key={o.id} className="hover:bg-red-50/40 dark:hover:bg-red-900/10 transition-colors">
                    <td className="px-3 sm:px-4 py-3">
                      <span className="font-bold text-gray-900 dark:text-white text-sm">{o.order_number}</span>
                      <span className="ml-2 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-500 text-[10px] font-bold rounded-full uppercase">Void</span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap hidden sm:table-cell">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{o.customer_name || "Walk-in"}</td>
                    <td className="px-3 sm:px-5 py-3 hidden md:table-cell">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{o.created_by_name || "—"}</p>
                      {o.created_by_role && <p className="text-[10px] text-gray-400 uppercase tracking-wide">{o.created_by_role}</p>}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-gray-600 dark:text-gray-300 text-sm hidden md:table-cell">{outletName(o.outlet_id)}</td>
                    <td className="px-3 sm:px-4 py-3 text-gray-500 dark:text-gray-400 text-sm hidden lg:table-cell">{o.terminal_id ? terminalName(o.terminal_id) : "—"}</td>
                    <td className="px-3 sm:px-4 py-3 text-center text-gray-600 dark:text-gray-300 text-sm hidden sm:table-cell">{o.items?.length || 0}</td>
                    <td className="px-3 sm:px-4 py-3 text-right font-semibold text-red-400 text-sm whitespace-nowrap line-through">{formatCurrency(o.total)}</td>
                    <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">
                      {o.payment_method && o.payment_method !== "pending" ? (
                        <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold uppercase",
                          PAYMENT_BADGE[o.payment_method] || "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300")}>
                          {o.payment_method}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden xl:table-cell max-w-[200px]">
                      {o.void_reason
                        ? <span className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2">{o.void_reason}</span>
                        : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-center">
                      <button onClick={() => setViewOrder(o)}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1 gap-2 flex-wrap">
          <p className="text-xs sm:text-sm text-gray-400">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} records
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1}
              className="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
              .reduce((acc, n, i, arr) => { if (i > 0 && n - arr[i - 1] > 1) acc.push("…"); acc.push(n); return acc; }, [])
              .map((item, i) =>
                item === "…"
                  ? <span key={`e-${i}`} className="px-2 text-gray-400 text-sm">…</span>
                  : <button key={item} onClick={() => setPage(item)}
                      className={cn("px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                        safePage === item ? "bg-red-500 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}>
                      {item}
                    </button>
              )}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              className="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">»</button>
          </div>
        </div>
      )}

      {viewOrder && (
        <VoidDetailModal
          order={viewOrder}
          outlets={outlets}
          terminals={terminals}
          onClose={() => setViewOrder(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
