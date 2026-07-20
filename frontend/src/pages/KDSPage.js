import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChefHat, Wine, Clock, Menu, RefreshCw, ArrowRight, Undo2, CheckCircle2, Users, AlertTriangle,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { cn, itemStation, userHasPermission } from "../lib/utils";

const POLL_MS = 5000;
// How long an order can sit in "Processing" before the card flags red.
const PROCESSING_ALERT_MINUTES = 20;

// How long an order has been sitting in the kitchen — used to color-code
// cards so anything getting old stands out at a glance.
function orderAge(createdAt) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (mins >= 15) return { mins, color: "text-red-600 dark:text-red-400", dot: "bg-red-500" };
  if (mins >= 7)  return { mins, color: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" };
  return { mins, color: "text-gray-400 dark:text-gray-500", dot: "bg-emerald-500" };
}

function minutesSince(ts) {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  return Number.isFinite(mins) ? Math.max(0, mins) : null;
}

const COLUMNS = [
  { id: "new",       label: "New Order",  headerBg: "bg-blue-50 dark:bg-blue-900/20",   headerText: "text-blue-700 dark:text-blue-400" },
  { id: "preparing", label: "Processing", headerBg: "bg-amber-50 dark:bg-amber-900/20", headerText: "text-amber-700 dark:text-amber-400" },
  { id: "ready",     label: "Completed",  headerBg: "bg-emerald-50 dark:bg-emerald-900/20", headerText: "text-emerald-700 dark:text-emerald-400" },
];

function OrderCard({ order, items, column, onAdvance, onRevert, isActing }) {
  const age = orderAge(order.created_at);
  const label = order.table_number ? `Table ${order.table_number}` : (order.customer_name || order.order_number);

  // Processing timer: how long this order has sat in "preparing", timed
  // from when it entered that column (falls back to created_at for orders
  // that moved to preparing before kitchen_status_at existed).
  const procMins = column === "preparing" ? minutesSince(order.kitchen_status_at || order.created_at) : null;
  const overdue = procMins !== null && procMins >= PROCESSING_ALERT_MINUTES;

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-2xl border overflow-hidden flex flex-col transition-colors",
      overdue
        ? "border-red-500 dark:border-red-500 shadow-lg shadow-red-500/20"
        : "border-gray-200 dark:border-gray-700 shadow-sm"
    )}>
      <div className={cn(
        "flex items-center justify-between px-4 py-2.5 border-b",
        overdue
          ? "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800"
          : "bg-gray-50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-700"
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", overdue ? "bg-red-500 animate-pulse" : age.dot)} />
          <span className="font-bold text-gray-900 dark:text-white text-sm truncate">{label}</span>
        </div>
        {procMins !== null ? (
          <span className={cn(
            "flex items-center gap-1 text-xs font-bold flex-shrink-0",
            overdue ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
          )}>
            {overdue ? <AlertTriangle size={11} className="animate-pulse" /> : <Clock size={11} />}
            {overdue ? `OVERDUE · ${procMins}m` : `${procMins}m`}
          </span>
        ) : (
          <span className={cn("flex items-center gap-1 text-xs font-bold flex-shrink-0", age.color)}>
            <Clock size={11} />
            {age.mins}m
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex-1 space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between gap-2 text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {item.quantity}x {item.product_name || item.name}
            </span>
          </div>
        ))}
        {items.some((i) => i.note) && (
          <div className="pt-1 space-y-0.5">
            {items.filter((i) => i.note).map((i, idx) => (
              <p key={idx} className="text-xs text-amber-600 dark:text-amber-400 italic">* {i.note}</p>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 pb-3 flex items-center gap-2">
        {column !== "new" && (
          <button
            onClick={onRevert}
            disabled={isActing}
            title="Move back"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <Undo2 size={15} />
          </button>
        )}
        {column !== "ready" && (
          <button
            onClick={onAdvance}
            disabled={isActing}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors",
              column === "new" ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"
            )}
          >
            {column === "new" ? <>Start <ArrowRight size={14} /></> : <>Mark Ready <CheckCircle2 size={14} /></>}
          </button>
        )}
        {column === "ready" && (
          <div className="flex-1 flex items-center justify-center gap-2 py-2.5 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
            <CheckCircle2 size={14} /> Ready
          </div>
        )}
      </div>
    </div>
  );
}

export default function KDSPage() {
  const { user } = useAuth();
  // A Bar KDS user shouldn't see food tickets and vice versa — each holds
  // only the sub-permission for their own station (admin/manager hold both
  // via the role bypass in userHasPermission).
  const canKitchen = userHasPermission(user, "view_kds_kitchen");
  const canBar = userHasPermission(user, "view_kds_bar");
  const [station, setStation] = useState(canKitchen ? "kitchen" : "bar"); // "kitchen" | "bar"
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Orders we've just moved locally but the server hasn't echoed back yet.
  // A poll's GET can be in flight when the user clicks a move button —
  // if that request started before the PUT landed, it resolves with the
  // pre-move status and would otherwise snap the card back for one tick
  // before the next poll corrects it. Keep showing our own value for an
  // order until a poll actually confirms it, instead of trusting every
  // poll response blindly.
  const pendingRef = useRef({});

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const data = await api.getKitchenOrders();
      const pending = pendingRef.current;
      const seenIds = new Set();
      const merged = (data || []).map((o) => {
        seenIds.add(o.id);
        const wanted = pending[o.id];
        if (wanted === undefined) return o;
        if (wanted.status === o.kitchen_status) {
          delete pending[o.id]; // server caught up — stop overriding
          return o;
        }
        // Override both fields together — overriding just kitchen_status
        // while leaving the server's (still-stale) kitchen_status_at in
        // place would make the Processing timer flash back to its old
        // elapsed time for this one poll tick.
        return { ...o, kitchen_status: wanted.status, kitchen_status_at: wanted.at };
      });
      // Drop overrides for orders that left the board entirely (paid,
      // voided, etc.) so pendingRef doesn't grow unbounded.
      for (const id of Object.keys(pending)) {
        if (!seenIds.has(id)) delete pending[id];
      }
      setOrders(merged);
    } catch {
      // Silent — a KDS screen shouldn't spam errors on a flaky poll; the
      // board just keeps showing the last-known state until the next tick.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    api.getProducts().then((p) => setProducts(p || [])).catch(() => {});
    api.getCategories().then((c) => setCategories(c || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders(true), POLL_MS);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const moveCard = async (order, kitchenStatus) => {
    setActingId(order.id);
    // Optimistic update — keeps the board responsive on a slow connection
    // instead of waiting for the next poll to reflect the move. Recorded
    // in pendingRef so an in-flight poll response can't undo it early.
    // kitchen_status_at is stamped locally too (matching what the backend
    // will set) — otherwise the Processing timer keeps reading the OLD
    // timestamp from when the order entered "New" until the next poll
    // catches up, so a freshly-started card shows a stale elapsed time
    // instead of starting at 0.
    const movedAt = new Date().toISOString();
    pendingRef.current[order.id] = { status: kitchenStatus, at: movedAt };
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, kitchen_status: kitchenStatus, kitchen_status_at: movedAt } : o));
    try {
      await api.updateOrder(order.id, { kitchen_status: kitchenStatus });
    } catch {
      delete pendingRef.current[order.id];
      fetchOrders(true);
    } finally {
      setActingId(null);
    }
  };

  // Bucket orders per column, keeping only the items relevant to the active
  // station tab — mirrors how physical kitchen/bar tickets already split.
  const columns = COLUMNS.map((col) => ({
    ...col,
    cards: orders
      .map((order) => {
        const items = (order.items || []).filter(
          (it) => itemStation(it, productById, categoryById) === station
        );
        return { order, items };
      })
      .filter(({ order, items }) => {
        if (!items.length) return false;
        const ks = order.kitchen_status || "new";
        return ks === col.id;
      }),
  }));
  const stationOrderCount = columns.reduce((s, c) => s + c.cards.length, 0);

  return (
    <div className="flex h-screen bg-[#111827] overflow-hidden">
      <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
            >
              <Menu size={20} />
            </button>
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm", station === "bar" ? "bg-purple-500" : "bg-orange-500")}>
              {station === "bar" ? <Wine size={20} className="text-white" /> : <ChefHat size={20} className="text-white" />}
            </div>
            <div>
              <h1 className="font-black text-gray-900 dark:text-white text-lg tracking-tight">
                {canKitchen && canBar ? "Kitchen Display" : station === "bar" ? "Bar Display" : "Kitchen Display"}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {stationOrderCount} order{stationOrderCount !== 1 ? "s" : ""} in {station === "bar" ? "the bar" : "the kitchen"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canKitchen && canBar && (
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                {[["kitchen", "Kitchen", ChefHat], ["bar", "Bar", Wine]].map(([id, lbl, Icon]) => (
                  <button
                    key={id}
                    onClick={() => setStation(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                      station === id
                        ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                  >
                    <Icon size={14} /> {lbl}
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

        <main className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
              {columns.map((col) => (
                <div key={col.id} className="flex flex-col min-h-0">
                  <div className={cn("flex items-center justify-between rounded-xl px-4 py-2.5 mb-3 flex-shrink-0", col.headerBg)}>
                    <span className={cn("font-black text-sm", col.headerText)}>{col.label}</span>
                    <span className={cn("text-xs font-black px-2 py-0.5 rounded-full bg-white/60 dark:bg-black/20", col.headerText)}>
                      {col.cards.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {col.cards.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center opacity-50">
                        <Users size={28} className="text-gray-300 dark:text-gray-600 mb-2" />
                        <p className="text-xs text-gray-400 dark:text-gray-500">Nothing here</p>
                      </div>
                    ) : (
                      col.cards.map(({ order, items }) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          items={items}
                          column={col.id}
                          isActing={actingId === order.id}
                          onAdvance={() => moveCard(order, col.id === "new" ? "preparing" : "ready")}
                          onRevert={() => moveCard(order, col.id === "ready" ? "preparing" : "new")}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
