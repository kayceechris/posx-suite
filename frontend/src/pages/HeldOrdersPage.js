import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, Clock, Menu, Monitor, Printer, RefreshCw, Trash2, User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import Sidebar from "../components/Sidebar";
import TerminalSettingsModal from "../components/TerminalSettingsModal";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";

const DEFAULT_METHODS = [
  { name: "cash", label: "Cash", emoji: "💵" },
  { name: "card", label: "Card", emoji: "💳" },
  { name: "mobile", label: "Mobile Pay", emoji: "📱" },
];

function PaymentModal({ order, onClose, onConfirm }) {
  const [method, setMethod] = useState(DEFAULT_METHODS[0].name);
  const [amountPaid, setAmountPaid] = useState(order.total.toFixed(2));

  const paid = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paid - order.total);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm overflow-hidden max-h-[95vh] overflow-y-auto">
        <div className="bg-emerald-500 p-6 text-white text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/75 mb-1">Total Amount</p>
          <p className="text-4xl font-black tabular-nums">{formatCurrency(order.total)}</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Payment method */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
              Payment Method
            </label>
            <div className="relative">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400 appearance-none font-semibold"
              >
                {DEFAULT_METHODS.map((m) => <option key={m.name} value={m.name}>{m.label}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Amount paid */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
              Amount Paid
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400 font-bold text-xl"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setAmountPaid(order.total.toFixed(2))} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">Exact</button>
              {[10, 20, 50, 100].map((amt) => (
                <button key={amt} onClick={() => setAmountPaid(amt.toFixed(2))} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">{amt}</button>
              ))}
            </div>
          </div>

          {/* Change */}
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-700/50 rounded-2xl px-5 py-3.5 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Change</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(change)}</span>
          </div>

          <button
            onClick={() => onConfirm(method)}
            className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-base hover:bg-emerald-600 active:bg-emerald-700 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={18} />
            Confirm Payment
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl font-bold text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function printOrderBill(order, settings) {
  const bizName = settings?.business_name || "Restaurant";
  const currency = settings?.currency_symbol || "$";
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const rows = (order.items || []).map((item) => `
    <tr>
      <td style="padding:2px 0">${item.product_name || item.name || ""}</td>
      <td style="padding:2px 0;text-align:center">${item.quantity || item.qty || 0}</td>
      <td style="padding:2px 0;text-align:right">${currency}${(item.total || 0).toFixed(2)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bill - ${bizName}</title>
<style>
  body{font-family:monospace;font-size:12px;margin:0;padding:12px;width:280px}
  h2{text-align:center;margin:0 0 4px;font-size:14px}
  .doc-type{text-align:center;font-size:13px;font-weight:bold;letter-spacing:3px;margin:4px 0 2px}
  p{margin:2px 0;text-align:center;font-size:11px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{text-align:left;font-size:11px;border-bottom:1px solid #000;padding-bottom:3px}
  .divider{border-top:1px dashed #000;margin:6px 0}
  .total{font-weight:bold;font-size:13px}
  td{vertical-align:top}
</style></head><body>
<h2>${bizName}</h2>
<p class="doc-type">*** BILL ***</p>
<p>${dateStr} ${timeStr}</p>
${order.table_number ? `<p>Table: ${order.table_number}</p>` : ""}
${order.customer_name ? `<p>Customer: ${order.customer_name}</p>` : ""}
<p>${order.order_number}</p>
<div class="divider"></div>
<table>
  <thead><tr>
    <th style="text-align:left">Item</th>
    <th style="text-align:center">Qty</th>
    <th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="divider"></div>
<table>
  <tr><td>Subtotal</td><td style="text-align:right">${currency}${(order.subtotal || order.total || 0).toFixed(2)}</td></tr>
  ${order.tax > 0 ? `<tr><td>Tax</td><td style="text-align:right">${currency}${order.tax.toFixed(2)}</td></tr>` : ""}
  <tr class="total"><td>TOTAL</td><td style="text-align:right">${currency}${(order.total || 0).toFixed(2)}</td></tr>
</table>
<div class="divider"></div>
<p>Thank you!</p>
</body></html>`;

  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) { alert("Allow popups to print the bill"); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onafterprint = () => w.close();
  setTimeout(() => w.print(), 400);
}

function OrderCard({ order, canSeeAll, onDelete, onComplete, onLoad, onPrint, isActing }) {
  const [showPayModal, setShowPayModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fmtDate = (s) => {
    const d = new Date(s);
    return (
      d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      ", " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Clock size={14} className="text-white" />
          </div>
          <span className="font-bold text-amber-700 dark:text-amber-400 text-sm">{order.order_number}</span>
          {order.table_number && (
            <span className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold px-2 py-0.5 rounded-lg">
              <Monitor size={11} />
              Table {order.table_number}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{fmtDate(order.created_at)}</span>
      </div>

      <div className="px-4 py-3 flex-1 space-y-1.5">
        {canSeeAll && order.created_by_name && (
          <div className="flex items-center gap-1.5 mb-2 py-1.5 px-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl">
            <User size={12} className="text-blue-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">{order.created_by_name}</span>
            {order.created_by_role && (
              <span className="text-[10px] text-blue-400 capitalize ml-0.5">· {order.created_by_role}</span>
            )}
          </div>
        )}

        {order.customer_name && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            Customer: <span className="font-semibold text-gray-700 dark:text-gray-300">{order.customer_name}</span>
          </p>
        )}

        {(order.items || []).map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {item.quantity}x {item.product_name || item.name}
            </span>
            <span className="text-gray-800 dark:text-gray-200 font-medium tabular-nums">
              {formatCurrency(item.total)}
            </span>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <span className="text-sm text-gray-500 dark:text-gray-400">Total</span>
          <span className="font-black text-gray-900 dark:text-white text-base tabular-nums">
            {formatCurrency(order.total)}
          </span>
        </div>

        <div className="flex gap-2">
          {showDeleteConfirm ? (
            <div className="flex gap-1.5 flex-1">
              <button
                onClick={() => { setShowDeleteConfirm(false); onDelete(order.id); }}
                disabled={isActing}
                className="flex-1 py-2 bg-red-500 text-white text-xs font-bold rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isActing}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 disabled:opacity-50 transition-colors flex-shrink-0"
                title="Delete order"
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={() => onPrint(order)}
                disabled={isActing}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-700 disabled:opacity-50 transition-colors flex-shrink-0"
                title="Print bill"
              >
                <Printer size={15} />
              </button>
              <button
                onClick={() => onLoad(order)}
                disabled={isActing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <span>→</span> Load
              </button>
            </>
          )}
        </div>
      </div>

      {showPayModal && (
        <PaymentModal
          order={order}
          onClose={() => setShowPayModal(false)}
          onConfirm={(method) => { setShowPayModal(false); onComplete(order.id, method); }}
        />
      )}
    </div>
  );
}

function EmptyState({ canSeeAll }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-3xl flex items-center justify-center mb-4">
        <Clock size={40} className="text-amber-300 dark:text-amber-600" />
      </div>
      <p className="font-bold text-gray-500 text-lg">
        {canSeeAll ? "No held orders" : "You have no held orders"}
      </p>
      <p className="text-sm text-gray-400 mt-1">
        {canSeeAll
          ? "No orders are currently on hold across any staff"
          : "Orders you place on hold will appear here"}
      </p>
    </div>
  );
}

export default function HeldOrdersPage() {
  const { user } = useAuth();
  const { settings } = useBusiness();
  const navigate = useNavigate();

  const canSeeAll =
    user?.role === "admin" ||
    user?.role === "manager" ||
    (user?.role === "cashier" && user?.permissions?.includes("view_all_orders"));

  const hasTableAndBarSupport = ["restaurant", "nightclub", "cafe", "bar"].includes(
    settings?.business_type
  );
  const [activeTab, setActiveTab] = useState("table");

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [terminals, setTerminals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedTerminal, setSelectedTerminal] = useState(
    () => localStorage.getItem("pos_terminal") || ""
  );
  const [selectedOutlet, setSelectedOutlet] = useState(
    () => localStorage.getItem("pos_outlet") || ""
  );

  const showToast = (msg, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await api.getHeldOrders();
      const filtered = canSeeAll
        ? data
        : data.filter((o) => o.created_by === user?.id);
      setOrders(filtered);
    } catch {
      showToast("Failed to load orders", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canSeeAll, user?.id]);

  useEffect(() => {
    fetchOrders();
    Promise.all([api.getTerminals(), api.getOutlets()])
      .then(([t, o]) => { setTerminals(t); setOutlets(o); })
      .catch(console.error);
    const interval = setInterval(() => fetchOrders(true), 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleDelete = async (orderId) => {
    setActingId(orderId);
    try {
      await api.voidOrder(orderId);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      showToast("Order removed");
    } catch (err) {
      showToast(err.message || "Failed to remove order", "error");
    } finally {
      setActingId(null);
    }
  };

  const handleComplete = async (orderId, paymentMethod) => {
    setActingId(orderId);
    try {
      await api.completeOrder(orderId, paymentMethod);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      showToast(`Order completed!`);
    } catch (err) {
      showToast(err.message || "Failed to complete order", "error");
    } finally {
      setActingId(null);
    }
  };

  const handleLoad = (order) => {
    navigate("/pos", { state: { loadOrder: order } });
  };

  const displayedOrders = hasTableAndBarSupport
    ? orders.filter((o) =>
        activeTab === "bartab"
          ? o.service_mode === "bar_tab" || !!o.bar_tab_id
          : o.service_mode !== "bar_tab" && !o.bar_tab_id
      )
    : orders;

  const pageTitle = canSeeAll ? "All Held Orders" : "My Held Orders";
  const subtitle = canSeeAll
    ? `${orders.length} order${orders.length !== 1 ? "s" : ""} on hold across all staff`
    : `${orders.length} order${orders.length !== 1 ? "s" : ""} held by you${user?.name ? ` · ${user.name}` : ""}`;

  return (
    <div className="flex h-screen bg-[#111827] overflow-hidden">
      <Sidebar
        onSettingsClick={() => setShowTerminalModal(true)}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
            >
              <Menu size={20} />
            </button>
            <div className="w-10 h-10 bg-amber-500 rounded-2xl flex items-center justify-center shadow-sm shadow-amber-200">
              <Clock size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-gray-900 dark:text-white text-lg tracking-tight">{pageTitle}</h1>
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hasTableAndBarSupport && (
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                {[["table", "Table"], ["bartab", "Bar Tab"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                      activeTab === id
                        ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => fetchOrders(true)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayedOrders.length === 0 ? (
            <EmptyState canSeeAll={canSeeAll} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayedOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  canSeeAll={canSeeAll}
                  onDelete={handleDelete}
                  onComplete={handleComplete}
                  onLoad={handleLoad}
                  onPrint={(o) => printOrderBill(o, settings)}
                  isActing={actingId === order.id}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold z-50 whitespace-nowrap",
            toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"
          )}
        >
          {toast.msg}
        </div>
      )}

      {showTerminalModal && (
        <TerminalSettingsModal
          terminals={terminals}
          outlets={outlets}
          selectedTerminal={selectedTerminal}
          selectedOutlet={selectedOutlet}
          onSave={(term, out) => {
            const name = terminals.find((t) => t.id === term)?.name || "";
            setSelectedTerminal(term);
            setSelectedOutlet(out);
            localStorage.setItem("pos_terminal", term);
            localStorage.setItem("pos_outlet", out);
            localStorage.setItem("pos_terminal_name", name);
            setShowTerminalModal(false);
          }}
          onClose={() => setShowTerminalModal(false)}
        />
      )}
    </div>
  );
}
