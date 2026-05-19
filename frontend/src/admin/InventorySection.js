import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck,
  Edit3, RefreshCw, Search, X, Trash2, Plus, Barcode,
  TrendingDown, LayoutGrid, DollarSign, PackageX, Calendar,
  ShoppingBag, Lock,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";
import { useAuth } from "../context/AuthContext";

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

function StockLevelsView() {
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updateModal, setUpdateModal] = useState(null);
  const [form, setForm] = useState({ product_id: "", outlet_id: "", quantity: "", min_quantity: "10", batch_number: "", expiry_date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    Promise.all([api.getStock(), api.getProducts(), api.getOutlets()])
      .then(([s, p, o]) => { setStock(s); setProducts(p); setOutlets(o); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const productName = (id) => products.find((p) => p.id === id)?.name || id;
  const outletName = (id) => outlets.find((o) => o.id === id)?.name || id;
  const isLow = (item) => parseInt(item.quantity) <= parseInt(item.min_quantity || 10);
  const isExpiring = (item) => {
    if (!item.expiry_date) return false;
    const days = (new Date(item.expiry_date) - new Date()) / 86400000;
    return days <= 30;
  };
  const isExpired = (item) => item.expiry_date && new Date(item.expiry_date) < new Date();

  const displayed = tab === "low" ? stock.filter(isLow)
    : tab === "expiring" ? stock.filter((s) => isExpiring(s) || isExpired(s))
    : stock;
  const totalStockPages = Math.max(1, Math.ceil(displayed.length / STOCK_PAGE_SIZE));
  const pagedStock = displayed.slice((page - 1) * STOCK_PAGE_SIZE, page * STOCK_PAGE_SIZE);

  const openUpdate = (item) => {
    setForm({
      product_id: item.product_id, outlet_id: item.outlet_id,
      quantity: item.quantity, min_quantity: item.min_quantity || 10,
      batch_number: item.batch_number || "", expiry_date: item.expiry_date || "",
    });
    setError("");
    setUpdateModal(item);
  };

  const handleUpdate = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await api.updateStock({
        product_id: form.product_id, outlet_id: form.outlet_id,
        quantity: parseInt(form.quantity), min_quantity: parseInt(form.min_quantity),
        batch_number: form.batch_number || null,
        expiry_date: form.expiry_date || null,
      });
      setUpdateModal(null); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const lowCount = stock.filter(isLow).length;
  const expiringCount = stock.filter((s) => isExpiring(s) || isExpired(s)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Stock Levels</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {stock.length} entries · <span className="text-orange-500 font-semibold">{lowCount} low</span>
            {expiringCount > 0 && <> · <span className="text-red-500 font-semibold">{expiringCount} expiring</span></>}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

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
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3">Outlet</th>
                  <th className="text-center px-3 py-3">Qty</th>
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
                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{productName(item.product_id)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm whitespace-nowrap">{outletName(item.outlet_id)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={cn("font-bold text-sm", low ? "text-orange-500" : "text-gray-900 dark:text-white")}>{item.quantity}</span>
                      </td>
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
                        <button onClick={() => openUpdate(item)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Update</button>
                      </td>
                    </tr>
                  );
                })}
                {displayed.length === 0 && <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400 text-sm">No stock records</td></tr>}
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

      {updateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Update Stock</h3>
              <button onClick={() => setUpdateModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6">
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-gray-900 dark:text-white">{productName(form.product_id)}</p>
                  <p className="text-gray-500 dark:text-gray-400">{outletName(form.outlet_id)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">New Quantity</label>
                    <input required type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Min Quantity</label>
                    <input required type="number" min="0" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
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
  const { products, outlets, loading } = useBaseData();
  const [stock, setStock] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [scanMode, setScanMode] = useState(false);
  const [scanBuffer, setScanBuffer] = useState("");
  const [lastScanned, setLastScanned] = useState(null);
  const [page, setPage] = useState(1);
  const scanRef = useRef(null);
  const scanTimeout = useRef(null);

  useEffect(() => {
    if (outlets.length > 0 && !outletId) setOutletId(outlets[0].id);
  }, [outlets, outletId]);

  useEffect(() => {
    if (!outletId) return;
    api.getStock(outletId).then(setStock).catch(console.error);
    setCounts({});
    setPage(1);
  }, [outletId]);

  useEffect(() => {
    if (scanMode && scanRef.current) scanRef.current.focus();
  }, [scanMode]);

  // Barcode scanner sends characters very fast then Enter
  const handleScanKey = (e) => {
    if (e.key === "Enter") {
      const code = scanBuffer.trim();
      setScanBuffer("");
      if (!code) return;
      const product = products.find((p) => p.barcode === code);
      if (product) {
        setLastScanned(product.name);
        setCounts((prev) => ({ ...prev, [product.id]: String((parseInt(prev[product.id] || 0) || 0) + 1) }));
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

  const systemQty = (pid) => stock.find((s) => s.product_id === pid)?.quantity ?? "—";
  const minQtyFor = (pid) => stock.find((s) => s.product_id === pid)?.min_quantity ?? 10;
  const variance = (pid) => {
    const c = counts[pid];
    if (c === "" || c == null) return null;
    const sys = systemQty(pid);
    if (sys === "—") return null;
    return parseInt(c) - sys;
  };

  const filtered = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const filledCount = Object.values(counts).filter((v) => v !== "" && v != null).length;
  const totalCountPages = Math.max(1, Math.ceil(filtered.length / COUNT_PAGE_SIZE));
  const pagedCount = filtered.slice((page - 1) * COUNT_PAGE_SIZE, page * COUNT_PAGE_SIZE);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        products
          .filter((p) => counts[p.id] !== "" && counts[p.id] != null)
          .map((p) => api.updateStock({
            product_id: p.id, outlet_id: outletId,
            quantity: parseInt(counts[p.id]), min_quantity: minQtyFor(p.id),
          }))
      );
      const refreshed = await api.getStock(outletId);
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ClipboardCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Stock Count</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Enter physical counts to reconcile with system quantities</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanMode((v) => !v)}
            className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors",
              scanMode ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200")}
          >
            <Barcode size={16} /> {scanMode ? "Scan Mode ON" : "Scan Mode"}
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

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 dark:text-white" />
        </div>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 dark:text-white">
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {filledCount > 0 && (
          <button onClick={() => setCounts({})}
            className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Clear
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <th className="text-left px-6 py-3">Product</th>
              <th className="text-center px-4 py-3">System Qty</th>
              <th className="text-center px-4 py-3 w-36">Counted</th>
              <th className="text-center px-4 py-3">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">No products found</td></tr>
            )}
            {pagedCount.map((p) => {
              const v = variance(p.id);
              const counted = counts[p.id] ?? "";
              return (
                <tr key={p.id} className={cn("transition-colors", counted !== "" ? "bg-indigo-50/40 dark:bg-indigo-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-800")}>
                  <td className="px-6 py-3">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{p.name}</p>
                    {p.barcode && <p className="text-xs text-gray-400 font-mono">{p.barcode}</p>}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">{systemQty(p.id)}</td>
                  <td className="px-4 py-3 text-center">
                    <input type="number" min="0" value={counted}
                      onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="—"
                      className="w-24 px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm text-center font-mono focus:outline-none focus:border-indigo-500" />
                  </td>
                  <td className="px-4 py-3 text-center">
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
              {(page - 1) * COUNT_PAGE_SIZE + 1}–{Math.min(page * COUNT_PAGE_SIZE, filtered.length)} of {filtered.length} products
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
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400"><span className="font-bold text-gray-900 dark:text-white">{filledCount}</span> of {products.length} products counted</p>
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
  const { products, outlets, loading } = useBaseData();
  const [stock, setStock] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ quantity: "", min_quantity: "", batch_number: "", expiry_date: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (outlets.length > 0 && !outletId) setOutletId(outlets[0].id);
  }, [outlets, outletId]);

  useEffect(() => {
    if (!outletId) return;
    api.getStock(outletId).then(setStock).catch(console.error);
    setEditingId(null);
  }, [outletId]);

  const stockFor = (pid) => stock.find((s) => s.product_id === pid);

  const openEdit = (p) => {
    const s = stockFor(p.id);
    setEditForm({ quantity: s?.quantity ?? 0, min_quantity: s?.min_quantity ?? 10, batch_number: s?.batch_number ?? "", expiry_date: s?.expiry_date ?? "" });
    setEditingId(p.id);
  };

  const handleSave = async (pid) => {
    setSaving(true);
    try {
      await api.updateStock({
        product_id: pid, outlet_id: outletId,
        quantity: parseInt(editForm.quantity), min_quantity: parseInt(editForm.min_quantity),
        batch_number: editForm.batch_number || null,
        expiry_date: editForm.expiry_date || null,
      });
      const refreshed = await api.getStock(outletId);
      setStock(refreshed);
      setEditingId(null);
      setToast({ msg: "Stock updated successfully.", type: "success" });
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page when search or outlet changes
  useEffect(() => { setPage(1); setEditingId(null); }, [search, outletId]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Edit3 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Update Stock</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Adjust quantities, min levels, batch numbers and expiry dates per outlet</p>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-white" />
        </div>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-white">
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} product{filtered.length !== 1 ? "s" : ""}
          {totalPages > 1 && ` · page ${safePage} of ${totalPages}`}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <th className="text-left px-6 py-3">Product</th>
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
              <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400 text-sm">No products found</td></tr>
            )}
            {paginated.map((p) => {
              const s = stockFor(p.id);
              const editing = editingId === p.id;
              const inp = "w-20 px-2 py-1.5 border-2 border-blue-400 rounded-xl text-sm text-center font-mono focus:outline-none bg-white dark:bg-gray-700 dark:text-white";
              return (
                <tr key={p.id} className={cn("transition-colors", editing ? "bg-blue-50/40 dark:bg-blue-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-800")}>
                  <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white text-sm">{p.name}</td>
                  <td className="px-3 py-3 text-center font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">{s?.quantity ?? "—"}</td>
                  <td className="px-3 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{s?.min_quantity ?? "—"}</td>
                  <td className="px-3 py-3 text-center">
                    {editing ? <input type="number" min="0" value={editForm.quantity} onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))} className={inp} />
                      : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {editing ? <input type="number" min="0" value={editForm.min_quantity} onChange={(e) => setEditForm((f) => ({ ...f, min_quantity: e.target.value }))} className={inp} />
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

// ─── Transfer Stock ────────────────────────────────────────────────────────────
function TransferStockView() {
  const { products, outlets, loading } = useBaseData();
  const [allStock, setAllStock] = useState([]);
  const [form, setForm] = useState({ product_id: "", from_outlet: "", to_outlet: "", quantity: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (outlets.length >= 2) {
      setForm((f) => ({ ...f, from_outlet: outlets[0].id, to_outlet: outlets[1].id }));
    }
    if (outlets.length > 0) {
      api.getStock().then(setAllStock).catch(console.error);
    }
  }, [outlets]);

  const stockAt = (pid, oid) => allStock.find((s) => s.product_id === pid && s.outlet_id === oid)?.quantity ?? 0;
  const minQtyAt = (pid, oid) => allStock.find((s) => s.product_id === pid && s.outlet_id === oid)?.min_quantity ?? 10;
  const fromQty = form.product_id && form.from_outlet ? stockAt(form.product_id, form.from_outlet) : null;
  const toQty = form.product_id && form.to_outlet ? stockAt(form.product_id, form.to_outlet) : null;
  const transferQty = parseInt(form.quantity) || 0;
  const canTransfer = form.product_id && form.from_outlet && form.to_outlet
    && form.from_outlet !== form.to_outlet && transferQty > 0
    && fromQty != null && transferQty <= fromQty;

  const handleTransfer = async () => {
    if (!canTransfer) return;
    setSaving(true);
    try {
      await Promise.all([
        api.updateStock({ product_id: form.product_id, outlet_id: form.from_outlet, quantity: fromQty - transferQty, min_quantity: minQtyAt(form.product_id, form.from_outlet) }),
        api.updateStock({ product_id: form.product_id, outlet_id: form.to_outlet, quantity: toQty + transferQty, min_quantity: minQtyAt(form.product_id, form.to_outlet) }),
      ]);
      const refreshed = await api.getStock();
      setAllStock(refreshed);
      setForm((f) => ({ ...f, product_id: "", quantity: "" }));
      setToast({ msg: `Transferred ${transferQty} units successfully.`, type: "success" });
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Product</label>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
                className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
            </div>
            <select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value, quantity: "" }))}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-emerald-400 bg-white dark:bg-gray-800 dark:text-white">
              <option value="">Select product…</option>
              {filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
              Quantity {fromQty != null && <span className="normal-case font-normal text-gray-400 ml-1">(available: {fromQty})</span>}
            </label>
            <input type="number" min="1" max={fromQty ?? undefined} value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="0"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
          </div>
          <button onClick={handleTransfer} disabled={!canTransfer || saving}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? "Transferring…" : "Confirm Transfer"}
          </button>
        </div>

        {form.product_id && form.from_outlet && form.to_outlet && form.from_outlet !== form.to_outlet && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 dark:text-white mb-4">Preview</h2>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{products.find((p) => p.id === form.product_id)?.name}</p>
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
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getLowStock(), api.getProducts(), api.getOutlets()])
      .then(([ls, p, o]) => { setLowStock(ls); setProducts(p); setOutlets(o); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const productName = (id) => products.find((p) => p.id === id)?.name || id;
  const outletName = (id) => outlets.find((o) => o.id === id)?.name || id;
  const deficit = (item) => Math.max(0, (item.min_quantity || 10) * 2 - parseInt(item.quantity || 0));

  if (loading) return <Spinner color="orange" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <TrendingDown size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Reorder Alerts</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{lowStock.length} item{lowStock.length !== 1 ? "s" : ""} at or below minimum stock level</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
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
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3">Outlet</th>
                <th className="text-center px-3 py-3">Current</th>
                <th className="text-center px-3 py-3">Min</th>
                <th className="text-center px-3 py-3">Suggested Order</th>
                <th className="text-center px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {lowStock.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{productName(item.product_id)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{outletName(item.outlet_id)}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="font-bold text-orange-500">{item.quantity}</span>
                  </td>
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
  const [outletId, setOutletId] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_id: "", outlet_id: "", quantity: "", reason: "Spoilage", notes: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <PackageX size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Waste Recording</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Log spoilage, damage, and other stock losses</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors">
          <Plus size={16} /> Record Waste
        </button>
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
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white">
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
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
                  <td className="px-3 py-3 text-center font-bold text-red-500">{e.quantity}</td>
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
                  <input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-red-400" />
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
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = (oid) => {
    setLoading(true);
    api.getStockValuation(oid || undefined)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.getOutlets().then((o) => { setOutlets(o); load(""); }).catch(console.error);
  }, []);

  useEffect(() => { load(outletId); setPage(1); }, [outletId]);
  useEffect(() => { setPage(1); }, [search]);

  const outletName = (id) => outlets.find((o) => o.id === id)?.name || id;
  const items = data?.items || [];
  const filtered = items.filter((i) => !search || i.product_name.toLowerCase().includes(search.toLowerCase()));
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
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Cost and retail value of current inventory</p>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Cost Value", value: formatCurrency(data.total_cost_value), color: "blue" },
            { label: "Total Retail Value", value: formatCurrency(data.total_retail_value), color: "green" },
            { label: "Potential Profit", value: formatCurrency(data.potential_profit), color: "purple" },
          ].map((c) => (
            <div key={c.label} className={`bg-${c.color}-50 dark:bg-${c.color}-900/20 border-2 border-${c.color}-100 dark:border-${c.color}-800 rounded-2xl p-4`}>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{c.label}</p>
              <p className={`text-2xl font-black text-${c.color}-600 dark:text-${c.color}-400`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white" />
        </div>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white">
          <option value="">All Outlets</option>
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
        {loading ? <Spinner color="green" /> : (
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3">Outlet</th>
                <th className="text-center px-3 py-3">Qty</th>
                <th className="text-right px-3 py-3">Cost Price</th>
                <th className="text-right px-3 py-3">Sell Price</th>
                <th className="text-right px-3 py-3">Cost Value</th>
                <th className="text-right px-3 py-3">Retail Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {paginated.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{item.product_name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{outletName(item.outlet_id)}</td>
                  <td className="px-3 py-3 text-center font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">{item.quantity}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-600 dark:text-gray-300">{formatCurrency(item.cost_price)}</td>
                  <td className="px-3 py-3 text-right text-sm text-gray-600 dark:text-gray-300">{formatCurrency(item.selling_price)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-blue-600 dark:text-blue-400 text-sm">{formatCurrency(item.cost_value)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-green-600 dark:text-green-400 text-sm">{formatCurrency(item.retail_value)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400 text-sm">No stock valuation data</td></tr>}
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
  const allRows = (data?.products || []).filter(
    (p) => !search || p.product_name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(allRows.length / CONSOLIDATED_PAGE_SIZE));
  const productRows = allRows.slice((page - 1) * CONSOLIDATED_PAGE_SIZE, page * CONSOLIDATED_PAGE_SIZE);
  const isLow = (info) => info && info.quantity <= info.min_quantity;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Consolidated Stock</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">All products across all outlets side by side</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="relative max-w-xs mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
        {loading ? <Spinner color="violet" /> : (
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-3 sticky left-0 bg-white dark:bg-gray-800">Product</th>
                {outlets.map((o) => <th key={o.id} className="text-center px-4 py-3 whitespace-nowrap">{o.name}</th>)}
                <th className="text-center px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {productRows.map((row) => (
                <tr key={row.product_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm sticky left-0 bg-white dark:bg-gray-800">{row.product_name}</td>
                  {outlets.map((o) => {
                    const info = row.outlets[o.id];
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
              {productRows.length === 0 && <tr><td colSpan={outlets.length + 2} className="px-6 py-10 text-center text-gray-400 text-sm">No stock data</td></tr>}
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

// ─── Entry point ───────────────────────────────────────────────────────────────
export default function InventorySection({ view = "stock" }) {
  const { user } = useAuth();
  const isPrivileged = user?.role === "admin" || user?.role === "manager";
  const perms = user?.permissions || [];
  const can = (p) => isPrivileged || perms.includes(p);

  if (view === "stock-count")    return can("update_stock")             ? <StockCountView />    : <AccessDenied label="Stock Count" />;
  if (view === "update-stock")   return can("update_stock")             ? <UpdateStockView />   : <AccessDenied label="Update Stock" />;
  if (view === "transfer-stock") return can("transfer_stock")           ? <TransferStockView /> : <AccessDenied label="Transfer Stock" />;
  if (view === "reorder")        return can("view_reorder_alerts")      ? <ReorderView />       : <AccessDenied label="Reorder Alerts" />;
  if (view === "waste")          return can("record_waste")             ? <WasteView />         : <AccessDenied label="Waste Recording" />;
  if (view === "valuation")      return can("view_stock_valuation")     ? <ValuationView />     : <AccessDenied label="Stock Valuation" />;
  if (view === "consolidated")   return can("view_consolidated_stock")  ? <ConsolidatedView />  : <AccessDenied label="Consolidated View" />;
  return can("view_inventory") ? <StockLevelsView /> : <AccessDenied label="Stock Levels" />;
}
