import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, Clock, Menu, Monitor, Printer, RefreshCw, Trash2, User,
  Receipt as ReceiptIcon, ChefHat, Wine,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import Sidebar from "../components/Sidebar";
import TerminalSettingsModal from "../components/TerminalSettingsModal";
import { api } from "../lib/api";
import { cn, formatCurrency, dedupePendingOrders, userHasPermission } from "../lib/utils";
import { printService, pickReprintPrinter } from "../utils/printService";
import { offlineQueue } from "../utils/offlineQueue";

const DEFAULT_METHODS = [
  { name: "cash", label: "Cash" },
  { name: "card", label: "Card" },
  { name: "mobile", label: "Mobile Pay" },
  { name: "credit", label: "Credit (Pay Later)" },
];

function PaymentModal({ order, onClose, onConfirm }) {
  const [method, setMethod] = useState(DEFAULT_METHODS[0].name);
  const [amountPaid, setAmountPaid] = useState(order.total.toFixed(2));
  const [customerName, setCustomerName] = useState(order.customer_name || "");

  const isCredit = method === "credit";
  const paid = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paid - order.total);
  const canConfirm = !isCredit || customerName.trim();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md overflow-hidden max-h-[95vh] overflow-y-auto">
        <div className={`p-5 text-white text-center ${isCredit ? "bg-amber-500" : "bg-emerald-500"}`}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/75 mb-1">Total Amount</p>
          <p className="text-4xl font-black tabular-nums">{formatCurrency(order.total)}</p>
        </div>
        <div className="p-5 space-y-3">
          {/* Payment method + customer name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
                Payment Method
              </label>
              <div className="relative">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400 appearance-none font-semibold"
                >
                  {DEFAULT_METHODS.map((m) => <option key={m.name} value={m.name}>{m.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
                Customer {isCredit ? <span className="text-red-400">*</span> : "(Optional)"}
              </label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={isCredit ? "Required for credit" : "Customer name"}
                className={`w-full px-3 py-2.5 border-2 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 focus:outline-none transition-colors ${isCredit && !customerName.trim() ? "border-red-300 dark:border-red-600 focus:border-red-400" : "border-gray-200 dark:border-gray-600 focus:border-emerald-400"}`}
              />
            </div>
          </div>

          {/* Credit info */}
          {isCredit && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Credit Sale — Payment Deferred</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">This order will appear as an open invoice in Accounts.</p>
            </div>
          )}

          {/* Amount paid */}
          {!isCredit && (
            <div>
              <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
                Amount Paid
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400 font-bold text-xl"
              />
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setAmountPaid(order.total.toFixed(2))} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">Exact</button>
                {[10, 20, 50, 100].map((amt) => (
                  <button key={amt} onClick={() => setAmountPaid(amt.toFixed(2))} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">{amt}</button>
                ))}
              </div>
            </div>
          )}

          {/* Change */}
          {!isCredit && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-700/50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Change</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(change)}</span>
            </div>
          )}

          <button
            onClick={() => canConfirm && onConfirm(method, customerName)}
            disabled={!canConfirm}
            className={`w-full py-4 text-white rounded-2xl font-black text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${isCredit ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700" : "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700"}`}
          >
            <CheckCircle2 size={18} />
            {isCredit ? "Record Credit Sale" : "Confirm Payment"}
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

function printOrderBill(order, settings, showToast) {
  // Reprints always route through the designated reprint printer.
  let usbPrinter = pickReprintPrinter();
  if (!usbPrinter) {
    try {
      const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
      usbPrinter = saved.find((x) => x.mode === "usb" && x.type === "receipt") || null;
    } catch (_) {}
  }
  printService.printReceipt({
    businessName: settings?.business_name || "Restaurant",
    address: settings?.company_address || settings?.address || "",
    phone: settings?.company_phone || settings?.phone || "",
    logoUrl: settings?.company_logo || settings?.logo_url || "",
    tableName: order.table_number ? `Table ${order.table_number}` : "",
    orderNo: order.order_number || order.id?.slice(-8)?.toUpperCase() || "",
    waiter: order.waiter_name || order.served_by_name || "",
    cashier: order.cashier_name || "",
    items: (order.items || []).map((i) => ({
      name: i.product_name || i.name || "",
      quantity: i.quantity || i.qty || 0,
      price: i.price || (i.total / (i.quantity || i.qty || 1)),
    })),
    subtotal: order.subtotal || order.total || 0,
    taxAmount: order.tax || 0,
    discount: order.discount || 0,
    total: order.total || 0,
    docType: "BILL",
    layoutSettings: settings?.bill_settings || {},
  }, { printer: usbPrinter }).catch((e) => {
    if (showToast) showToast(e.message, "error");
    else alert(e.message);
  });
}

// Classify a cart item as "kitchen" (food) or "bar" (drinks) by walking
// product → category.main_category. Items the catalog has lost track of
// default to "kitchen".
function itemStation(item, productById, categoryById) {
  const catId = item.category_id || productById.get(item.product_id)?.category_id || "";
  const cat = categoryById.get(catId);
  return (cat?.main_category || "food").toLowerCase() === "drinks" ? "bar" : "kitchen";
}

// Reprint a kitchen or bar ticket for a held order. Filters the order's
// items to the requested station, picks a matching printer (by printer
// group, then by printer type), and sends through printService.
function printStationTicket(order, station, ctx, showToast) {
  const { products, categories, printerGroups, savedPrinters } = ctx;
  const productById  = new Map(products.map((p) => [p.id, p]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const items = (order.items || []).filter((it) => itemStation(it, productById, categoryById) === station);
  if (!items.length) {
    showToast?.(`No ${station === "bar" ? "drinks" : "food"} items on this order`, "error");
    return;
  }

  // Reprints route through the designated reprint printer regardless of
  // station (MP-POS80 4 by default). If that's not configured, fall back
  // to the same group/type heuristic the live Send-to-Kitchen path uses.
  const station_t = station; // "kitchen" | "bar"
  let target = pickReprintPrinter();
  if (!target) {
    const stationPrinters = savedPrinters.filter((x) => x.type !== "receipt");
    const matches = stationPrinters.filter((printer) =>
      (printer.printer_group_ids || []).some((gid) => {
        const group = printerGroups.find((g) => g.id === gid);
        if (!group) return false;
        return items.some((it) => {
          const catId = it.category_id || productById.get(it.product_id)?.category_id || "";
          return (
            (group.product_ids  || []).includes(it.product_id) ||
            (group.category_ids || []).includes(catId)
          );
        });
      })
    );
    target =
      matches.find((p) => p.type === station_t) ||
      matches[0] ||
      stationPrinters.find((p) => p.type === station_t) ||
      stationPrinters.find((p) => p.type === "kitchen") ||
      stationPrinters[0];
  }

  if (!target) {
    showToast?.("No station printer configured", "error");
    return;
  }
  const printerConfig = target.mode === "usb"
    ? { printer: target }
    : { ip: target.ip_address, port: target.port || 9100 };
  printService.printKitchenTicket({
    tableName: order.table_number ? `Table ${order.table_number}` : "",
    orderNo: order.order_number || order.id?.slice(-8)?.toUpperCase() || "",
    waiterName: order.waiter_name || order.served_by_name || order.created_by_name || "",
    items: items.map((i) => ({ name: i.product_name || i.name, quantity: i.quantity || i.qty, note: i.note })),
    station: target.name || (station_t === "bar" ? "BAR" : "KITCHEN"),
  }, printerConfig).catch((err) => showToast?.(`${target.name || station_t} print failed: ${err.message}`, "error"));
}

// Compact popover that turns the single Print button into a menu of
// three reprint actions — Receipt, Kitchen, Bar — without expanding the
// card footer.
function PrintMenu({ order, isActing, onReceipt, onKitchen, onBar, canStationReprint = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const pick = (fn) => { setOpen(false); fn?.(); };
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isActing}
        className="w-10 h-10 flex items-center justify-center rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-700 disabled:opacity-50 transition-colors"
        title="Reprint…"
      >
        <Printer size={15} />
      </button>
      {open && (
        <div className="absolute bottom-12 left-0 z-30 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1.5">
          <button
            onClick={() => pick(onReceipt)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ReceiptIcon size={14} className="text-indigo-500" />
            Print Receipt
          </button>
          {canStationReprint && (
            <>
              <button
                onClick={() => pick(onKitchen)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ChefHat size={14} className="text-orange-500" />
                Print Kitchen
              </button>
              <button
                onClick={() => pick(onBar)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Wine size={14} className="text-purple-500" />
                Print Bar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, floorName = "", canSeeAll, canDelete, onDelete, onComplete, onLoad, onPrint, onPrintKitchen, onPrintBar, canStationReprint = true, isActing }) {
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
          {floorName && (
            <span className="flex items-center bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2 py-0.5 rounded-lg">
              {floorName}
            </span>
          )}
          {order._offline_pending && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-amber-200/70 dark:bg-amber-700/40 text-amber-800 dark:text-amber-200">
              Pending sync
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{fmtDate(order.created_at)}</span>
      </div>

      <div className="px-4 py-3 flex-1 space-y-1.5">
        {order.created_by_name && (
          <div className="flex items-center gap-1.5 mb-2 py-1.5 px-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl">
            <User size={12} className="text-blue-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 truncate">{order.created_by_name}</span>
            {order.created_by_role && (
              <span className="text-[10px] text-blue-400 capitalize ml-0.5 flex-shrink-0">· {order.created_by_role}</span>
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
          {canDelete && showDeleteConfirm ? (
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
              {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isActing}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 disabled:opacity-50 transition-colors flex-shrink-0"
                title="Delete order"
              >
                <Trash2 size={15} />
              </button>
              )}
              <PrintMenu
                order={order}
                isActing={isActing}
                onReceipt={() => onPrint(order)}
                onKitchen={() => onPrintKitchen?.(order)}
                onBar={() => onPrintBar?.(order)}
                canStationReprint={canStationReprint}
              />
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
          onConfirm={(method, name) => { setShowPayModal(false); onComplete(order.id, method, name); }}
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
  const config = useBusinessConfig();
  const navigate = useNavigate();

  const canSeeAll        = userHasPermission(user, "view_all_orders");
  const canDelete        = userHasPermission(user, "delete_held_order_items");
  // Kitchen / Bar reprint is more privileged than a plain receipt reprint
  // because the line cooks treat a reprint as a new ticket.
  const canStationReprint = userHasPermission(user, "reprint_kitchen_ticket");

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

  // Cache for routing reprinted kitchen / bar tickets. Same data the
  // TablePOSPage Send-to-Kitchen path uses — products → category →
  // main_category, plus saved printers and printer groups.
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [printerGroups, setPrinterGroups] = useState([]);
  const [savedPrinters, setSavedPrinters] = useState([]);
  // Tables + floors are loaded so each card can show which floor the
  // table belongs to (e.g. Ground Floor / Patio). Looked up by table_id
  // on the order — no extra round trips per card.
  const [tables, setTables] = useState([]);
  const [floors, setFloors] = useState([]);

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
      // Server-known orders (cached by SW when offline) + offline-queued
      // holds that haven't synced yet. The user needs to see BOTH so a
      // held order they just created without internet still appears in
      // the list and can be loaded back into the POS.
      let data = [];
      try { data = await api.getHeldOrders(); } catch {}

      let queuedOffline = [];
      try {
        const q = await offlineQueue.getAll();
        queuedOffline = (q || [])
          .filter((it) => it && (it.type === "hold" || it.type === "send_kitchen"))
          .map((it) => {
            const p = it.payload || {};
            const items = p.items || [];
            return {
              id: it.id,
              order_number: `OFF-${(it.id || "").slice(-6).toUpperCase()}`,
              status: p.status || (it.type === "send_kitchen" ? "sent_to_kitchen" : "held"),
              items,
              subtotal: p.subtotal || 0,
              tax: p.tax || 0,
              discount: p.discount || 0,
              total: p.total || 0,
              table_id:     p.table_id || null,
              table_number: p.table_number || null,
              bar_tab_id:   p.bar_tab_id || null,
              customer_name: p.customer_name || null,
              created_by:      user?.id || null,
              created_by_name: user?.name || "",
              created_at: new Date(it.timestamp || Date.now()).toISOString(),
              _offline_pending: true,
            };
          });
      } catch {}

      const merged = [...queuedOffline, ...(data || [])];
      const filtered = canSeeAll
        ? merged
        : merged.filter((o) => o.created_by === user?.id);

      setOrders(dedupePendingOrders(filtered));
    } catch {
      showToast("Failed to load orders", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canSeeAll, user?.id, user?.name]);

  useEffect(() => {
    fetchOrders();
    Promise.all([
      api.getTerminals(),
      api.getOutlets(),
      api.getProducts(),
      api.getCategories(),
      api.getPrinterGroups?.().catch(() => []),
      api.getTables().catch(() => []),
      api.getFloors().catch(() => []),
    ])
      .then(([t, o, p, c, g, tbls, flrs]) => {
        setTerminals(t); setOutlets(o);
        setProducts(p || []); setCategories(c || []);
        setPrinterGroups(g || []);
        setTables(tbls || []);
        setFloors(flrs || []);
      })
      .catch(console.error);
    try {
      setSavedPrinters(JSON.parse(localStorage.getItem("pos_saved_printers") || "[]"));
    } catch {}
    try {
      const g = JSON.parse(localStorage.getItem("pos_printer_groups") || "[]");
      if (g.length) setPrinterGroups(g);
    } catch {}
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

  const handleComplete = async (orderId, paymentMethod, customerName) => {
    setActingId(orderId);
    try {
      if (customerName?.trim()) {
        await api.updateOrder(orderId, { customer_name: customerName.trim() });
      }
      await api.completeOrder(orderId, paymentMethod);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      showToast(paymentMethod === "credit" ? "Credit sale recorded!" : "Order completed!");
    } catch (err) {
      showToast(err.message || "Failed to complete order", "error");
    } finally {
      setActingId(null);
    }
  };

  const handleLoad = (order) => {
    if (order.table_id) {
      navigate(`/table/${order.table_id}`);
    } else if (order.bar_tab_id) {
      navigate(`/bar-tab/${order.bar_tab_id}`);
    } else {
      navigate("/pos", { state: { loadOrder: order } });
    }
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
        <div className={`h-1 bg-gradient-to-r ${config.headerBg} flex-shrink-0`} />
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
              {(() => {
                // Build a table_id → floor_name lookup once per render
                // (cheaper than recomputing inside each card).
                const floorNameById = new Map(floors.map((f) => [f.id, f.name]));
                const tableFloorById = new Map(tables.map((t) => [t.id, floorNameById.get(t.floor_id) || ""]));
                return displayedOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  floorName={order.table_id ? tableFloorById.get(order.table_id) || "" : ""}
                  canSeeAll={canSeeAll}
                  canDelete={canDelete}
                  onDelete={handleDelete}
                  onComplete={handleComplete}
                  onLoad={handleLoad}
                  onPrint={(o) => printOrderBill(o, settings, showToast)}
                  onPrintKitchen={(o) => printStationTicket(o, "kitchen",
                    { products, categories, printerGroups, savedPrinters }, showToast)}
                  onPrintBar={(o) => printStationTicket(o, "bar",
                    { products, categories, printerGroups, savedPrinters }, showToast)}
                  canStationReprint={canStationReprint}
                  isActing={actingId === order.id}
                />
                ));
              })()}
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
