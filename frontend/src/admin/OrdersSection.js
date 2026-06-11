import React, { useEffect, useRef, useState } from "react";
import { Eye, Trash2, X, ShoppingBag, Calendar, ClipboardList, Ban, Search, Printer, RotateCcw, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { cn, formatCurrency, dedupePendingOrders, dedupeOrders, userHasPermission } from "../lib/utils";
import { printService, pickReprintPrinter } from "../utils/printService";
import { useBusiness } from "../context/BusinessContext";
import { useAuth } from "../context/AuthContext";

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

function OrderDetailModal({ order, outlets, terminals, onClose, onVoid, onDelete, onRecall }) {
  const { settings } = useBusiness();
  const { user } = useAuth();
  const outletName = outlets.find((o) => o.id === order.outlet_id)?.name || "—";
  const terminalName = terminals.find((t) => t.id === order.terminal_id)?.name || "—";
  const [reprinting, setReprinting] = useState(false);
  const [reprintMsg, setReprintMsg] = useState("");
  const [recalling, setRecalling] = useState(false);

  const canRecall =
    order.status === "completed" &&
    (userHasPermission(user, "recall_order") || userHasPermission(user, "edit_completed_order"));

  const handleReprint = async () => {
    setReprinting(true);
    setReprintMsg("");
    try {
      // Reprints always route to the designated reprint printer
      // (MP-POS80 4 by default — see pickReprintPrinter).
      let usbPrinter = pickReprintPrinter();
      if (!usbPrinter) {
        try {
          const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
          usbPrinter = saved.find((x) => x.mode === "usb" && x.type === "receipt") || null;
        } catch {}
      }
      await printService.printReceipt({
        businessName: settings?.business_name || "Restaurant",
        address: settings?.company_address || settings?.address || "",
        phone: settings?.company_phone || settings?.phone || "",
        logoUrl: settings?.company_logo || settings?.logo_url || "",
        tableName: order.table_number ? `Table ${order.table_number}` : (order.customer_name || ""),
        orderNo: order.order_number || order.id?.slice(-8)?.toUpperCase() || "",
        // Fall through to created_by_name (whoever rang the order up) when
        // there's no explicit waiter on the order — otherwise the receipt
        // prints with no seller line at all for counter sales and any
        // order whose waiter field was never populated.
        waiter: order.waiter_name || order.served_by_name || order.created_by_name || "",
        cashier: order.created_by_name || "",
        items: (order.items || []).map((i) => ({
          name: i.product_name || i.name,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
        })),
        subtotal: order.subtotal || 0,
        taxAmount: order.tax || 0,
        discount: order.discount || 0,
        total: order.total || 0,
        paymentMethod: order.payment_method || "",
        docType: "RECEIPT",
        // Banner + 'Reprinted: <timestamp>' line. Original order date
        // is preserved on the Date line below.
        reprintAt: new Date().toISOString(),
        orderDate: order.created_at || order.completed_at || null,
        layoutSettings: settings?.receipt_settings || {},
      }, { printer: usbPrinter });
      setReprintMsg("Receipt sent to printer");
    } catch (err) {
      setReprintMsg(err.message || "Failed to reprint");
    } finally {
      setReprinting(false);
      setTimeout(() => setReprintMsg(""), 3500);
    }
  };

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
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">
                  <th className="text-left px-4 py-2.5">Item</th>
                  <th className="text-center px-3 py-2.5 w-10">Qty</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Unit Price</th>
                  <th className="text-right px-4 py-2.5 whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {(order.items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{item.product_name}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600 dark:text-gray-300">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatCurrency(item.price)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600 whitespace-nowrap">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
          {reprintMsg && (
            <p className={cn("text-xs font-semibold text-center",
              reprintMsg.includes("Failed") ? "text-red-500" : "text-green-600 dark:text-green-400")}>
              {reprintMsg}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button onClick={onClose}
              className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
              Close
            </button>
            <div className="flex gap-2 flex-wrap">
              {order.status !== "voided" && (
                <button onClick={handleReprint} disabled={reprinting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-xl font-semibold text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors">
                  <Printer size={14} /> {reprinting ? "Reprinting…" : "Reprint Receipt"}
                </button>
              )}
              {canRecall && (
                <button
                  onClick={async () => {
                    if (recalling) return;
                    if (!window.confirm("Recall this completed order? It will reopen for editing, stock will be added back, and customer purchase totals will be reversed.")) return;
                    setRecalling(true);
                    try {
                      await onRecall(order);
                    } finally { setRecalling(false); }
                  }}
                  disabled={recalling}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl font-semibold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors">
                  <RotateCcw size={14} /> {recalling ? "Recalling…" : "Recall & Edit"}
                </button>
              )}
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
    </div>
  );
}

function VoidReasonModal({ order, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try { await onConfirm(order, reason.trim()); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="w-9 h-9 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-black text-gray-900 dark:text-white text-base">Void Order</h3>
            <p className="text-xs text-gray-400">{order.order_number} · {formatCurrency(order.total)}</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This action cannot be undone. Please provide a reason for voiding this order.
          </p>
          <div>
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">
              Void Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Customer cancelled, Wrong order, Duplicate entry..."
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-red-400 resize-none"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!reason.trim() || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Ban size={15} />}
            Void Order
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersSection() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outletFilter, setOutletFilter] = useState("");
  const [terminalFilter, setTerminalFilter] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [waiterSearch, setWaiterSearch] = useState("");
  const [viewOrder, setViewOrder] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
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

  const filteredRaw = orders.filter((o) => {
    if (outletFilter && o.outlet_id !== outletFilter) return false;
    if (terminalFilter && o.terminal_id !== terminalFilter) return false;
    if (orderSearch && !(o.order_number || "").toLowerCase().includes(orderSearch.toLowerCase())) return false;
    if (waiterSearch && !(o.created_by_name || "").toLowerCase().includes(waiterSearch.toLowerCase())) return false;
    return true;
  });

  // Shared dedupe — first the pending/held collapse, then the broader
  // completed/voided dedupe that catches offline-sync replays and
  // pre-fix duplicate-create artifacts. Latest record per logical bucket
  // wins; older copies are dropped from the list.
  // Final sort by created_at descending — belt-and-braces over the
  // backend sort. Guarantees the latest transaction always lands at
  // the top of page 1 regardless of dedupe iteration order or any
  // future change to the API response shape.
  const filtered = dedupeOrders(dedupePendingOrders(filteredRaw))
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const availableTerminals = terminalFilter
    ? terminals
    : outletFilter
    ? terminals.filter((t) => t.outlet_id === outletFilter)
    : terminals;

  const handleVoid = (order) => { setVoidTarget(order); };

  const handleVoidConfirm = async (order, reason) => {
    try { await api.voidOrder(order.id, reason); setVoidTarget(null); setViewOrder(null); load(); }
    catch (err) { alert(err.message); }
  };

  const handleDelete = async (order) => {
    if (!window.confirm(`Permanently delete order ${order.order_number}? This cannot be undone.`)) return;
    try { await api.deleteOrder(order.id); setViewOrder(null); load(); }
    catch (err) { alert(err.message); }
  };

  const handleRecall = async (order) => {
    try {
      await api.recallOrder(order.id);
      setViewOrder(null);
      // If the order has a table, jump straight into the POS for that table
      // so the recalled cart is ready to edit. Otherwise just reload the list.
      if (order.table_id) {
        navigate(`/table/${order.table_id}`);
      } else {
        load();
      }
    } catch (err) {
      alert(err.message);
    }
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
        <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Order Management</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 sm:p-5 flex items-center justify-between">
          <div className="min-w-0 mr-3">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Today's Orders</p>
            <p className="text-2xl sm:text-4xl font-black text-blue-600 dark:text-blue-400">{todayOrders.length}</p>
          </div>
          <div className="w-11 h-11 sm:w-14 sm:h-14 bg-blue-100 dark:bg-blue-800/40 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Calendar size={22} className="text-blue-500 dark:text-blue-400" />
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-3 sm:p-5 flex items-center justify-between">
          <div className="min-w-0 mr-3">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Today's Revenue</p>
            <p className="text-2xl sm:text-4xl font-black text-green-600 dark:text-green-400 truncate">{formatCurrency(todayRevenue)}</p>
          </div>
          <div className="w-11 h-11 sm:w-14 sm:h-14 bg-green-100 dark:bg-green-800/40 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ShoppingBag size={22} className="text-green-500 dark:text-green-400" />
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-3 sm:p-5 flex items-center justify-between">
          <div className="min-w-0 mr-3">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Revenue</p>
            <p className="text-2xl sm:text-4xl font-black text-orange-500 dark:text-orange-400 truncate">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="w-11 h-11 sm:w-14 sm:h-14 bg-orange-100 dark:bg-orange-800/40 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ShoppingBag size={22} className="text-orange-400 dark:text-orange-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 mb-3">
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Outlet</label>
          <div className="relative">
            <select value={outletFilter} onChange={(e) => { setOutletFilter(e.target.value); setTerminalFilter(""); setPage(1); }}
              className="w-full appearance-none pl-3 pr-7 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 sm:min-w-[140px]">
              <option value="">All Outlets</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Terminal</label>
          <div className="relative">
            <select value={terminalFilter} onChange={(e) => { setTerminalFilter(e.target.value); setPage(1); }}
              className="w-full appearance-none pl-3 pr-7 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 sm:min-w-[140px]">
              <option value="">All Terminals</option>
              {availableTerminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
              className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 sm:min-w-[140px]" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Waiter / Cashier</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="text" value={waiterSearch} onChange={(e) => { setWaiterSearch(e.target.value); setPage(1); }}
              placeholder="Search by name"
              className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:border-blue-500 sm:min-w-[140px]" />
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 sm:ml-auto text-sm text-gray-400 font-medium self-end pb-0.5 text-right">
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
            <table className="w-full min-w-0">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-3 sm:px-4 py-3">Order #</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden sm:table-cell">Date &amp; Time</th>
                  <th className="text-left px-3 sm:px-4 py-3">Customer</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden md:table-cell">Cashier / Waiter</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden md:table-cell">Outlet</th>
                  <th className="text-left px-3 sm:px-4 py-3 hidden lg:table-cell">Terminal</th>
                  <th className="text-center px-3 sm:px-4 py-3 hidden sm:table-cell">Items</th>
                  <th className="text-right px-3 sm:px-4 py-3">Total</th>
                  <th className="text-center px-3 sm:px-4 py-3 hidden sm:table-cell">Payment</th>
                  <th className="text-center px-3 sm:px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                    <td className="px-3 sm:px-4 py-3 font-bold text-gray-900 dark:text-white text-sm whitespace-nowrap">{o.order_number}</td>
                    <td className="px-3 sm:px-4 py-3 text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap hidden sm:table-cell">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{o.customer_name || "Walk-in"}</td>
                    <td className="px-3 sm:px-5 py-3 hidden md:table-cell">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{o.created_by_name || "—"}</p>
                      {o.created_by_role && (
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{o.created_by_role}</p>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-gray-600 dark:text-gray-300 text-sm hidden md:table-cell">{outletName(o.outlet_id)}</td>
                    <td className="px-3 sm:px-4 py-3 text-gray-500 dark:text-gray-400 text-sm hidden lg:table-cell">{o.terminal_id ? terminalName(o.terminal_id) : "—"}</td>
                    <td className="px-3 sm:px-4 py-3 text-center text-gray-600 dark:text-gray-300 text-sm hidden sm:table-cell">{o.items?.length || 0}</td>
                    <td className="px-3 sm:px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400 text-sm whitespace-nowrap">{formatCurrency(o.total)}</td>
                    <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">
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
                    <td className="px-3 sm:px-4 py-3 text-center">
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
        <div className="flex items-center justify-between mt-4 px-1 gap-2 flex-wrap">
          <p className="text-xs sm:text-sm text-gray-400">
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
          onRecall={handleRecall}
        />
      )}
      {voidTarget && (
        <VoidReasonModal
          order={voidTarget}
          onConfirm={handleVoidConfirm}
          onClose={() => setVoidTarget(null)}
        />
      )}
    </div>
  );
}
