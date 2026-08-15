import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck,
  Edit3, RefreshCw, Search, X, Trash2, Plus, Barcode,
  TrendingDown, LayoutGrid, DollarSign, PackageX, Calendar,
  ShoppingBag, Lock, Upload, Store,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency, userHasPermission } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import ExportBtn from "../components/ExportBtn";
import { downloadCSV, printReport } from "../lib/export";

function AccessDenied({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
        <Lock size={24} className="text-gray-400" />
      </div>
      <p className="text-lg font-bold text-gray-700 dark:text-gray-200">Access Restricted</p>
      <p className="text-gray-400 text-sm mt-1">You don't have permission to view <span className="font-semibold">{label}</span>.</p>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function useBaseData() {
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProducts(), api.getOutlets()])
      .then(([p, o]) => {
        setProducts(p.filter((pr) => pr.active !== false));
        setOutlets(o);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { products, outlets, loading };
}

function Toast({ msg, type, onClose }) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-4 rounded-xl mb-4 border",
      type === "success" ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
        : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
    )}>
      {type === "success"
        ? <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
        : <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />}
      <p className={cn("text-sm font-medium flex-1", type === "success" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300")}>{msg}</p>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={16} /></button>
    </div>
  );
}

function Spinner({ color = "blue" }) {
  return (
    <div className="flex justify-center py-20">
      <div className={`w-8 h-8 border-4 border-${color}-600 border-t-transparent rounded-full animate-spin`} />
    </div>
  );
}

// ─── Stock Levels ──────────────────────────────────────────────────────────────
const STOCK_PAGE_SIZE = 25;

const STORE_LABELS = { main: "Main Store", kitchen: "Kitchen Store", bar: "Bar Store" };
const STORE_COLORS = {
  main:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  kitchen: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  bar:     "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

// color name → tailwind badge classes (for dynamic stores)
const COLOR_BADGE_MAP = {
  blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  red:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  teal:   "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  pink:   "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  gray:   "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};
const colorBadge = (color) => COLOR_BADGE_MAP[color] || COLOR_BADGE_MAP.indigo;

const COLOR_OPTIONS = [
  { value: "blue",   label: "Blue"   },
  { value: "orange", label: "Orange" },
  { value: "purple", label: "Purple" },
  { value: "green",  label: "Green"  },
  { value: "red",    label: "Red"    },
  { value: "teal",   label: "Teal"   },
  { value: "pink",   label: "Pink"   },
  { value: "indigo", label: "Indigo" },
];

function StockLevelsView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updateModal, setUpdateModal] = useState(null);
  const [form, setForm] = useState({ ingredient_id: "", outlet_id: "", store: "main", quantity: "", min_quantity: "10", batch_number: "", expiry_date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [transferItem, setTransferItem] = useState(null);
  const canTransfer = userHasPermission(user, "transfer_stock");
  // Ingredients catalog for the Add Stock picker. Refreshed on every
  // open so a newly-created ingredient from a previous Add Stock
  // session appears in the picker immediately.
  const [ingredientsForAdd, setIngredientsForAdd] = useState([]);
  useEffect(() => {
    if (showAddStock || showReceive) {
      api.getIngredients().then(setIngredientsForAdd).catch(() => {});
    }
  }, [showAddStock, showReceive]);

  // bust=true appends a one-shot cache-busting param to /api/stock so the
  // service worker can't serve a stale list right after an update.
  const load = (bust = false) => {
    setLoading(true);
    Promise.all([api.getStock(undefined, undefined, bust), api.getProducts(), api.getOutlets()])
      .then(([s, p, o]) => { setStock(s); setProducts(p); setOutlets(o); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const productName = (id) => {
    // Legacy: id is a product_id string
    const prod = products.find((p) => p.id === id);
    if (prod) return prod.name;
    // New: stock items now carry ingredient_name from the API
    const stockItem = stock?.find?.((s) => s.ingredient_id === id || s.product_id === id);
    if (stockItem?.ingredient_name) return stockItem.ingredient_name;
    return id;
  };
  const isLow = (item) => parseInt(item.quantity) <= parseInt(item.min_quantity || 10);
  const isExpiring = (item) => {
    if (!item.expiry_date) return false;
    const days = (new Date(item.expiry_date) - new Date()) / 86400000;
    return days <= 30;
  };
  const isExpired = (item) => item.expiry_date && new Date(item.expiry_date) < new Date();

  const storeFiltered = storeFilter === "all" ? stock : stock.filter((s) => (s.store || "main") === storeFilter);
  const tabFiltered = tab === "low" ? storeFiltered.filter(isLow)
    : tab === "expiring" ? storeFiltered.filter((s) => isExpiring(s) || isExpired(s))
    : storeFiltered;
  const q = search.trim().toLowerCase();
  const displayed = !q ? tabFiltered : tabFiltered.filter((s) => {
    const name = (s.ingredient_name || s.product_name || productName(s.product_id) || "").toLowerCase();
    const batch = (s.batch_number || "").toLowerCase();
    return name.includes(q) || batch.includes(q);
  });
  const totalStockPages = Math.max(1, Math.ceil(displayed.length / STOCK_PAGE_SIZE));
  const pagedStock = displayed.slice((page - 1) * STOCK_PAGE_SIZE, page * STOCK_PAGE_SIZE);

  const openUpdate = (item) => {
    setForm({
      // Keep the subject in its proper slot — backend rejects an
      // ingredient_id payload when the stock row is for a product (and
      // vice-versa) because the validation lookup misses, returning a
      // confusing 404 'Ingredient not found' even for admins.
      ingredient_id: item.ingredient_id || null,
      product_id:    item.product_id    || null,
      outlet_id: item.outlet_id, store: item.store || "main",
      quantity: item.quantity, min_quantity: item.min_quantity || 10,
      batch_number: item.batch_number || "", expiry_date: item.expiry_date || "",
      // Pre-fill home_store from the ingredient's current tag, falling
      // back to the stock row's store so legacy untagged items show a
      // sensible default in the dropdown.
      home_store: item.home_store || item.store || "main",
    });
    setError("");
    setUpdateModal(item);
  };

  const handleUpdate = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const payload = {
        outlet_id: form.outlet_id, store: form.store || "main",
        quantity: parseFloat(form.quantity), min_quantity: parseFloat(form.min_quantity),
        batch_number: form.batch_number || null,
        expiry_date: form.expiry_date || null,
      };
      if (form.ingredient_id) payload.ingredient_id = form.ingredient_id;
      else if (form.product_id) payload.product_id = form.product_id;
      await api.updateStock(payload);

      // Persist home_store change on the ingredient when the user
      // re-homed it from the dropdown. Best-effort — the stock update
      // above already succeeded, so a failed rename shouldn't bubble.
      if (form.ingredient_id && form.home_store && form.home_store !== (updateModal?.home_store || "main")) {
        try { await api.updateIngredient(form.ingredient_id, { home_store: form.home_store }); } catch (_) {}
      }

      // Optimistic patch — show the new value the instant the modal closes,
      // before the background refresh comes back. Match on subject + store
      // + outlet so a multi-outlet kitchen/bar row in a different outlet
      // isn't accidentally rewritten.
      const subjectName = updateModal?.ingredient_name || updateModal?.product_name || productName(form.ingredient_id || form.product_id);
      setStock((prev) => prev.map((s) => {
        const sameSubject = (form.ingredient_id && s.ingredient_id === form.ingredient_id)
                         || (form.product_id    && s.product_id    === form.product_id);
        const sameStore   = (s.store || "main") === (form.store || "main");
        const sameOutlet  = (s.outlet_id || "") === (form.outlet_id || "");
        if (!sameSubject || !sameStore || !sameOutlet) return s;
        return {
          ...s,
          quantity:     parseFloat(form.quantity),
          min_quantity: parseFloat(form.min_quantity),
          batch_number: form.batch_number || null,
          expiry_date:  form.expiry_date  || null,
        };
      }));

      setUpdateModal(null);
      setToast({ msg: `${subjectName} updated to ${parseFloat(form.quantity)}.`, type: "success" });
      load(true); // bust the SW cache so the canonical refresh can't replay the stale list
    } catch (err) {
      setError(err.message);
      setToast({ msg: err.message, type: "error" });
    }
    finally { setSaving(false); }
  };

  const lowCount = stock.filter(isLow).length;
  const expiringCount = stock.filter((s) => isExpiring(s) || isExpired(s)).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Stock Levels</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {stock.length} entries · <span className="text-orange-500 font-semibold">{lowCount} low</span>
            {expiringCount > 0 && <> · <span className="text-red-500 font-semibold">{expiringCount} expiring</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ExportBtn
            onCSV={() => downloadCSV("stock_levels",
              ["Ingredient", "Store", "Qty", "Unit", "Min", "Batch", "Expiry", "Status"],
              stock.map((item) => [item.ingredient_name || productName(item.product_id), STORE_LABELS[item.store || "main"] || item.store || "Main Store", item.quantity, item.unit || "", item.min_quantity || 10, item.batch_number || "", item.expiry_date || "", isExpired(item) ? "Expired" : isExpiring(item) ? "Expiring" : isLow(item) ? "Low" : "OK"]))}
            onPrint={() => printReport({
              title: "Stock Levels",
              summaryRows: [["Total Entries", String(stock.length)], ["Low Stock", String(lowCount)], ["Expiring", String(expiringCount)]],
              headers: ["Ingredient", "Store", "Qty", "Unit", "Min", "Batch", "Expiry", "Status"],
              rows: stock.map((item) => [item.ingredient_name || productName(item.product_id), STORE_LABELS[item.store || "main"] || item.store || "Main Store", item.quantity, item.unit || "—", item.min_quantity || 10, item.batch_number || "—", item.expiry_date || "—", isExpired(item) ? "Expired" : isExpiring(item) ? "Expiring" : isLow(item) ? "Low" : "OK"]),
            })}
          />
          {(userHasPermission(user, "receive_stock") || userHasPermission(user, "add_stock")) && (
            <button onClick={() => setShowReceive(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
              <Plus size={16} /> <span className="hidden sm:inline">Receive Stock</span>
            </button>
          )}
          {userHasPermission(user, "add_stock") && (
            <button onClick={() => setShowAddStock(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors">
              <Plus size={16} /> <span className="hidden sm:inline">Add Stock</span>
            </button>
          )}
          {userHasPermission(user, "add_stock") && (
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
              <Upload size={15} /> <span className="hidden sm:inline">Import CSV</span>
            </button>
          )}
          <button onClick={() => load(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {showReceive && (
        <ReceiveStockModal
          mode="ingredient"
          catalog={ingredientsForAdd}
          outlets={outlets}
          initialOutletId={outlets[0]?.id || ""}
          onClose={() => setShowReceive(false)}
          onReceived={(msg) => {
            setShowReceive(false);
            load(true);
            setToast({ msg, type: "success" });
          }}
        />
      )}

      {showImport && (
        <ImportCsvModal
          outletId={outlets[0]?.id || ""}
          mode="ingredient"
          defaultStore={storeFilter === "all" ? "kitchen" : storeFilter}
          onClose={() => setShowImport(false)}
          onImported={() => load(true)}
        />
      )}

      {showAddStock && (
        <AddStockModal
          mode="ingredient"
          catalog={ingredientsForAdd}
          outlets={outlets}
          initialOutletId={outlets[0]?.id || ""}
          existingStock={stock}
          targetStore={storeFilter === "all" ? "kitchen" : storeFilter}
          onClose={() => setShowAddStock(false)}
          onAdded={(msg) => {
            setShowAddStock(false);
            setToast({ msg, type: "success" });
            load(true);
          }}
        />
      )}

      {lowCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl mb-3">
          <AlertTriangle size={18} className="text-orange-500 flex-shrink-0" />
          <p className="text-orange-700 dark:text-orange-300 text-sm font-medium">{lowCount} item{lowCount > 1 ? "s are" : " is"} running low on stock.</p>
        </div>
      )}
      {expiringCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-3">
          <Calendar size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-red-700 dark:text-red-300 text-sm font-medium">{expiringCount} item{expiringCount > 1 ? "s are" : " is"} expiring within 30 days.</p>
        </div>
      )}

      <div className="relative mb-3 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search ingredient, product or batch…"
          className="w-full pl-10 pr-9 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-colors"
        />
        {search && (
          <button
            onClick={() => { setSearch(""); setPage(1); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
        {q && (
          <p className="absolute -bottom-5 left-1 text-[11px] text-gray-400">
            {displayed.length} match{displayed.length === 1 ? "" : "es"}
          </p>
        )}
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {[["all", "All Stores"], ["main", "Main Store"], ["kitchen", "Kitchen Store"], ["bar", "Bar Store"]].map(([v, l]) => (
          <button key={v} onClick={() => { setStoreFilter(v); setPage(1); }}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              storeFilter === v ? "bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700")}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          ["all", "All Stock"],
          ["low", `Low Stock (${lowCount})`],
          ["expiring", `Expiring (${expiringCount})`],
        ].map(([v, l]) => (
          <button key={v} onClick={() => { setTab(v); setPage(1); }}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              tab === v ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700")}>
            {l}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3">Ingredient</th>
                  <th className="text-left px-3 py-3">Store</th>
                  <th className="text-center px-3 py-3">Qty</th>
                  <th className="text-center px-3 py-3">Unit</th>
                  <th className="text-center px-3 py-3">Min</th>
                  <th className="text-left px-3 py-3">Batch</th>
                  <th className="text-left px-3 py-3">Expiry</th>
                  <th className="text-center px-3 py-3">Status</th>
                  <th className="text-center px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {pagedStock.map((item, i) => {
                  const low = isLow(item);
                  const expired = isExpired(item);
                  const expiring = !expired && isExpiring(item);
                  const storeKey = item.store || "main";
                  // Mismatch flag — the stock row sits in store X but the
                  // ingredient is tagged for store Y. Surfaces the items
                  // the user complained about ('bar items in main store')
                  // so they can spot and re-home them in one glance.
                  const homeKey = item.home_store || null;
                  const stray = homeKey && homeKey !== storeKey;
                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{item.ingredient_name || productName(item.product_id)}</span>
                          {stray && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 uppercase tracking-wide" title={`Tagged for ${STORE_LABELS[homeKey] || homeKey}`}>
                              Home: {STORE_LABELS[homeKey] || homeKey}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", STORE_COLORS[storeKey] || STORE_COLORS.main)}>
                          {STORE_LABELS[storeKey] || storeKey}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={cn("font-bold text-sm", low ? "text-orange-500" : "text-gray-900 dark:text-white")}>{item.quantity}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">{item.unit || "—"}</td>
                      <td className="px-3 py-3 text-center text-gray-500 dark:text-gray-400 text-sm">{item.min_quantity || 10}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">{item.batch_number || "—"}</td>
                      <td className="px-3 py-3 text-xs">
                        {item.expiry_date
                          ? <span className={cn(expired ? "text-red-600 font-semibold" : expiring ? "text-orange-500 font-semibold" : "text-gray-500 dark:text-gray-400")}>{item.expiry_date}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {expired ? <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Expired</span>
                          : expiring ? <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Expiring</span>
                          : low ? <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Low</span>
                          : <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">OK</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openUpdate(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
                            title="Update quantity, min, batch, expiry"
                          >
                            <Edit3 size={12} /> Update
                          </button>
                          {canTransfer && item.ingredient_id && (
                            <button
                              onClick={() => setTransferItem(item)}
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                              title={`Transfer to another store`}
                            >
                              Transfer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {displayed.length === 0 && <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-400 text-sm">No stock records</td></tr>}
              </tbody>
            </table>
            {totalStockPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(page - 1) * STOCK_PAGE_SIZE + 1}–{Math.min(page * STOCK_PAGE_SIZE, displayed.length)} of {displayed.length} entries
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">Prev</button>
                  {Array.from({ length: totalStockPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalStockPages || Math.abs(p - page) <= 1)
                    .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…"); acc.push(p); return acc; }, [])
                    .map((p, i) => p === "…"
                      ? <span key={`e${i}`} className="px-2 text-gray-400 text-xs">…</span>
                      : <button key={p} onClick={() => setPage(p)} className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors", p === page ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>{p}</button>
                    )}
                  <button onClick={() => setPage((p) => Math.min(totalStockPages, p + 1))} disabled={page === totalStockPages}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {transferItem && (
        <TransferStockModal
          item={transferItem}
          fromStore={transferItem.store || "main"}
          onClose={() => setTransferItem(null)}
          onTransferred={(msg) => {
            setTransferItem(null);
            load(true);
            setToast({ msg, type: "success" });
          }}
        />
      )}

      {updateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <h3 className="font-bold text-gray-900 dark:text-white">Update Stock</h3>
              <button onClick={() => setUpdateModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-gray-900 dark:text-white">{updateModal?.ingredient_name || productName(form.ingredient_id)}{updateModal?.unit ? ` (${updateModal.unit})` : ""}</p>
                  <span className={cn("mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold", STORE_COLORS[form.store || "main"] || STORE_COLORS.main)}>
                    {STORE_LABELS[form.store || "main"]}
                  </span>
                </div>
                {form.ingredient_id && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      Home Store <span className="text-gray-400 font-normal">— which store this ingredient belongs to</span>
                    </label>
                    <select value={form.home_store || "main"} onChange={(e) => setForm({ ...form, home_store: e.target.value })}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
                      <option value="main">Main Store</option>
                      <option value="kitchen">Kitchen Store</option>
                      <option value="bar">Bar Store</option>
                    </select>
                    <p className="mt-1 text-[10px] text-gray-400">
                      Re-homing keeps this ingredient out of the other stores' Add Stock picker.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      New Quantity {updateModal?.unit ? <span className="text-gray-400 font-normal">({updateModal.unit})</span> : null}
                    </label>
                    <div className="relative">
                      <input required type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        className="w-full px-3 py-2.5 pr-12 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                      {updateModal?.unit && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400 dark:text-gray-500 pointer-events-none">
                          {updateModal.unit}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      Min Quantity {updateModal?.unit ? <span className="text-gray-400 font-normal">({updateModal.unit})</span> : null}
                    </label>
                    <input required type="number" min="0" step="0.01" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Batch Number</label>
                  <input type="text" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                    placeholder="e.g. BATCH-2025-001"
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Expiry Date</label>
                  <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
                {error && <p className="text-red-500 text-xs">{error}</p>}
                <button type="submit" disabled={saving}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? "Updating…" : "Update Stock"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stock Count (with barcode scan) ──────────────────────────────────────────
const COUNT_PAGE_SIZE = 25;

function StockCountView() {
  const { outlets, loading } = useBaseData();
  const [stores, setStores] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [stock, setStock] = useState([]);
  const [storeId, setStoreId] = useState("main");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({});  // keyed by ingredient_id
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [scanMode, setScanMode] = useState(false);
  const [scanBuffer, setScanBuffer] = useState("");
  const [lastScanned, setLastScanned] = useState(null);
  const [page, setPage] = useState(1);
  const scanRef = useRef(null);
  const scanTimeout = useRef(null);

  const outletId = outlets[0]?.id || "";

  useEffect(() => {
    api.getStores().then(setStores).catch(console.error);
    api.getIngredients().then(setIngredients).catch(console.error);
  }, []);

  useEffect(() => {
    if (!outletId) return;
    api.getStock(outletId, storeId).then(setStock).catch(console.error);
    setCounts({});
    setPage(1);
  }, [outletId, storeId]);

  useEffect(() => {
    if (scanMode && scanRef.current) scanRef.current.focus();
  }, [scanMode]);

  // Barcode scanner sends characters very fast then Enter — matches ingredient by name (case-insensitive)
  const handleScanKey = (e) => {
    if (e.key === "Enter") {
      const code = scanBuffer.trim();
      setScanBuffer("");
      if (!code) return;
      const ing = ingredients.find((p) => (p.name || "").toLowerCase() === code.toLowerCase());
      if (ing) {
        setLastScanned(ing.name);
        setCounts((prev) => ({ ...prev, [ing.id]: String((parseInt(prev[ing.id] || 0) || 0) + 1) }));
        setTimeout(() => setLastScanned(null), 2000);
      } else {
        setLastScanned(`Not found: ${code}`);
        setTimeout(() => setLastScanned(null), 2000);
      }
    } else {
      clearTimeout(scanTimeout.current);
      setScanBuffer((b) => b + e.key);
      scanTimeout.current = setTimeout(() => setScanBuffer(""), 200);
    }
  };

  const systemQty = (iid) => stock.find((s) => s.ingredient_id === iid)?.quantity ?? "—";
  const minQtyFor = (iid) => stock.find((s) => s.ingredient_id === iid)?.min_quantity ?? 10;
  const variance = (iid) => {
    const c = counts[iid];
    if (c === "" || c == null) return null;
    const sys = systemQty(iid);
    if (sys === "—") return null;
    return parseFloat(c) - parseFloat(sys);
  };

  // Same logic as Update Stock — only Main Store sees the full ingredient
  // catalog (it's the receiving dock). Kitchen/Bar only counts what's
  // actually been stocked there.
  const stockIdsForCount = new Set(stock.map((s) => s.ingredient_id).filter(Boolean));
  const ingredientsForCount = storeId === "main"
    ? ingredients
    : ingredients.filter((p) => stockIdsForCount.has(p.id));
  const filtered = ingredientsForCount.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const filledCount = Object.values(counts).filter((v) => v !== "" && v != null).length;
  const totalCountPages = Math.max(1, Math.ceil(filtered.length / COUNT_PAGE_SIZE));
  const pagedCount = filtered.slice((page - 1) * COUNT_PAGE_SIZE, page * COUNT_PAGE_SIZE);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        ingredients
          .filter((p) => counts[p.id] !== "" && counts[p.id] != null)
          .map((p) => api.updateStock({
            ingredient_id: p.id, outlet_id: outletId, store: storeId,
            quantity: parseFloat(counts[p.id]), min_quantity: minQtyFor(p.id),
          }))
      );
      const refreshed = await api.getStock(outletId, storeId);
      setStock(refreshed);
      setCounts({});
      setToast({ msg: "Stock count saved — quantities updated.", type: "success" });
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner color="indigo" />;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ClipboardCheck size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Stock Count</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 hidden sm:block">Enter physical counts to reconcile with system quantities</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ExportBtn
            onCSV={() => downloadCSV("stock_count",
              ["Ingredient", "Unit", "System Qty", "Counted", "Variance"],
              ingredients.map((p) => { const sys = systemQty(p.id); const c = counts[p.id] ?? ""; const v = variance(p.id); return [p.name, p.unit || "", sys, c || "—", v == null ? "—" : v]; }))}
            onPrint={() => printReport({
              title: "Stock Count",
              subtitle: stores.find((s) => s.id === storeId)?.name || STORE_LABELS[storeId] || storeId,
              summaryRows: [["Ingredients", String(ingredients.length)], ["Counted", String(filledCount)]],
              headers: ["Ingredient", "Unit", "System Qty", "Counted", "Variance"],
              rows: ingredients.map((p) => { const sys = systemQty(p.id); const c = counts[p.id] ?? ""; const v = variance(p.id); return [p.name, p.unit || "—", String(sys), c || "—", v == null ? "—" : v > 0 ? `+${v}` : String(v)]; }),
            })}
          />
          <button
            onClick={() => setScanMode((v) => !v)}
            className={cn("flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors",
              scanMode ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200")}
          >
            <Barcode size={16} /> <span className="hidden sm:inline">{scanMode ? "Scan Mode ON" : "Scan Mode"}</span>
          </button>
          {filledCount > 0 && (
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : `Save (${filledCount})`}
            </button>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {scanMode && (
        <div className="relative mb-4">
          <input
            ref={scanRef}
            value={scanBuffer}
            onKeyDown={handleScanKey}
            onChange={() => {}}
            placeholder="Focus here and scan a barcode…"
            className="w-full px-4 py-3 border-2 border-indigo-400 rounded-xl text-sm bg-indigo-50 dark:bg-indigo-900/20 dark:text-white focus:outline-none"
          />
          {lastScanned && (
            <div className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-lg",
              lastScanned.startsWith("Not") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
              {lastScanned}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 dark:text-white" />
        </div>
        <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 dark:text-white">
          {stores.length > 0
            ? stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
            : Object.entries(STORE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {filledCount > 0 && (
          <button onClick={() => setCounts({})}
            className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Clear
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <th className="text-left px-4 py-3">Ingredient</th>
              <th className="text-center px-3 py-3">Unit</th>
              <th className="text-center px-3 py-3 whitespace-nowrap">Sys Qty</th>
              <th className="text-center px-3 py-3 w-28">Counted</th>
              <th className="text-center px-3 py-3">Var</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No ingredients found</td></tr>
            )}
            {pagedCount.map((p) => {
              const v = variance(p.id);
              const counted = counts[p.id] ?? "";
              return (
                <tr key={p.id} className={cn("transition-colors", counted !== "" ? "bg-indigo-50/40 dark:bg-indigo-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-800")}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{p.name}</p>
                    {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">{p.unit || "—"}</td>
                  <td className="px-3 py-3 text-center font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">{systemQty(p.id)}</td>
                  <td className="px-3 py-3 text-center">
                    <input type="number" min="0" step="0.01" value={counted}
                      onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="—"
                      className="w-20 px-2 py-1.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm text-center font-mono focus:outline-none focus:border-indigo-500" />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {v == null ? <span className="text-gray-300 text-sm">—</span> : (
                      <span className={cn("inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold",
                        v === 0 ? "bg-green-100 text-green-700" : v > 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700")}>
                        {v > 0 ? `+${v}` : v}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totalCountPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {(page - 1) * COUNT_PAGE_SIZE + 1}–{Math.min(page * COUNT_PAGE_SIZE, filtered.length)} of {filtered.length} ingredients
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">Prev</button>
              {Array.from({ length: totalCountPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalCountPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…"); acc.push(p); return acc; }, [])
                .map((p, i) => p === "…"
                  ? <span key={`e${i}`} className="px-2 text-gray-400 text-xs">…</span>
                  : <button key={p} onClick={() => setPage(p)} className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors", p === page ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>{p}</button>
                )}
              <button onClick={() => setPage((p) => Math.min(totalCountPages, p + 1))} disabled={page === totalCountPages}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">Next</button>
            </div>
          </div>
        )}
        {filledCount > 0 && (
          <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-gray-500 dark:text-gray-400"><span className="font-bold text-gray-900 dark:text-white">{filledCount}</span> of {ingredients.length} counted</p>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Stock Count"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Update Stock ──────────────────────────────────────────────────────────────
function UpdateStockView() {
  const { outlets, loading } = useBaseData();
  const [stores, setStores] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [stock, setStock] = useState([]);
  const [storeId, setStoreId] = useState("main");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ quantity: "", min_quantity: "", batch_number: "", expiry_date: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const outletId = outlets[0]?.id || "";

  useEffect(() => {
    api.getStores().then(setStores).catch(console.error);
    api.getIngredients().then(setIngredients).catch(console.error);
  }, []);

  useEffect(() => {
    if (!outletId) return;
    api.getStock(outletId, storeId).then(setStock).catch(console.error);
    setEditingId(null);
  }, [outletId, storeId]); // eslint-disable-line

  const stockFor = (iid) => stock.find((s) => s.ingredient_id === iid);

  const openEdit = (p) => {
    const s = stockFor(p.id);
    setEditForm({ quantity: s?.quantity ?? 0, min_quantity: s?.min_quantity ?? 10, batch_number: s?.batch_number ?? "", expiry_date: s?.expiry_date ?? "" });
    setEditingId(p.id);
  };

  const handleSave = async (iid) => {
    setSaving(true);
    try {
      await api.updateStock({
        ingredient_id: iid, outlet_id: outletId, store: storeId,
        quantity: parseFloat(editForm.quantity), min_quantity: parseFloat(editForm.min_quantity),
        batch_number: editForm.batch_number || null,
        expiry_date: editForm.expiry_date || null,
      });
      const refreshed = await api.getStock(outletId, storeId);
      setStock(refreshed);
      setEditingId(null);
      setToast({ msg: "Stock updated successfully.", type: "success" });
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Main Store holds no stock of its own (it's a Kitchen+Bar rollup) — every
  // ingredient is addable there for legacy/reference rows only. Kitchen and
  // Bar are stocked directly (Receive Stock / Purchase Orders), so we should
  // only surface ingredients that already have a stock row in the selected
  // store. Otherwise the page just lists the full catalog with empty
  // CUR QTY / MIN columns and looks broken.
  const storeStockIds = new Set(stock.map((s) => s.ingredient_id).filter(Boolean));
  const ingredientsForStore = storeId === "main"
    ? ingredients
    : ingredients.filter((p) => storeStockIds.has(p.id));
  const filtered = ingredientsForStore.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page when search or outlet or store changes
  useEffect(() => { setPage(1); setEditingId(null); }, [search, outletId, storeId]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Edit3 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Update Stock</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Add or adjust stock quantities per store</p>
        </div>
      </div>

      {storeId === "main" && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-5">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <ArrowRight size={14} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Main Store — legacy rows only</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
              Main no longer holds stock — receive goods directly into Kitchen or Bar instead (Receive Stock / Purchase Orders).
            </p>
          </div>
        </div>
      )}

      {storeId !== "main" && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-5">
          <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/40 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <ArrowRight size={14} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {(stores.find((s) => s.id === storeId)?.name) || (STORE_LABELS[storeId] || storeId)} — listing only what's been stocked here
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              To make a new ingredient available here, receive it in via Receive Stock or a Purchase Order first.
            </p>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-white" />
        </div>
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-white font-semibold">
          {stores.length > 0
            ? stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
            : Object.entries(STORE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} ingredient{filtered.length !== 1 ? "s" : ""}
          {totalPages > 1 && ` · page ${safePage} of ${totalPages}`}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <th className="text-left px-6 py-3">Ingredient</th>
              <th className="text-center px-3 py-3">Unit</th>
              <th className="text-center px-3 py-3">Cur Qty</th>
              <th className="text-center px-3 py-3">Min</th>
              <th className="text-center px-3 py-3">New Qty</th>
              <th className="text-center px-3 py-3">New Min</th>
              <th className="text-left px-3 py-3">Batch</th>
              <th className="text-left px-3 py-3">Expiry</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {paginated.length === 0 && (
              <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-400 text-sm">No ingredients found</td></tr>
            )}
            {paginated.map((p) => {
              const s = stockFor(p.id);
              const editing = editingId === p.id;
              const inp = "w-20 px-2 py-1.5 border-2 border-blue-400 rounded-xl text-sm text-center font-mono focus:outline-none bg-white dark:bg-gray-700 dark:text-white";
              return (
                <tr key={p.id} className={cn("transition-colors", editing ? "bg-blue-50/40 dark:bg-blue-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-800")}>
                  <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white text-sm">{p.name}</td>
                  <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">{p.unit || "—"}</td>
                  <td className="px-3 py-3 text-center font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">{s?.quantity ?? "—"}</td>
                  <td className="px-3 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{s?.min_quantity ?? "—"}</td>
                  <td className="px-3 py-3 text-center">
                    {editing ? <input type="number" min="0" step="0.01" value={editForm.quantity} onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))} className={inp} />
                      : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {editing ? <input type="number" min="0" step="0.01" value={editForm.min_quantity} onChange={(e) => setEditForm((f) => ({ ...f, min_quantity: e.target.value }))} className={inp} />
                      : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {editing
                      ? <input type="text" value={editForm.batch_number} onChange={(e) => setEditForm((f) => ({ ...f, batch_number: e.target.value }))} placeholder="Batch #"
                          className="w-28 px-2 py-1.5 border-2 border-blue-400 rounded-xl text-xs focus:outline-none bg-white dark:bg-gray-700 dark:text-white" />
                      : <span className="text-xs text-gray-500 dark:text-gray-400">{s?.batch_number || "—"}</span>}
                  </td>
                  <td className="px-3 py-3">
                    {editing
                      ? <input type="date" value={editForm.expiry_date} onChange={(e) => setEditForm((f) => ({ ...f, expiry_date: e.target.value }))}
                          className="w-36 px-2 py-1.5 border-2 border-blue-400 rounded-xl text-xs focus:outline-none bg-white dark:bg-gray-700 dark:text-white" />
                      : <span className="text-xs text-gray-500 dark:text-gray-400">{s?.expiry_date || "—"}</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {editing ? (
                      <div className="flex items-center gap-1.5 justify-center">
                        <button onClick={() => handleSave(p.id)} disabled={saving}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {saving ? "…" : "Save"}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => openEdit(p)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">Edit</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(1)} disabled={safePage === 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            «
          </button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            ‹ Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
            .reduce((acc, n, i, arr) => {
              if (i > 0 && n - arr[i - 1] > 1) acc.push("…");
              acc.push(n);
              return acc;
            }, [])
            .map((n, i) =>
              n === "…" ? (
                <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-400">…</span>
              ) : (
                <button key={n} onClick={() => setPage(n)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-xs font-semibold transition-colors",
                    n === safePage
                      ? "bg-blue-600 text-white"
                      : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  )}>
                  {n}
                </button>
              )
            )}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            Next ›
          </button>
          <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            »
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Transfer Stock (between outlets) ──────────────────────────────────────────
function TransferStockView() {
  const { outlets, loading } = useBaseData();
  const [ingredients, setIngredients] = useState([]);
  const [allStock, setAllStock] = useState([]);
  const [form, setForm] = useState({ ingredient_id: "", from_outlet: "", to_outlet: "", quantity: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getIngredients().then(setIngredients).catch(console.error);
  }, []);

  useEffect(() => {
    if (outlets.length >= 2) {
      setForm((f) => ({ ...f, from_outlet: outlets[0].id, to_outlet: outlets[1].id }));
    }
    if (outlets.length > 0) {
      api.getStock().then(setAllStock).catch(console.error);
    }
  }, [outlets]);

  const stockAt = (iid, oid) => allStock.find((s) => s.ingredient_id === iid && s.outlet_id === oid)?.quantity ?? 0;
  const minQtyAt = (iid, oid) => allStock.find((s) => s.ingredient_id === iid && s.outlet_id === oid)?.min_quantity ?? 10;
  const fromQty = form.ingredient_id && form.from_outlet ? stockAt(form.ingredient_id, form.from_outlet) : null;
  const toQty = form.ingredient_id && form.to_outlet ? stockAt(form.ingredient_id, form.to_outlet) : null;
  const transferQty = parseFloat(form.quantity) || 0;
  const canTransfer = form.ingredient_id && form.from_outlet && form.to_outlet
    && form.from_outlet !== form.to_outlet && transferQty > 0
    && fromQty != null && transferQty <= fromQty;
  const selectedIngredient = ingredients.find((p) => p.id === form.ingredient_id);

  const handleTransfer = async () => {
    if (!canTransfer) return;
    setSaving(true);
    try {
      await Promise.all([
        api.updateStock({ ingredient_id: form.ingredient_id, outlet_id: form.from_outlet, quantity: fromQty - transferQty, min_quantity: minQtyAt(form.ingredient_id, form.from_outlet) }),
        api.updateStock({ ingredient_id: form.ingredient_id, outlet_id: form.to_outlet, quantity: toQty + transferQty, min_quantity: minQtyAt(form.ingredient_id, form.to_outlet) }),
      ]);
      const refreshed = await api.getStock();
      setAllStock(refreshed);
      setForm((f) => ({ ...f, ingredient_id: "", quantity: "" }));
      setToast({ msg: `Transferred ${transferQty} ${selectedIngredient?.unit || "units"} successfully.`, type: "success" });
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const filteredIngredients = ingredients.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  if (loading) return <Spinner color="emerald" />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <ArrowRight size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Transfer Stock</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Move inventory between outlets</p>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {outlets.length < 2 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-sm font-medium">You need at least 2 outlets to transfer stock.</p>
        </div>
      )}

      <div className="max-w-2xl mx-auto grid grid-cols-1 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 space-y-5">
          <h2 className="font-bold text-gray-900 dark:text-white">Transfer Details</h2>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Ingredient</label>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients…"
                className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
            </div>
            <select value={form.ingredient_id} onChange={(e) => setForm((f) => ({ ...f, ingredient_id: e.target.value, quantity: "" }))}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-emerald-400 bg-white dark:bg-gray-800 dark:text-white">
              <option value="">Select ingredient…</option>
              {filteredIngredients.map((p) => <option key={p.id} value={p.id}>{p.name}{p.unit ? ` (${p.unit})` : ""}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">From</label>
              <select value={form.from_outlet} onChange={(e) => setForm((f) => ({ ...f, from_outlet: e.target.value }))}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-emerald-400 bg-white dark:bg-gray-800 dark:text-white">
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <ArrowRight size={20} className="text-gray-400 flex-shrink-0 mt-5" />
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">To</label>
              <select value={form.to_outlet} onChange={(e) => setForm((f) => ({ ...f, to_outlet: e.target.value }))}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-emerald-400 bg-white dark:bg-gray-800 dark:text-white">
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>
          {form.from_outlet === form.to_outlet && form.from_outlet && (
            <p className="text-xs text-red-500 font-medium">Source and destination must be different.</p>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Quantity {selectedIngredient?.unit && <span className="normal-case font-normal text-gray-400 ml-1">({selectedIngredient.unit})</span>}
              {fromQty != null && <span className="normal-case font-normal text-gray-400 ml-1">· available: {fromQty}</span>}
            </label>
            <input type="number" min="0" step="0.01" max={fromQty ?? undefined} value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="0"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
          </div>
          <button onClick={handleTransfer} disabled={!canTransfer || saving}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? "Transferring…" : "Confirm Transfer"}
          </button>
        </div>

        {form.ingredient_id && form.from_outlet && form.to_outlet && form.from_outlet !== form.to_outlet && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 dark:text-white mb-4">Preview</h2>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{selectedIngredient?.name}{selectedIngredient?.unit ? ` (${selectedIngredient.unit})` : ""}</p>
            <div className="space-y-3">
              {[
                { label: outlets.find((o) => o.id === form.from_outlet)?.name, current: fromQty, after: fromQty - transferQty, dir: "out" },
                { label: outlets.find((o) => o.id === form.to_outlet)?.name, current: toQty, after: toQty + transferQty, dir: "in" },
              ].map(({ label, current, after, dir }) => (
                <div key={label} className={cn("rounded-xl p-4 border-2", dir === "out" ? "border-red-100 bg-red-50" : "border-green-100 bg-green-50")}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xl font-black text-gray-700">{current}</span>
                    <ArrowRight size={16} className="text-gray-400" />
                    <span className={cn("font-mono text-xl font-black", dir === "out" ? "text-red-600" : "text-green-600")}>{transferQty > 0 ? after : current}</span>
                    {transferQty > 0 && <span className={cn("text-xs font-bold ml-auto", dir === "out" ? "text-red-500" : "text-green-600")}>{dir === "out" ? `-${transferQty}` : `+${transferQty}`}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reorder Alerts ────────────────────────────────────────────────────────────
function ReorderView() {
  const [lowStock, setLowStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getLowStock(), api.getProducts(), api.getStores()])
      .then(([ls, p, s]) => { setLowStock(ls); setProducts(p); setStores(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const productName = (id) => {
    const prod = products.find((p) => p.id === id);
    if (prod) return prod.name;
    const stockItem = lowStock.find((s) => s.ingredient_id === id || s.product_id === id);
    if (stockItem?.ingredient_name) return stockItem.ingredient_name;
    return id;
  };
  const storeName = (id) => STORE_LABELS[id || "main"] || stores.find((s) => s.id === id)?.name || id || "Main Store";
  const deficit = (item) => Math.max(0, (item.min_quantity || 10) * 2 - parseInt(item.quantity || 0));

  if (loading) return <Spinner color="orange" />;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <TrendingDown size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Reorder Alerts</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 hidden sm:block">{lowStock.length} item{lowStock.length !== 1 ? "s" : ""} at or below minimum stock level</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ExportBtn
            onCSV={() => downloadCSV("reorder_alerts",
              ["Ingredient", "Store", "Current", "Unit", "Min", "Suggested Order"],
              lowStock.map((item) => [item.ingredient_name || productName(item.product_id), storeName(item.store), item.quantity, item.unit || "", item.min_quantity || 10, deficit(item)]))}
            onPrint={() => printReport({
              title: "Reorder Alerts",
              summaryRows: [["Items Needing Reorder", String(lowStock.length)]],
              headers: ["Ingredient", "Store", "Current", "Unit", "Min", "Suggested Order"],
              rows: lowStock.map((item) => [item.ingredient_name || productName(item.product_id), storeName(item.store), item.quantity, item.unit || "—", item.min_quantity || 10, deficit(item)]),
            })}
          />
          <button onClick={load} className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {lowStock.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 size={48} className="text-green-400 mb-4" />
          <p className="text-lg font-bold text-gray-700 dark:text-gray-200">All items are well stocked</p>
          <p className="text-gray-400 text-sm mt-1">No items are at or below their minimum quantity.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3">Ingredient</th>
                <th className="text-left px-4 py-3">Store</th>
                <th className="text-center px-3 py-3">Current</th>
                <th className="text-center px-3 py-3">Unit</th>
                <th className="text-center px-3 py-3">Min</th>
                <th className="text-center px-3 py-3">Suggested Order</th>
                <th className="text-center px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {lowStock.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{item.ingredient_name || productName(item.product_id)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", STORE_COLORS[item.store || "main"] || STORE_COLORS.main)}>
                      {storeName(item.store)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="font-bold text-orange-500">{item.quantity}</span>
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">{item.unit || "—"}</td>
                  <td className="px-3 py-3 text-center text-gray-500 dark:text-gray-400 text-sm">{item.min_quantity || 10}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="font-semibold text-blue-600">{deficit(item)}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => {
                        const product = products.find((p) => p.id === item.product_id);
                        window.dispatchEvent(new CustomEvent("nav-purchases", {
                          detail: {
                            sub: "pending",
                            prefill: {
                              product_id: item.product_id,
                              product_name: productName(item.product_id),
                              quantity: deficit(item),
                              cost_price: product?.cost_price || 0,
                            },
                          },
                        }));
                      }}
                      className="flex items-center gap-1 justify-center text-xs font-semibold text-green-600 hover:text-green-800 whitespace-nowrap"
                    >
                      <ShoppingBag size={13} /> Create PO
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Waste Recording ──────────────────────────────────────────────────────────
const WASTE_REASONS = ["Spoilage", "Damage", "Theft", "Expired", "Overproduction", "Other"];

function WasteView() {
  const { products, outlets, loading: baseLoading } = useBaseData();
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState([]);
  const [units, setUnits] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_id: "", outlet_id: "", quantity: "", reason: "Spoilage", notes: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => { api.getUnits().then(setUnits).catch(console.error); }, []);

  const productUnit = (pid) => {
    const p = products.find((pr) => pr.id === pid);
    if (!p?.unit_id) return "";
    const u = units.find((u) => u.id === p.unit_id);
    return u?.abbreviation || u?.name || "";
  };

  const load = (oid) => {
    const id = oid || outletId;
    setLoading(true);
    Promise.all([api.getWasteEntries(id), api.getWasteSummary(id)])
      .then(([e, s]) => { setEntries(e); setSummary(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (outlets.length > 0 && !outletId) {
      const id = outlets[0].id;
      setOutletId(id);
      setForm((f) => ({ ...f, outlet_id: id }));
      load(id);
    }
  }, [outlets]);

  useEffect(() => {
    if (outletId) { load(outletId); setForm((f) => ({ ...f, outlet_id: outletId })); }
  }, [outletId]);

  const productName = (id) => products.find((p) => p.id === id)?.name || id;

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.createWasteEntry({ ...form, quantity: parseInt(form.quantity) });
      setShowForm(false);
      setForm((f) => ({ ...f, product_id: "", quantity: "", reason: "Spoilage", notes: "" }));
      load(outletId);
      setToast({ msg: "Waste entry recorded and stock deducted.", type: "success" });
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this waste entry? Stock will be restored.")) return;
    try {
      await api.deleteWasteEntry(id);
      load(outletId);
      setToast({ msg: "Waste entry deleted and stock restored.", type: "success" });
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    }
  };

  const filtered = entries.filter((e) =>
    !search || productName(e.product_id).toLowerCase().includes(search.toLowerCase())
  );

  if (baseLoading) return <Spinner color="red" />;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <PackageX size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Waste Recording</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 hidden sm:block">Log spoilage, damage, and other stock losses</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ExportBtn
            onCSV={() => downloadCSV("waste_log",
              ["Product", "Qty", "Reason", "Notes", "Date"],
              entries.map((e) => [productName(e.product_id), e.quantity, e.reason, e.notes || "", new Date(e.created_at).toLocaleDateString()]))}
            onPrint={() => printReport({
              title: "Waste Recording Log",
              summaryRows: summary.map((s) => [s.reason, `${s.total_qty} (${s.count} entries)`]),
              headers: ["Product", "Qty", "Reason", "Notes", "Date"],
              rows: entries.map((e) => [productName(e.product_id), e.quantity, e.reason, e.notes || "—", new Date(e.created_at).toLocaleDateString()]),
            })}
          />
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors">
            <Plus size={16} /> <span className="hidden sm:inline">Record</span> Waste
          </button>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {summary.map((s) => (
            <div key={s.reason} className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-3 text-center">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{s.reason}</p>
              <p className="text-xl font-black text-red-500">{s.total_qty}</p>
              <p className="text-xs text-gray-400">{s.count} entr{s.count === 1 ? "y" : "ies"}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white" />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
        {loading ? <Spinner color="red" /> : (
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-center px-3 py-3">Qty</th>
                <th className="text-left px-3 py-3">Reason</th>
                <th className="text-left px-3 py-3">Notes</th>
                <th className="text-left px-3 py-3">Date</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{productName(e.product_id)}</td>
                  <td className="px-3 py-3 text-center font-bold text-red-500">
                    {e.quantity}{productUnit(e.product_id) && <span className="ml-1 text-[11px] font-semibold text-gray-400">{productUnit(e.product_id)}</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">{e.reason}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[160px] truncate">{e.notes || "—"}</td>
                  <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(e.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => handleDelete(e.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">No waste entries found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Record Waste Entry</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Product</label>
                <select required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-red-400">
                  <option value="">Select product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Quantity Lost</label>
                  <div className="flex items-center gap-2">
                    <input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-red-400" />
                    {form.product_id && productUnit(form.product_id) && (
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{productUnit(form.product_id)}</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Reason</label>
                  <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-red-400">
                    {WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Notes (optional)</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-red-400 resize-none" />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors">
                {saving ? "Recording…" : "Record Waste"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stock Valuation ──────────────────────────────────────────────────────────
const VALUATION_PAGE_SIZE = 25;

function ValuationView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    api.getStockValuation(undefined)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  const items = data?.items || [];
  const filtered = items.filter((i) => !search || (i.ingredient_name || i.product_name || "").toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / VALUATION_PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * VALUATION_PAGE_SIZE, page * VALUATION_PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <DollarSign size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Stock Valuation</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Total cost value of current ingredients in stock</p>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-100 dark:border-blue-800 rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Stock Value</p>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{formatCurrency(data.total_value || data.total_cost_value || 0)}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-100 dark:border-green-800 rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Ingredients Tracked</p>
            <p className="text-2xl font-black text-green-600 dark:text-green-400">{items.length}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white" />
        </div>
        {data && (
          <ExportBtn
            onCSV={() => downloadCSV("stock_valuation",
              ["Ingredient", "Store", "Qty", "Unit", "Cost Price", "Total Value"],
              items.map((i) => [i.ingredient_name || i.product_name || "", STORE_LABELS[i.store || "main"] || i.store || "Main Store", i.quantity, i.unit || "", i.cost_price, i.total_value]))}
            onPrint={() => printReport({
              title: "Stock Valuation",
              summaryRows: [["Total Stock Value", formatCurrency(data.total_value || data.total_cost_value || 0)], ["Ingredients Tracked", String(items.length)]],
              headers: ["Ingredient", "Store", "Qty", "Unit", "Cost Price", "Total Value"],
              rows: items.map((i) => [i.ingredient_name || i.product_name || "", STORE_LABELS[i.store || "main"] || i.store || "Main Store", i.quantity, i.unit || "—", formatCurrency(i.cost_price), formatCurrency(i.total_value)]),
            })}
          />
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
        {loading ? <Spinner color="green" /> : (
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3">Ingredient</th>
                <th className="text-left px-3 py-3">Store</th>
                <th className="text-center px-3 py-3">Qty</th>
                <th className="text-center px-3 py-3">Unit</th>
                <th className="text-right px-3 py-3">Cost Price</th>
                <th className="text-right px-3 py-3">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {paginated.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{item.ingredient_name || item.product_name}</td>
                  <td className="px-3 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", STORE_COLORS[item.store || "main"] || STORE_COLORS.main)}>
                      {STORE_LABELS[item.store || "main"] || item.store || "Main Store"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">{item.quantity}</td>
                  <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">{item.unit || "—"}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-600 dark:text-gray-300">{formatCurrency(item.cost_price)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-blue-600 dark:text-blue-400 text-sm">{formatCurrency(item.total_value)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">No stock valuation data</td></tr>}
            </tbody>
          </table>
        )}
        {!loading && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {(page - 1) * VALUATION_PAGE_SIZE + 1}–{Math.min(page * VALUATION_PAGE_SIZE, filtered.length)} of {filtered.length} items
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-2 text-gray-400 text-xs">…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p)}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        p === page ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>
                      {p}
                    </button>
                  )
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Consolidated Multi-Outlet View ───────────────────────────────────────────
const CONSOLIDATED_PAGE_SIZE = 25;

function ConsolidatedView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    api.getConsolidatedStock().then(setData).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  const outlets = data?.outlets || [];
  // New backend returns `items`, legacy returned `products`
  const rawRows = data?.items || data?.products || [];
  const allRows = rawRows.filter(
    (p) => !search || (p.ingredient_name || p.product_name || "").toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(allRows.length / CONSOLIDATED_PAGE_SIZE));
  const productRows = allRows.slice((page - 1) * CONSOLIDATED_PAGE_SIZE, page * CONSOLIDATED_PAGE_SIZE);
  const isLow = (info) => info && info.quantity <= info.min_quantity;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-violet-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Consolidated Stock</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 hidden sm:block">All ingredients across all outlets side by side</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {data && (
            <ExportBtn
              onCSV={() => {
                const hdrs = ["Ingredient", "Unit", "Store", ...outlets.map((o) => o.name), "Total"];
                const rows = rawRows.map((row) => [row.ingredient_name || row.product_name || "", row.unit || "", STORE_LABELS[row.store || "main"] || row.store || "Main", ...outlets.map((o) => row.outlets?.[o.id]?.quantity ?? 0), row.total]);
                downloadCSV("consolidated_stock", hdrs, rows);
              }}
              onPrint={() => {
                const hdrs = ["Ingredient", "Unit", "Store", ...outlets.map((o) => o.name), "Total"];
                const rows = rawRows.map((row) => [row.ingredient_name || row.product_name || "", row.unit || "—", STORE_LABELS[row.store || "main"] || row.store || "Main", ...outlets.map((o) => row.outlets?.[o.id]?.quantity ?? "—"), row.total]);
                printReport({ title: "Consolidated Stock View", headers: hdrs, rows, landscape: true });
              }}
            />
          )}
          <button onClick={load} className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="relative max-w-xs mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
        {loading ? <Spinner color="violet" /> : (
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3 sticky left-0 bg-white dark:bg-gray-800">Ingredient</th>
                <th className="text-center px-3 py-3">Unit</th>
                <th className="text-center px-3 py-3">Store</th>
                {outlets.map((o) => <th key={o.id} className="text-center px-4 py-3 whitespace-nowrap">{o.name}</th>)}
                <th className="text-center px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {productRows.map((row, ri) => (
                <tr key={row.ingredient_id ? `${row.ingredient_id}-${row.store || "main"}` : row.product_id || ri} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm sticky left-0 bg-white dark:bg-gray-800">{row.ingredient_name || row.product_name}</td>
                  <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">{row.unit || "—"}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", STORE_COLORS[row.store || "main"] || STORE_COLORS.main)}>
                      {STORE_LABELS[row.store || "main"] || row.store || "Main"}
                    </span>
                  </td>
                  {outlets.map((o) => {
                    const info = row.outlets?.[o.id];
                    const low = isLow(info);
                    return (
                      <td key={o.id} className="px-4 py-3 text-center">
                        {info
                          ? <span className={cn("font-mono font-bold text-sm", low ? "text-orange-500" : "text-gray-700 dark:text-gray-200")}>{info.quantity}</span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center font-mono font-black text-gray-900 dark:text-white text-sm">{row.total}</td>
                </tr>
              ))}
              {productRows.length === 0 && <tr><td colSpan={outlets.length + 4} className="px-6 py-10 text-center text-gray-400 text-sm">No stock data</td></tr>}
            </tbody>
          </table>
        )}
        {!loading && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {(page - 1) * CONSOLIDATED_PAGE_SIZE + 1}–{Math.min(page * CONSOLIDATED_PAGE_SIZE, allRows.length)} of {allRows.length} products
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-2 text-gray-400 text-xs">…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p)}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        p === page ? "bg-violet-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>
                      {p}
                    </button>
                  )
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Receive Stock Modal ──────────────────────────────────────────────────────

const _EMPTY_RECEIVE_ITEM = { ingredientId: "", newName: "", received: "", minQty: "10", batchNumber: "", expiryDate: "", unit: "pcs" };

function ReceiveStockModal({ mode = "ingredient", catalog, ingredients, outlets, initialOutletId, onClose, onReceived }) {
  // Accept either `catalog` (new) or `ingredients` (legacy) as the source list
  const initialCatalog = catalog || ingredients || [];
  const isProductMode = mode === "product";
  const SUBJECT = isProductMode ? "Product" : "Ingredient";
  const SUBJECT_FIELD = isProductMode ? "product_id" : "ingredient_id";

  const [outletId, setOutletId] = useState(initialOutletId || outlets[0]?.id || "");
  const [store, setStore] = useState("kitchen");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([{ ..._EMPTY_RECEIVE_ITEM }]);
  const [currentStock, setCurrentStock] = useState([]);
  const [allCatalog, setAllCatalog] = useState(initialCatalog);
  // Units catalog from Products → Units. Whatever the venue defined
  // there is what we offer here. Falls back to the same minimal default
  // list when the API returns empty, so a brand-new install still has
  // something usable.
  const [unitOptions, setUnitOptions] = useState(["pcs", "g", "kg", "ml", "L", "carton", "pack", "bottle"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!outletId) return;
    api.getStock(outletId, store).then(setCurrentStock).catch(console.error);
  }, [outletId, store]); // eslint-disable-line

  useEffect(() => { setAllCatalog(catalog || ingredients || []); }, [catalog, ingredients]);

  useEffect(() => {
    api.getUnits?.().then((units) => {
      const names = (units || []).map((u) => u.abbreviation || u.name).filter(Boolean);
      if (names.length) setUnitOptions(names);
    }).catch(() => {});
  }, []);

  const stockFor = (id) => currentStock.find((x) => x[SUBJECT_FIELD] === id);
  const currentQty = (id) => Number(stockFor(id)?.quantity || 0);

  const filteredCatalog = allCatalog.filter(
    (p) => !search || (p.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const setField = (idx, key, val) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));

  const handleSubjectChange = (idx, val) => {
    // "__new__" only applies in ingredient mode — products must be created in Products section
    if (val === "__new__" && !isProductMode) {
      setItems((prev) => prev.map((it, i) => i !== idx ? it : { ...it, ingredientId: "__new__", newName: "", minQty: "10" }));
      return;
    }
    const s = currentStock.find((x) => x[SUBJECT_FIELD] === val);
    const cat = allCatalog.find((x) => x.id === val);
    setItems((prev) => prev.map((it, i) => i !== idx ? it : {
      ...it,
      ingredientId: val,
      newName: "",
      minQty: s?.min_quantity ? String(s.min_quantity) : "10",
      unit: cat?.unit || (isProductMode ? "" : "pcs"),
    }));
  };

  const addItem = () => setItems((prev) => [...prev, { ..._EMPTY_RECEIVE_ITEM }]);
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valid = items.filter((it) =>
      ((it.ingredientId && it.ingredientId !== "__new__") || (it.ingredientId === "__new__" && it.newName.trim()))
      && parseFloat(it.received) > 0
    );
    if (!valid.length) { setError("Add at least one item with a valid quantity."); return; }
    setSaving(true); setError("");
    try {
      for (const it of valid) {
        let id = it.ingredientId;
        // Auto-create new ingredients on the fly (ingredient mode only)
        if (id === "__new__" && !isProductMode) {
          const created = await api.createIngredient({
            name: it.newName.trim(),
            unit: it.unit || "pcs",
            cost_price: 0,
            active: true,
            // Tag the new ingredient with the receiving store so it
            // shows up in that store's Add Stock picker going forward
            // (and is hidden from the others).
            home_store: store,
          });
          id = created.id;
          setAllCatalog((prev) => [...prev, created]);
        } else if (!isProductMode && it.unit) {
          // Existing ingredient — if the user picked a different unit on
          // the row, persist it on the ingredient so future stock /
          // recipe / report views all reflect the new unit. Best-effort;
          // don't fail the receive if the rename fails.
          const cat = allCatalog.find((x) => x.id === id);
          if (cat && cat.unit !== it.unit) {
            try { await api.updateIngredient(id, { unit: it.unit }); } catch (_) {}
          }
        }
        await api.updateStock({
          [SUBJECT_FIELD]: id,
          outlet_id: outletId,
          store,
          quantity: currentQty(id) + parseFloat(it.received),
          min_quantity: parseFloat(it.minQty) || 10,
          batch_number: it.batchNumber || null,
          expiry_date: it.expiryDate || null,
        });
      }
      onReceived(`${valid.length} item${valid.length !== 1 ? "s" : ""} received into ${store === "kitchen" ? "Kitchen" : "Bar"} Store`);
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white">Receive Stock</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">Add incoming goods directly into Kitchen or Bar</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0 ml-2"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Controls row */}
          <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-3 flex-shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Outlet</label>
              <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none">
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Store</label>
              <select value={store} onChange={(e) => setStore(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none">
                <option value="kitchen">Kitchen</option>
                <option value="bar">Bar</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Search {SUBJECT}</label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Filter ${SUBJECT.toLowerCase()}s…`}
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Items list — table on lg+, stacked cards on phones/tablets so
              the 8 columns don't force a horizontal scrub. */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 min-h-0">
            {/* Phone / tablet: card-per-item */}
            <div className="lg:hidden space-y-3">
              {items.map((item, idx) => {
                const cur = item.ingredientId && item.ingredientId !== "__new__" ? currentQty(item.ingredientId) : null;
                const add = parseFloat(item.received) || 0;
                const newTotal = cur !== null ? cur + add : null;
                return (
                  <div key={idx} className="border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-3 bg-gray-50/40 dark:bg-gray-900/30 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Item #{idx + 1}</p>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1 -mt-0.5">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{SUBJECT}</label>
                      {item.ingredientId === "__new__" ? (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={item.newName}
                            onChange={(e) => setField(idx, "newName", e.target.value)}
                            placeholder={`New ${SUBJECT.toLowerCase()} name…`}
                            className="flex-1 min-w-0 px-2 py-2 border-2 border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-white rounded-lg text-sm focus:outline-none"
                          />
                          <select
                            value={item.unit}
                            onChange={(e) => setField(idx, "unit", e.target.value)}
                            className="px-2 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-xs focus:outline-none flex-shrink-0"
                          >
                            {unitOptions.map((u) => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                      ) : (
                        <select value={item.ingredientId} onChange={(e) => handleSubjectChange(idx, e.target.value)}
                          className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500">
                          <option value="">Select {SUBJECT.toLowerCase()}…</option>
                          {filteredCatalog.map((p) => <option key={p.id} value={p.id}>{p.name}{p.unit ? ` (${p.unit})` : ""}</option>)}
                          {!isProductMode && <option value="__new__">+ Add new ingredient</option>}
                        </select>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Current</label>
                        <p className="px-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 text-center bg-white dark:bg-gray-700 rounded-lg border border-transparent">
                          {cur !== null ? cur : <span className="text-gray-300">—</span>}
                        </p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">+ Receive</label>
                        <input type="number" min="0" step="0.01" value={item.received}
                          inputMode="decimal"
                          onChange={(e) => setField(idx, "received", e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm text-center focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">New Total</label>
                        <p className="px-2 py-2 text-sm font-bold text-center rounded-lg border border-transparent">
                          {newTotal !== null && add > 0
                            ? <span className="text-green-600 dark:text-green-400">{newTotal}</span>
                            : <span className="text-gray-300">—</span>}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Unit</label>
                        <select value={item.unit || ""} onChange={(e) => setField(idx, "unit", e.target.value)}
                          className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-xs focus:outline-none focus:border-blue-500">
                          {item.unit && !unitOptions.includes(item.unit) && <option value={item.unit}>{item.unit}</option>}
                          {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Min Qty</label>
                        <input type="number" min="0" step="0.01" value={item.minQty}
                          inputMode="decimal"
                          onChange={(e) => setField(idx, "minQty", e.target.value)}
                          className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm text-center focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Batch #</label>
                        <input type="text" value={item.batchNumber}
                          onChange={(e) => setField(idx, "batchNumber", e.target.value)}
                          placeholder="Optional"
                          className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Expiry</label>
                      <input type="date" value={item.expiryDate}
                        onChange={(e) => setField(idx, "expiryDate", e.target.value)}
                        className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: original 8-col table */}
            <table className="w-full text-sm hidden lg:table">
              <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left py-2 pr-3 min-w-[220px]">{SUBJECT}</th>
                  <th className="text-center py-2 px-3 w-24">Current</th>
                  <th className="text-center py-2 px-3 w-28">+ Receive</th>
                  <th className="text-center py-2 px-3 w-24">Unit</th>
                  <th className="text-center py-2 px-3 w-24">New Total</th>
                  <th className="text-center py-2 px-3 w-24">Min Qty</th>
                  <th className="text-left py-2 px-3 w-32">Batch #</th>
                  <th className="text-left py-2 px-3 w-36">Expiry</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {items.map((item, idx) => {
                  const cur = item.ingredientId && item.ingredientId !== "__new__" ? currentQty(item.ingredientId) : null;
                  const add = parseFloat(item.received) || 0;
                  const newTotal = cur !== null ? cur + add : null;
                  return (
                    <tr key={idx} className="group">
                      <td className="py-2 pr-2">
                        {item.ingredientId === "__new__" ? (
                          <div className="flex gap-1">
                            <input
                              autoFocus
                              value={item.newName}
                              onChange={(e) => setField(idx, "newName", e.target.value)}
                              placeholder={`New ${SUBJECT.toLowerCase()} name…`}
                              className="flex-1 px-2 py-1.5 border-2 border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-white rounded-lg text-sm focus:outline-none"
                            />
                            <select
                              value={item.unit}
                              onChange={(e) => setField(idx, "unit", e.target.value)}
                              className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-xs focus:outline-none"
                            >
                              {unitOptions.map((u) => <option key={u}>{u}</option>)}
                            </select>
                          </div>
                        ) : (
                          <select value={item.ingredientId} onChange={(e) => handleSubjectChange(idx, e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500">
                            <option value="">Select {SUBJECT.toLowerCase()}…</option>
                            {filteredCatalog.map((p) => <option key={p.id} value={p.id}>{p.name}{p.unit ? ` (${p.unit})` : ""}</option>)}
                            {!isProductMode && <option value="__new__">+ Add new ingredient</option>}
                          </select>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                          {cur !== null ? cur : <span className="text-gray-300">—</span>}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" min="0" step="0.01" value={item.received}
                          onChange={(e) => setField(idx, "received", e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm text-center focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="py-2 px-2">
                        <select value={item.unit || ""} onChange={(e) => setField(idx, "unit", e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-xs focus:outline-none focus:border-blue-500">
                          {item.unit && !unitOptions.includes(item.unit) && <option value={item.unit}>{item.unit}</option>}
                          {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {newTotal !== null && add > 0
                          ? <span className="text-sm font-bold text-green-600 dark:text-green-400">{newTotal}</span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" min="0" step="0.01" value={item.minQty}
                          onChange={(e) => setField(idx, "minQty", e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm text-center focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="py-2 px-2">
                        <input type="text" value={item.batchNumber}
                          onChange={(e) => setField(idx, "batchNumber", e.target.value)}
                          placeholder="Optional"
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="py-2 px-2">
                        <input type="date" value={item.expiryDate}
                          onChange={(e) => setField(idx, "expiryDate", e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                      </td>
                      <td className="py-2 pl-1">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)}
                            className="text-gray-300 hover:text-red-500 transition-colors p-1">
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 space-y-3">
            <button type="button" onClick={addItem}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 dark:hover:text-blue-400 transition-colors">
              <Plus size={15} /> Add Another Item
            </button>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-2 sm:gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {(() => {
                  const n = items.filter(it => ((it.ingredientId && it.ingredientId !== "__new__") || (it.ingredientId === "__new__" && it.newName.trim())) && parseFloat(it.received) > 0).length;
                  if (saving) return "Receiving…";
                  return n > 0 ? `Receive ${n} Item${n === 1 ? "" : "s"}` : "Receive";
                })()}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Import CSV Modal ─────────────────────────────────────────────────────────

function ImportCsvModal({ outletId, outletName, mode = "ingredient", defaultStore = "kitchen", onClose, onImported }) {
  const isProductMode = mode === "product";
  const SUBJECT = isProductMode ? "Product" : "Ingredient";
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetStore, setTargetStore] = useState(defaultStore === "main" ? "kitchen" : (defaultStore || "kitchen"));
  const fileRef = useRef(null);

  const downloadTemplate = () => {
    let csv;
    let filename;
    if (isProductMode) {
      csv = "name,quantity,min_quantity,batch_number,expiry_date\nCoca-Cola 500ml,100,20,,\nBread loaf,50,10,BATCH001,2026-12-31\n";
      filename = `${targetStore}_store_products_template.csv`;
    } else {
      csv = "name,quantity,min_quantity,unit,category,cost_price,batch_number,expiry_date\nBasmati rice,100,20,kg,Grains,800,,\nTomato paste,50,10,pcs,Sauces,500,BATCH001,2026-12-31\n";
      filename = `${targetStore}_store_ingredients_template.csv`;
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleFile = (f) => {
    setFile(f); setResult(null);
    if (!f) { setPreview([]); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split("\n").filter(Boolean);
      const headers = lines[0]?.split(",").map(h => h.replace(/^"|"$/g, "").trim());
      const rows = lines.slice(1, 6).map(line => {
        const vals = line.split(",").map(v => v.replace(/^"|"$/g, "").trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
        return obj;
      });
      setPreview(rows);
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file || !outletId) return;
    setLoading(true);
    try {
      const res = await api.importStockCsv(outletId, targetStore, file, mode);
      setResult(res);
      onImported?.();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <Upload size={16} className="text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Import Stock via CSV</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Import To</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "kitchen", label: "Kitchen Store", on: "border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" },
                { key: "bar",     label: "Bar Store",     on: "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
              ].map((s) => (
                <button key={s.key} type="button"
                  onClick={() => { setTargetStore(s.key); setResult(null); }}
                  className={cn(
                    "px-3 py-2 rounded-xl text-xs font-bold border-2 transition-colors",
                    targetStore === s.key ? s.on : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300"
                  )}
                >{s.label}</button>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <p className="font-semibold">CSV Format ({SUBJECT} mode)</p>
            {isProductMode ? (
              <>
                <p className="font-mono text-xs">name, quantity, min_quantity, batch_number (opt), expiry_date (opt)</p>
                <p className="text-xs opacity-80 mt-1">Rows are matched to existing products by name. Create products in <strong>Products → All Products</strong> first.</p>
              </>
            ) : (
              <>
                <p className="font-mono text-xs">name, quantity, min_quantity, unit (opt), category (opt), cost_price (opt), batch_number (opt), expiry_date (opt)</p>
                <p className="text-xs opacity-80 mt-1">New ingredients will be auto-created in your catalog.</p>
              </>
            )}
            <button onClick={downloadTemplate} className="mt-2 text-xs font-bold underline hover:no-underline">
              Download template CSV
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">CSV File</label>
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors">
              <Upload size={24} className="mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {file ? <span className="font-semibold text-gray-900 dark:text-white">{file.name}</span> : "Click to select a CSV file"}
              </p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e => handleFile(e.target.files?.[0] || null)} />
            </div>
          </div>

          {preview.length > 0 && !result && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Preview (first {preview.length} rows)</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-400 uppercase">
                    <tr>{["Ingredient", "Qty", "Min Qty", "Unit", "Batch", "Expiry"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {preview.map((row, i) => (
                      <tr key={i} className="bg-white dark:bg-gray-900">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{row.name || row.product_name}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.quantity}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.min_quantity}</td>
                        <td className="px-3 py-2 text-gray-500">{row.unit || "pcs"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.batch_number || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.expiry_date || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && !result.error && (
            <div className={cn("rounded-xl p-4 text-sm space-y-1", result.skipped > 0 ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300" : "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300")}>
              <p className="font-bold">Import complete</p>
              <p>
                {result.imported || 0} item(s) imported
                {typeof result.created === "number" && result.created > 0 && ` · ${result.created} new ingredient(s) auto-created`}
                {result.skipped > 0 && ` · ${result.skipped} skipped`}
              </p>
              {result.errors?.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs opacity-80 list-disc pl-4">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
          {result?.error && (
            <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm font-semibold">{result.error}</div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 transition-colors">
            {result && !result.error ? "Close" : "Cancel"}
          </button>
          {(!result || result.error) && (
            <button onClick={handleImport} disabled={!file || !outletId || loading}
              className="px-5 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
              {loading ? "Importing…" : `Import to ${targetStore === "kitchen" ? "Kitchen" : "Bar"} Store`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Store View ──────────────────────────────────────────────────────────

// Main Store holds no physical stock of its own — it's a pure rollup of
// whatever's currently in Kitchen + Bar, since Main never sells/serves
// directly and goods are received straight into Kitchen or Bar now (see
// ReceiveStockModal / Purchase Order receiving / StockLevelsView's Transfer
// action). Batch/expiry aren't shown here since those are meaningful per
// physical store, not as a cross-store aggregate — see Stock Levels for that.
function MainStoreView() {
  const businessConfig = useBusinessConfig();
  const isProductMode = businessConfig.stockMode === "product";
  const SUBJECT_LABEL = isProductMode ? "Product" : "Ingredient";
  const SUBJECT_LABEL_PLURAL = isProductMode ? "Products" : "Ingredients";

  const [rollup, setRollup] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadStock = () => {
    setLoading(true);
    Promise.all([
      api.getStock(null, "kitchen").catch(() => []),
      api.getStock(null, "bar").catch(() => []),
    ])
      .then(([kitchen, bar]) => {
        const combined = {};
        for (const row of [...kitchen, ...bar]) {
          const key = row.ingredient_id || row.product_id;
          if (!key) continue;
          const entry = combined[key] || {
            key,
            subject_name: row.subject_name || row.ingredient_name || row.product_name,
            unit: row.unit,
            qty: 0,
            min: 0,
          };
          entry.qty += parseFloat(row.quantity) || 0;
          entry.min += parseFloat(row.min_quantity) || 0;
          combined[key] = entry;
        }
        setRollup(Object.values(combined));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStock(); }, []); // eslint-disable-line

  const totalUnits = rollup.reduce((s, x) => s + x.qty, 0);
  const restockCount = rollup.filter((x) => x.qty <= x.min).length;
  const filtered = rollup.filter((x) => !search || (x.subject_name || "").toLowerCase().includes(search.toLowerCase()));

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ShoppingBag size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Main Store</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 hidden sm:block">
              Combined overview of everything currently in Kitchen and Bar — goods are received directly into those stores now, not into Main.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={loadStock}
            className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: SUBJECT_LABEL_PLURAL, value: rollup.length, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "Total Units", value: totalUnits.toLocaleString(), color: "text-gray-900 dark:text-white", bg: "bg-gray-50 dark:bg-gray-800" },
          { label: "Needs Restock", value: restockCount, color: restockCount > 0 ? "text-orange-500" : "text-green-600 dark:text-green-400", bg: restockCount > 0 ? "bg-orange-50 dark:bg-orange-900/20" : "bg-green-50 dark:bg-green-900/20" },
        ].map((c) => (
          <div key={c.label} className={cn("rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-3 sm:p-4 text-center", c.bg)}>
            <p className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{c.label}</p>
            <p className={cn("text-xl sm:text-2xl font-black leading-tight truncate", c.color)}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${SUBJECT_LABEL_PLURAL.toLowerCase()}…`}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white" />
        </div>
      </div>

      {loading ? <Spinner color="blue" /> : rollup.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-8 py-16 text-center">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShoppingBag size={28} className="text-blue-400" />
          </div>
          <p className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-1">Nothing in Kitchen or Bar yet</p>
          <p className="text-gray-400 text-sm mb-5 max-w-xs mx-auto">
            Receive stock into Kitchen or Bar from Stock Levels or a Purchase Order — this view fills in once they have items.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3">{SUBJECT_LABEL}</th>
                <th className="text-center px-3 py-3">Kitchen + Bar Total</th>
                <th className="text-center px-3 py-3">Unit</th>
                <th className="text-center px-3 py-3">Min</th>
                <th className="text-center px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {pagedRows.map((item) => {
                const low = item.qty <= item.min;
                return (
                  <tr key={item.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{item.subject_name}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("font-black text-sm", low ? "text-orange-500" : "text-gray-900 dark:text-white")}>{item.qty}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">{item.unit || "—"}</td>
                    <td className="px-3 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{item.min}</td>
                    <td className="px-3 py-3 text-center">
                      {low
                        ? <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Low</span>
                        : <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">OK</span>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No {SUBJECT_LABEL_PLURAL.toLowerCase()} found</td></tr>}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing <strong>{(safePage - 1) * PAGE_SIZE + 1}</strong>–<strong>{Math.min(safePage * PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong>
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={safePage === 1}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">«</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…"); acc.push(p); return acc; }, [])
                  .map((p, i) => p === "…"
                    ? <span key={`e${i}`} className="px-2 text-gray-400 text-xs">…</span>
                    : <button key={p} onClick={() => setPage(p)}
                        className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                          p === safePage ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>{p}</button>
                  )}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">Next</button>
                <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">»</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Transfer Record (read-only log of stock movements) ───────────────────────
// Reads /api/stock/movements which is already populated by the backend
// transfer endpoint. Shows when, who, what, how much, from where to where.

function TransferRecordView() {
  const [movements, setMovements] = useState([]);
  const [stores, setStores] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("all"); // 'all' | from store id | to store id
  // Date range filter — inclusive on both ends. Default = last 30 days so
  // the page opens with a sensible window instead of the entire history.
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const daysAgoStr = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const [startDate, setStartDate] = useState(daysAgoStr(30));
  const [endDate, setEndDate] = useState(todayStr());
  const PAGE_SIZE = 30;
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.getStockMovements?.().catch(() => []),
      api.getStores().catch(() => []),
      api.getUsers?.().catch(() => []),
    ])
      .then(([m, s, u]) => { setMovements(m || []); setStores(s || []); setUsers(u || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const storeLabel = (id) => {
    if (!id) return "—";
    const s = stores.find((x) => x.id === id);
    if (s) return s.name;
    return STORE_LABELS[id] || id;
  };
  const userName = (id) => {
    if (!id) return "—";
    const u = users.find((x) => x.id === id);
    return u?.name || "—";
  };

  const transfers = movements.filter((m) => (m.type || "").toLowerCase() === "transfer");

  // Date filter: both ends inclusive. Compare against the date-only
  // portion of created_at so the endDate match includes its full day.
  const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : -Infinity;
  const endMs   = endDate   ? new Date(`${endDate}T23:59:59.999`).getTime() : Infinity;

  const filtered = transfers.filter((m) => {
    if (search) {
      const q = search.toLowerCase();
      const subjectName = (m.subject_name || "").toLowerCase();
      if (!subjectName.includes(q)) return false;
    }
    if (storeFilter !== "all") {
      if (m.from_store !== storeFilter && m.to_store !== storeFilter) return false;
    }
    if (m.created_at) {
      const t = new Date(m.created_at).getTime();
      if (!Number.isFinite(t) || t < startMs || t > endMs) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, storeFilter, startDate, endDate]);

  const fmtDate = (s) => {
    if (!s) return "—";
    try {
      const d = new Date(s);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch { return s; }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ArrowRight size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Transfer Record</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 hidden sm:block">
              History of every stock transfer between stores. Read-only.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportBtn
            onCSV={() => downloadCSV("transfer_record",
              ["Date", "Item", "From", "To", "Qty", "By", "Notes"],
              filtered.map((m) => [
                m.created_at, m.subject_name || "", storeLabel(m.from_store), storeLabel(m.to_store), m.quantity, userName(m.created_by), m.notes || "",
              ]))}
            onPrint={() => printReport({
              title: "Transfer Record",
              headers: ["Date", "Item", "From", "To", "Qty", "By"],
              rows: filtered.map((m) => [fmtDate(m.created_at), m.subject_name || "—", storeLabel(m.from_store), storeLabel(m.to_store), String(m.quantity), userName(m.created_by)]),
            })}
          />
          <button onClick={load} className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item name…"
            className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}
          className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500">
          <option value="all">All Stores</option>
          {Object.entries(STORE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {stores.filter((s) => !STORE_LABELS[s.id]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex items-center gap-1.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-2 py-1.5">
          <Calendar size={14} className="text-gray-400 ml-1" />
          <input type="date" value={startDate} max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-transparent dark:text-white text-xs focus:outline-none" />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" value={endDate} min={startDate} max={todayStr()}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-transparent dark:text-white text-xs focus:outline-none" />
        </div>
        <div className="flex gap-1">
          {[
            { label: "Today",  start: todayStr(),     end: todayStr() },
            { label: "7 days", start: daysAgoStr(6),  end: todayStr() },
            { label: "30 days", start: daysAgoStr(29), end: todayStr() },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => { setStartDate(preset.start); setEndDate(preset.end); }}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors",
                startDate === preset.start && endDate === preset.end
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
              )}
            >{preset.label}</button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
        {loading ? <Spinner color="indigo" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-3 py-3">Item</th>
                  <th className="text-center px-3 py-3">From → To</th>
                  <th className="text-center px-3 py-3">Qty</th>
                  <th className="text-left px-3 py-3">By</th>
                  <th className="text-left px-3 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {paged.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                    <td className="px-3 py-3 font-semibold text-gray-900 dark:text-white text-sm">{m.subject_name || "—"}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        <span className={cn("px-2 py-0.5 rounded-full font-semibold", STORE_COLORS[m.from_store] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200")}>
                          {storeLabel(m.from_store)}
                        </span>
                        <ArrowRight size={11} className="text-gray-400" />
                        <span className={cn("px-2 py-0.5 rounded-full font-semibold", STORE_COLORS[m.to_store] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200")}>
                          {storeLabel(m.to_store)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-gray-900 dark:text-white">{m.quantity}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">{userName(m.created_by)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">{m.notes || "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                    {transfers.length === 0 ? "No transfers recorded yet." : "No matches for the current filter."}
                  </td></tr>
                )}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Showing <strong>{(safePage - 1) * PAGE_SIZE + 1}</strong>–<strong>{Math.min(safePage * PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong>
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">Prev</button>
                  <span className="px-2 text-xs text-gray-500">{safePage} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40 transition-colors">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Add Stock Modal — single item quick-add to any store ─────────────────────
// Lighter sibling of ReceiveStockModal (which is built for multi-item
// deliveries). This is the right tool when you just need to drop one
// ingredient/product into stock without filling out a whole receiving
// document. Defaults to Kitchen; pass targetStore="bar" (or "main" for a
// legacy row) to target a different store.

function AddStockModal({ mode = "ingredient", catalog = [], outlets = [], initialOutletId = "", existingStock = [], targetStore = "kitchen", onClose, onAdded }) {
  const isProductMode = mode === "product";
  const SUBJECT_LABEL = isProductMode ? "Product" : "Ingredient";
  const storeLabel = STORE_LABELS[targetStore] || (targetStore.charAt(0).toUpperCase() + targetStore.slice(1));
  const isMainTarget = targetStore === "main";
  const [subjectId, setSubjectId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");  // unit currently being received (may differ from ingredient base unit)
  const [minQty, setMinQty] = useState("10");
  const [batchNumber, setBatchNumber] = useState("");
  // Inline "create new ingredient" path — when the user picks the __new__
  // option, they type a fresh name and we createIngredient(name, unit,
  // home_store=targetStore) before stocking. Lets Kitchen / Bar managers
  // add brand new items to their inventory without needing access to the
  // Products section.
  const [newName, setNewName] = useState("");
  const isNew = subjectId === "__new__";
  const [expiryDate, setExpiryDate] = useState("");
  // Main Store is global — the backend normalizes outlet_id to
  // MAIN_STORE_OUTLET regardless of what's sent. We still need to pass
  // SOMETHING (the field is required by the API), so feed the first
  // outlet's id silently and don't bother the user with an outlet
  // picker that doesn't change anything.
  const outletId = initialOutletId || outlets[0]?.id || "";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Units catalog — pulled from /api/units so the dropdown always
  // matches what's defined in Products → Units. Falls back to the
  // same minimal list other modals use when the catalog is empty.
  const [unitOptions, setUnitOptions] = useState(["pcs", "g", "kg", "ml", "L", "carton", "pack", "bottle"]);
  useEffect(() => {
    api.getUnits?.().then((units) => {
      const names = (units || []).map((u) => u.abbreviation || u.name).filter(Boolean);
      if (names.length) setUnitOptions(names);
    }).catch(() => {});
  }, []);

  // Existing stock for the picked subject — used to show the cashier the
  // current quantity so they don't accidentally OVERWRITE it. The update
  // endpoint upserts: we ADD on top of existing by default (mode='add')
  // but offer a 'replace' toggle in case they're correcting a count.
  // Scoped to the target store so kitchen/bar managers see their own
  // running total, not Main Store's.
  const [mergeMode, setMergeMode] = useState("add"); // 'add' | 'replace'
  const existing = useMemo(
    () => isNew ? null : existingStock.find((s) => {
      const sameSubject = isProductMode ? s.product_id === subjectId : s.ingredient_id === subjectId;
      const sameStore   = (s.store || "main") === targetStore;
      return sameSubject && sameStore;
    }),
    [existingStock, subjectId, isProductMode, targetStore, isNew]
  );
  const existingQty = existing ? Number(existing.quantity || 0) : 0;
  const selectedSubject = isNew ? null : catalog.find((c) => c.id === subjectId);
  const baseUnit = selectedSubject?.unit || (isProductMode ? "" : "pcs");

  // Default the unit to the picked ingredient's base unit whenever the
  // ingredient changes — and lock the merge-with-existing math to that
  // case (mixing units in 'Add to existing' would silently corrupt the
  // running total). 'Replace' mode lets the user override.
  useEffect(() => {
    if (baseUnit) setUnit(baseUnit);
  }, [baseUnit]);
  const unitMatchesBase = !baseUnit || unit === baseUnit;

  // Eligible ingredients for the target store:
  //   1. Tagged with home_store = targetStore (explicit), OR
  //   2. Already have a stock row in this store (legacy items that
  //      pre-date home_store but clearly belong here — e.g. items
  //      received via Requisition before the tag was introduced).
  // Without #2, a kitchen manager looking at items already visible in
  // their Stock Levels view wouldn't be able to pick them in Add Stock,
  // which was the bug reported on the screenshot.
  const stockedHere = useMemo(() => {
    const ids = new Set();
    for (const s of existingStock) {
      if ((s.store || "main") !== targetStore) continue;
      const id = isProductMode ? s.product_id : s.ingredient_id;
      if (id) ids.add(id);
    }
    return ids;
  }, [existingStock, targetStore, isProductMode]);

  const filteredCatalog = catalog.filter((c) => {
    if (!isProductMode) {
      const home = c.home_store || "main";
      const eligible = home === targetStore || stockedHere.has(c.id);
      if (!eligible) return false;
    }
    return !search || (c.name || "").toLowerCase().includes(search.toLowerCase());
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subjectId) { setError(`Pick a ${SUBJECT_LABEL.toLowerCase()}.`); return; }
    if (isNew) {
      if (isProductMode) { setError("Create new products in Products → All Products first."); return; }
      if (!newName.trim()) { setError("Enter a name for the new ingredient."); return; }
    }
    const qNum = parseFloat(quantity);
    if (!Number.isFinite(qNum) || qNum <= 0) { setError("Enter a quantity greater than 0."); return; }
    setSaving(true); setError("");
    try {
      // New ingredient path — create it first, then stock it. The new
      // ingredient is tagged with home_store = targetStore so subsequent
      // Add Stock sessions on the same store see it in the picker.
      let resolvedId = subjectId;
      let resolvedName = selectedSubject?.name;
      if (isNew) {
        const created = await api.createIngredient({
          name: newName.trim(),
          unit: unit || "pcs",
          cost_price: 0,
          active: true,
          home_store: targetStore,
        });
        resolvedId = created.id;
        resolvedName = created.name;
      }

      const finalQty = mergeMode === "add" ? existingQty + qNum : qNum;
      const payload = {
        outlet_id: outletId,
        store: targetStore,
        quantity: finalQty,
        min_quantity: parseFloat(minQty) || 10,
        batch_number: batchNumber || null,
        expiry_date: expiryDate || null,
      };
      if (isProductMode) payload.product_id = resolvedId;
      else payload.ingredient_id = resolvedId;
      await api.updateStock(payload);

      // Unit override (existing ingredient only — new ingredients already
      // got the chosen unit at creation time). Persist when the picked
      // unit differs from the ingredient's current base unit.
      if (!isNew && !isProductMode && unit && unit !== baseUnit) {
        try { await api.updateIngredient(resolvedId, { unit }); } catch (_) {}
      }

      onAdded(`${resolvedName || SUBJECT_LABEL} stock ${isNew ? "created with" : (mergeMode === "add" ? "increased by" : "set to")} ${qNum} ${unit || baseUnit || "pcs"}.`);
    } catch (err) {
      setError(err.message || "Failed to add stock.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Add Stock</h3>
            <p className="text-xs text-gray-400 mt-0.5">Single {SUBJECT_LABEL.toLowerCase()} — quick entry to {storeLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className={cn(
            "border rounded-xl px-3 py-2 text-xs flex items-center gap-2",
            isMainTarget
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
              : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
          )}>
            <ShoppingBag size={14} />
            <span>
              {isMainTarget
                ? <>Stock will be added to <strong>Main Store</strong> — a legacy row only; Main no longer feeds Kitchen/Bar automatically.</>
                : <>Adding directly to <strong>{storeLabel}</strong>.</>
              }
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">{SUBJECT_LABEL}</label>
            {/* Single combo control: search bar on top, results list below.
                One bordered container so the search clearly drives the list.
                Selection highlights inline — no second 'picker' widget. */}
            <div className={cn(
              "border-2 rounded-xl overflow-hidden",
              isNew ? "border-emerald-500 dark:border-emerald-600" : "border-gray-200 dark:border-gray-700"
            )}>
              <div className="relative bg-white dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${SUBJECT_LABEL.toLowerCase()}…`}
                  className="w-full pl-9 pr-3 py-2 bg-transparent dark:text-white text-xs focus:outline-none" />
                {search && (
                  <button type="button" onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    title="Clear">
                    <X size={12} />
                  </button>
                )}
              </div>
              <ul className="max-h-44 overflow-y-auto bg-white dark:bg-gray-700">
                {filteredCatalog.map((c) => {
                  const selected = c.id === subjectId;
                  return (
                    <li key={c.id}>
                      <button type="button"
                        onClick={() => { setSubjectId(c.id); setNewName(""); }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm transition-colors",
                          selected
                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold"
                            : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                        )}>
                        {c.name}{c.unit ? <span className="text-xs text-gray-400 ml-1">({c.unit})</span> : null}
                      </button>
                    </li>
                  );
                })}
                {filteredCatalog.length === 0 && !isProductMode && (
                  <li className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500 text-center">
                    {search
                      ? <>No match for <strong>"{search}"</strong>.</>
                      : <>No ingredients tagged for <strong>{storeLabel}</strong> yet — use the option below to create one.</>
                    }
                  </li>
                )}
                {!isProductMode && (
                  <li className="border-t border-gray-200 dark:border-gray-600">
                    <button type="button"
                      onClick={() => { setSubjectId("__new__"); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm font-bold transition-colors",
                        isNew
                          ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                          : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                      )}>
                      + Add new ingredient to {storeLabel}
                    </button>
                  </li>
                )}
              </ul>
            </div>
            {!subjectId && (
              <p className="mt-1.5 text-[11px] text-gray-400">Pick an ingredient from the list, or add a brand new one.</p>
            )}
          </div>

          {isNew && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                New Ingredient Name
              </label>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Smirnoff Vodka 1L"
                autoFocus
                className="w-full px-3 py-2.5 border-2 border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-900/20 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-600"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Tagged as <strong>Home Store: {storeLabel}</strong>. Pick the unit and quantity below — both are required.
              </p>
            </div>
          )}

          {subjectId && !isNew && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              Current {storeLabel} stock: <span className="font-bold text-gray-800 dark:text-gray-200">{existingQty} {baseUnit}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Quantity</label>
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <input required type="number" min="0" step="0.01"
                value={quantity} onChange={(e) => setQuantity(e.target.value)}
                placeholder="0" inputMode="decimal" autoFocus
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-500" />
              <select value={unit} onChange={(e) => setUnit(e.target.value)}
                className="px-2 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-500">
                {/* Show the ingredient's base unit first so it stays the
                    default; include any other catalog units so a venue
                    receiving in cartons / packs can record that here. */}
                {baseUnit && !unitOptions.includes(baseUnit) && <option value={baseUnit}>{baseUnit}</option>}
                {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            {existing && !unitMatchesBase && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                Existing stock is tracked in <strong>{baseUnit}</strong>. Saving will change the tracked unit to <strong>{unit}</strong> going forward.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Min Qty {baseUnit ? <span className="text-gray-400 font-normal">({baseUnit})</span> : null}
            </label>
            <input type="number" min="0" step="0.01"
              value={minQty} onChange={(e) => setMinQty(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          {existing && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Apply as</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMergeMode("add")}
                  className={cn("flex-1 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-colors",
                    mergeMode === "add" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400")}>
                  Add to existing
                  <span className="block text-[10px] font-normal opacity-75 mt-0.5">{existingQty} + {parseFloat(quantity) || 0} = {existingQty + (parseFloat(quantity) || 0)}</span>
                </button>
                <button type="button" onClick={() => setMergeMode("replace")}
                  className={cn("flex-1 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-colors",
                    mergeMode === "replace" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400")}>
                  Replace
                  <span className="block text-[10px] font-normal opacity-75 mt-0.5">overwrite to {parseFloat(quantity) || 0}</span>
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Batch Number (Optional)</label>
            <input type="text" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g. BATCH-2025-001"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Expiry Date (Optional)</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
              {saving
                ? (isNew ? "Creating…" : "Adding…")
                : (isNew ? `Create & Add to ${storeLabel}` : "Add Stock")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ─── Transfer Stock Modal (Main → Kitchen / Bar / any) ────────────────────────

function TransferStockModal({ item, fromStore = "main", onClose, onTransferred }) {
  const baseUnit = item?.unit || "unit";
  const [stores, setStores] = useState([]);
  const [toStore, setToStore] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(baseUnit);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Units catalog — same source as every other modal.
  const [unitOptions, setUnitOptions] = useState(["pcs", "g", "kg", "ml", "L", "carton", "pack", "bottle"]);
  useEffect(() => {
    api.getUnits?.().then((units) => {
      const names = (units || []).map((u) => u.abbreviation || u.name).filter(Boolean);
      if (names.length) setUnitOptions(names);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getStores().then((all) => {
      const dests = all.filter((s) => s.id !== fromStore);
      setStores(dests);
      if (dests.length > 0) setToStore(dests[0].id);
    }).catch(() => {});
  }, [fromStore]);

  const available = Number(item?.quantity || 0);
  const qtyNum = parseFloat(quantity) || 0;
  // Transfer happens in the ingredient's own unit — the hardcoded
  // packaging dropdown (Dozen/Pack/Box/Carton/Case) caused confusion
  // because those labels aren't tied to anything in the Products
  // module. If a venue wants to manage packaging conversions, that
  // belongs in the unit catalog (Settings → Units), not bolted onto
  // this modal.
  const effective = +qtyNum.toFixed(4);
  const over = effective > available;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!toStore || effective <= 0) {
      setError("Pick a destination store and a quantity greater than 0.");
      return;
    }
    setSaving(true); setError("");
    try {
      await api.transferStock({
        ingredient_id: item.ingredient_id,
        outlet_id: item.outlet_id,
        from_store: fromStore,
        to_store: toStore,
        quantity: effective,
        notes: notes || null,
      });

      // Override the ingredient's unit when the user picked something
      // different from the base unit. Applies after the transfer so a
      // failed transfer doesn't accidentally rewrite the unit.
      if (item?.ingredient_id && unit && unit !== baseUnit) {
        try { await api.updateIngredient(item.ingredient_id, { unit }); } catch (_) {}
      }

      const destName = stores.find((s) => s.id === toStore)?.name || toStore;
      onTransferred(`Transferred ${effective} ${unit || baseUnit} of ${item.ingredient_name} → ${destName}`);
    } catch (err) {
      setError(err.message || "Transfer failed.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Transfer Stock</h3>
            <p className="text-xs text-gray-400 mt-0.5">{item.ingredient_name} · {available} {baseUnit} on hand</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">To Store</label>
            <select value={toStore} onChange={(e) => setToStore(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500">
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Quantity</label>
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <input type="number" min="0" step="0.01"
                value={quantity} onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                autoFocus
                inputMode="decimal"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
              <select value={unit} onChange={(e) => setUnit(e.target.value)}
                className="px-2 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500">
                {baseUnit && !unitOptions.includes(baseUnit) && <option value={baseUnit}>{baseUnit}</option>}
                {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            {unit !== baseUnit && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                Saving will change the ingredient's tracked unit from <strong>{baseUnit}</strong> to <strong>{unit}</strong>.
              </p>
            )}
            {qtyNum > 0 && (
              <p className={cn("text-xs mt-2", over ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400")}>
                Will transfer <span className="font-bold">{effective} {baseUnit}</span>
                {over && ` — exceeds ${available} on hand`}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Notes (optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. for tonight's service"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? "Transferring…" : "Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stores View (Store Management) ──────────────────────────────────────────

function StoresView() {
  const [stores, setStores] = useState([]);
  const [stockCounts, setStockCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editStore, setEditStore] = useState(null);
  const [toast, setToast] = useState(null);

  const loadStores = () => {
    setLoading(true);
    Promise.all([api.getStores(), api.getStock()])
      .then(([s, stock]) => {
        setStores(s);
        const counts = {};
        stock.forEach(item => { counts[item.store] = (counts[item.store] || 0) + 1; });
        setStockCounts(counts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.getStores().then(s => {
      // Auto-initialize whichever of the three default stores (main/
      // kitchen/bar) are missing — not just when the list is totally
      // empty. A deployment that only ever had "main" created (e.g.
      // before kitchen/bar existed, or a partial init) would otherwise
      // never get kitchen/bar auto-created, silently breaking anything
      // that depends on them existing as real Store records (like the
      // Transfer modal's destination picker). init-stores is per-store
      // idempotent, so this is safe to call whenever any are missing.
      const existingIds = new Set(s.map(x => x.id));
      const missingDefaults = ["main", "kitchen", "bar"].some(id => !existingIds.has(id));
      if (missingDefaults) {
        setInitializing(true);
        api.initStores()
          .then(() => loadStores())
          .catch(console.error)
          .finally(() => setInitializing(false));
      } else {
        api.getStock().then(stock => {
          setStores(s);
          const counts = {};
          stock.forEach(item => { counts[item.store] = (counts[item.store] || 0) + 1; });
          setStockCounts(counts);
          setLoading(false);
        }).catch(() => { setStores(s); setLoading(false); });
      }
    }).catch(() => setLoading(false));
  }, []); // eslint-disable-line

  const handleDelete = async (store) => {
    if (!window.confirm(`Delete "${store.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteStore(store.id);
      setToast({ msg: `"${store.name}" deleted.`, type: "success" });
      loadStores();
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Store size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Store Management</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 hidden sm:block">Global stores shared across all outlets. Main Store is built-in and protected.</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors flex-shrink-0">
          <Plus size={16} /> New Store
        </button>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {initializing && (
        <div className="flex items-center gap-3 p-4 mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-300">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Initializing default stores…
        </div>
      )}

      {loading && !initializing ? <Spinner color="indigo" /> : !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Store Name</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Color</th>
                <th className="text-center px-4 py-3">Total Stock Items</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {stores.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">No stores yet.</td></tr>
              )}
              {stores.map(store => (
                <tr key={store.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">{store.name}</span>
                      {store.is_main && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">DEFAULT</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", store.is_main ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300")}>
                      {store.is_main ? "Main (Warehouse)" : "Child Store"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize", colorBadge(store.color))}>
                      {store.color || "indigo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{(stockCounts[store.id] || 0).toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {store.is_main ? (
                      <span className="text-xs text-gray-400 italic">Protected</span>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setEditStore(store)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                          <Edit3 size={15} />
                        </button>
                        <button onClick={() => handleDelete(store)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <StoreFormModal
          onClose={() => setShowCreate(false)}
          onSaved={(msg) => { setShowCreate(false); loadStores(); setToast({ msg, type: "success" }); }}
        />
      )}

      {editStore && (
        <StoreFormModal
          store={editStore}
          onClose={() => setEditStore(null)}
          onSaved={(msg) => { setEditStore(null); loadStores(); setToast({ msg, type: "success" }); }}
        />
      )}
    </div>
  );
}

function StoreFormModal({ store, onClose, onSaved }) {
  const isEdit = !!store;
  const [name, setName] = useState(store?.name || "");
  const [color, setColor] = useState(store?.color || "indigo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setError("Store name is required."); return; }
    setSaving(true); setError("");
    try {
      if (isEdit) {
        await api.updateStore(store.id, { name: name.trim(), color });
        onSaved(`"${name.trim()}" updated.`);
      } else {
        await api.createStore({ name: name.trim(), color });
        onSaved(`"${name.trim()}" created.`);
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">{isEdit ? "Edit Store" : "Create New Store"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Store Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pastry Kitchen"
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Badge Color</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map(c => (
                <button key={c.value} onClick={() => setColor(c.value)}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-semibold transition-all", colorBadge(c.value),
                    color === c.value ? "ring-2 ring-offset-1 ring-indigo-500" : "opacity-60 hover:opacity-100")}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Store"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Entry point ───────────────────────────────────────────────────────────────
export default function InventorySection({ view = "stock" }) {
  const { user } = useAuth();
  const can = (p) => userHasPermission(user, p);

  if (view === "main-store")      return can("view_stores")                                          ? <MainStoreView />      : <AccessDenied label="Main Store" />;
  if (view === "transfer-record") return (can("view_transfer_record") || can("view_stores"))         ? <TransferRecordView /> : <AccessDenied label="Transfer Record" />;
  if (view === "stores")          return can("view_stores")              ? <StoresView />         : <AccessDenied label="Store Management" />;
  if (view === "stock-count")     return can("update_stock")             ? <StockCountView />     : <AccessDenied label="Stock Count" />;
  if (view === "update-stock")    return can("update_stock")             ? <UpdateStockView />    : <AccessDenied label="Update Stock" />;
  if (view === "transfer-stock")  return can("transfer_stock")           ? <TransferStockView />  : <AccessDenied label="Transfer Stock" />;
  if (view === "reorder")         return can("view_reorder_alerts")      ? <ReorderView />        : <AccessDenied label="Reorder Alerts" />;
  if (view === "waste")           return can("record_waste")             ? <WasteView />          : <AccessDenied label="Waste Recording" />;
  if (view === "valuation")       return can("view_stock_valuation")     ? <ValuationView />      : <AccessDenied label="Stock Valuation" />;
  if (view === "consolidated")    return can("view_consolidated_stock")  ? <ConsolidatedView />   : <AccessDenied label="Consolidated View" />;
  return can("view_inventory") ? <StockLevelsView /> : <AccessDenied label="Stock Levels" />;
}
