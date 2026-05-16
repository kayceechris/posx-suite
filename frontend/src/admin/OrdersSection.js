import React, { useEffect, useState } from "react";
import { Eye, Trash2, X, ShoppingBag, Calendar, ClipboardList, Ban, Search } from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";

function isToday(dateStr) {
  const d = new Date(dateStr);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

const PAYMENT_BADGE = {
  pending:  "bg-yellow-100 text-yellow-700",
  cash:     "bg-green-100 text-green-700",
  card:     "bg-blue-100 text-blue-700",
  transfer: "bg-purple-100 text-purple-700",
  wallet:   "bg-indigo-100 text-indigo-700",
};

function OrderDetailModal({ order, outlets, terminals, onClose, onVoid, onDelete }) {
  const outletName = outlets.find((o) => o.id === order.outlet_id)?.name || "—";
  const terminalName = terminals.find((t) => t.id === order.terminal_id)?.name || "—";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-black text-gray-900 dark:text-white text-lg">{order.order_number}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Customer", order.customer_name || "Walk-in Customer"],
              ["Cashier / Waiter", order.created_by_name || "—"],
              ["Outlet", outletName],
              ["Terminal", terminalName],
              ["Status", <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold capitalize",
                order.status === "completed" ? "bg-green-100 text-green-700" :
                order.status === "voided"    ? "bg-red-100 text-red-600" :
                "bg-yellow-100 text-yellow-700")}>{order.status}</span>],
              ["Payment", order.payment_method
                ? <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold uppercase",
                    PAYMENT_BADGE[order.payment_method] || "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300")}>{order.payment_method}</span>
                : "—"],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{val}</p>
              </div>
            ))}
          </div>

          {/* Items table */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">
                  <th className="text-left px-4 py-2.5">Item</th>
                  <th className="text-center px-4 py-2.5">Qty</th>
                  <th className="text-right px-4 py-2.5">Unit Price</th>
                  <th className="text-right px-4 py-2.5">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {(order.items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{item.product_name}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600 dark:text-gray-300">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{formatCurrency(item.price)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm">
              {order.discount > 0 && (
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <span>Discount</span><span>-{formatCurrency(order.discount)}</span>
                </div>
              )}
              {order.tax > 0 && (
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <span>Tax</span><span>{formatCurrency(order.tax)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
                <span>Total</span><span className="text-green-600">{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
          <button onClick={onClose}
            className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
            Close
          </button>
          <div className="flex gap-2">
            {order.status !== "voided" && (
              <button onClick={() => onVoid(order)}
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 rounded-xl font-semibold text-sm hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors">
                <Ban size={14} /> Void Order
              </button>
            )}
            <button onClick={() => onDelete(order)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl font-semibold text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
              <Trash2 size={14} /> Delete Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrdersSection() {
  const [orders, setOrders] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outletFilter, setOutletFilter] = useState("");
  const [terminalFilter, setTerminalFilter] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [waiterSearch, setWaiterSearch] = useState("");
  const [viewOrder, setViewOrder] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const load = () => {
    setLoading(true);
    Promise.all([api.getOrders(), api.getOutlets(), api.getTerminals()])
      .then(([o, out, term]) => { setOrders(o); setOutlets(out); setTerminals(term); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const todayOrders = orders.filter((o) => isToday(o.created_at) && o.status !== "voided");
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const totalRevenue = orders.filter((o) => o.status === "completed").reduce((s, o) => s + (o.total || 0), 0);

  const filtered = orders.filter((o) => {
    if (outletFilter && o.outlet_id !== outletFilter) return false;
    if (terminalFilter && o.terminal_id !== terminalFilter) return false;
    if (orderSearch && !(o.order_number || "").toLowerCase().includes(orderSearch.toLowerCase())) return false;
    if (waiterSearch && !(o.created_by_name || "").toLowerCase().includes(waiterSearch.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const availableTerminals = terminalFilter
    ? terminals
    : outletFilter
    ? terminals.filter((t) => t.outlet_id === outletFilter)
    : terminals;

  const handleVoid = async (order) => {
    if (!window.confirm(`Void order ${order.order_number}? This cannot be undone.`)) return;
    try { await api.voidOrder(order.id); setViewOrder(null); load(); }
    catch (err) { alert(err.message); }
  };

  const handleDelete = async (order) => {
    if (!window.confirm(`Permanently delete order ${order.order_number}? This cannot be undone.`)) return;
    try { await api.deleteOrder(order.id); setViewOrder(null); load(); }
    catch (err) { alert(err.message); }
  };

  const outletName = (id) => outlets.find((o) => o.id === id)?.name || "—";
  const terminalName = (id) => terminals.find((t) => t.id === id)?.name || "—";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-pink-500 rounded-xl flex items-center justify-center">
          <ClipboardList size={20} className="text-white" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Order Management</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Today's Orders</p>
            <p className="text-4xl font-black text-blue-600">{todayOrders.length}</p>
          </div>
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center">
            <Calendar size={26} className="text-blue-500" />
          </div>
        </div>
        <div className="bg-green-50 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Today's Revenue</p>
            <p className="text-4xl font-black text-green-600">{formatCurrency(todayRevenue)}</p>
          </div>
          <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center">
            <ShoppingBag size={26} className="text-green-500" />
          </div>
        </div>
        <div className="bg-orange-50 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Total Revenue</p>
            <p className="text-4xl font-black text-orange-500">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center">
            <ShoppingBag size={26} className="text-orange-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Outlet</label>
          <div className="relative">
            <select value={outletFilter} onChange={(e) => { setOutletFilter(e.target.value); setTerminalFilter(""); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 min-w-[160px]">
              <option value="">All Outlets</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Terminal</label>
          <div className="relative">
            <select value={terminalFilter} onChange={(e) => { setTerminalFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 min-w-[160px]">
              <option value="">All Terminals</option>
              {availableTerminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Order #</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={orderSearch}
              onChange={(e) => { setOrderSearch(e.target.value); setPage(1); }}
              placeholder="Search order #"
              className="pl-8 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 min-w-[150px]"
            />
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Waiter / Cashier</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={waiterSearch}
              onChange={(e) => { setWaiterSearch(e.target.value); setPage(1); }}
              placeholder="Search by name"
              className="pl-8 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 min-w-[150px]"
            />
          </div>
        </div>
        <div className="ml-auto text-sm text-gray-400 font-medium self-end pb-0.5">
          {filtered.length} order{filtered.length !== 1 ? "s" : ""}{totalPages > 1 ? ` · page ${safePage}/${totalPages}` : ""}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-5 py-3">Order #</th>
                  <th className="text-left px-5 py-3">Date &amp; Time</th>
                  <th className="text-left px-5 py-3">Customer</th>
                  <th className="text-left px-5 py-3">Cashier / Waiter</th>
                  <th className="text-left px-5 py-3">Outlet</th>
                  <th className="text-left px-5 py-3">Terminal</th>
                  <th className="text-center px-5 py-3">Items</th>
                  <th className="text-right px-5 py-3">Total</th>
                  <th className="text-center px-5 py-3">Payment</th>
                  <th className="text-center px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                    <td className="px-5 py-3 font-bold text-gray-900 dark:text-white text-sm">{o.order_number}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300 text-sm">{o.customer_name || "Walk-in Customer"}</td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{o.created_by_name || "—"}</p>
                      {o.created_by_role && (
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{o.created_by_role}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300 text-sm">{outletName(o.outlet_id)}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm">{o.terminal_id ? terminalName(o.terminal_id) : "—"}</td>
                    <td className="px-5 py-3 text-center text-gray-600 dark:text-gray-300 text-sm">{o.items?.length || 0}</td>
                    <td className="px-5 py-3 text-right font-semibold text-green-600 text-sm">{formatCurrency(o.total)}</td>
                    <td className="px-5 py-3 text-center">
                      {o.payment_method && o.payment_method !== "pending" ? (
                        <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold uppercase",
                          PAYMENT_BADGE[o.payment_method] || "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300")}>
                          {o.payment_method}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                          PENDING
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => setViewOrder(o)}
                        className="p-1.5 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400 text-sm">No orders found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-gray-400">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} orders
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >«</button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
              .reduce((acc, n, i, arr) => {
                if (i > 0 && n - arr[i - 1] > 1) acc.push("…");
                acc.push(n);
                return acc;
              }, [])
              .map((item, i) =>
                item === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                      safePage === item
                        ? "bg-blue-600 text-white"
                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >{item}</button>
                )
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >Next</button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >»</button>
          </div>
        </div>
      )}

      {viewOrder && (
        <OrderDetailModal
          order={viewOrder}
          outlets={outlets}
          terminals={terminals}
          onClose={() => setViewOrder(null)}
          onVoid={handleVoid}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
