import React, { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck,
  Edit3, RefreshCw, Search, X,
} from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

// --- Shared helpers -----------------------------------------------------------
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
      type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
    )}>
      {type === "success"
        ? <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
        : <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />}
      <p className={cn("text-sm font-medium", type === "success" ? "text-green-700" : "text-red-700")}>{msg}</p>
      <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={16} /></button>
    </div>
  );
}

// --- Stock Levels -------------------------------------------------------------
function StockLevelsView() {
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updateModal, setUpdateModal] = useState(null);
  const [form, setForm] = useState({ product_id: "", outlet_id: "", quantity: "", min_quantity: "10" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");

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
  const displayed = tab === "low" ? stock.filter(isLow) : stock;

  const openUpdate = (item) => {
    setForm({ product_id: item.product_id, outlet_id: item.outlet_id, quantity: item.quantity, min_quantity: item.min_quantity || 10 });
    setError("");
    setUpdateModal(item);
  };

  const handleUpdate = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await api.updateStock({ product_id: form.product_id, outlet_id: form.outlet_id, quantity: parseInt(form.quantity), min_quantity: parseInt(form.min_quantity) });
      setUpdateModal(null); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const lowCount = stock.filter(isLow).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Stock Levels</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{stock.length} entries · <span className="text-orange-500 font-semibold">{lowCount} low</span></p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {lowCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl mb-4">
          <AlertTriangle size={18} className="text-orange-500 flex-shrink-0" />
          <p className="text-orange-700 text-sm font-medium">{lowCount} item{lowCount > 1 ? "s are" : " is"} running low on stock.</p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {[["all", "All Stock"], ["low", `Low Stock (${lowCount})`]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              tab === v ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-gray-700")}>
            {l}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
              {displayed.map((item, i) => {
                const low = isLow(item);
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{productName(item.product_id)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{outletName(item.outlet_id)}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn("text-sm font-bold", low ? "text-orange-500" : "text-gray-700 dark:text-gray-200")}>
                          {item.quantity} / {item.min_quantity || 10}
                        </span>
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", low ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700")}>
                          {low ? "Low" : "OK"}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => openUpdate(item)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 flex-shrink-0">
                      Update
                    </button>
                  </div>
                );
              })}
              {displayed.length === 0 && <p className="py-10 text-center text-gray-400 text-sm">No stock records</p>}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-3">Product</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Outlet</th>
                    <th className="text-center px-3 py-3">Qty</th>
                    <th className="text-center px-3 py-3 whitespace-nowrap">Min Qty</th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-center px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {displayed.map((item, i) => {
                    const low = isLow(item);
                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{productName(item.product_id)}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm whitespace-nowrap">{outletName(item.outlet_id)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={cn("font-bold text-sm", low ? "text-orange-500" : "text-gray-900 dark:text-white")}>{item.quantity}</span>
                        </td>
                        <td className="px-3 py-3 text-center text-gray-500 dark:text-gray-400 text-sm">{item.min_quantity || 10}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", low ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700")}>
                            {low ? "Low" : "OK"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => openUpdate(item)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Update</button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayed.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">No stock records</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {updateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Update Stock</h3>
              <button onClick={() => setUpdateModal(null)} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
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

// --- Stock Count --------------------------------------------------------------
function StockCountView() {
  const { products, outlets, loading } = useBaseData();
  const [stock, setStock] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (outlets.length > 0 && !outletId) setOutletId(outlets[0].id);
  }, [outlets, outletId]);

  useEffect(() => {
    if (!outletId) return;
    api.getStock(outletId).then(setStock).catch(console.error);
    setCounts({});
  }, [outletId]);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        products
          .filter((p) => counts[p.id] !== "" && counts[p.id] != null)
          .map((p) => api.updateStock({ product_id: p.id, outlet_id: outletId, quantity: parseInt(counts[p.id]), min_quantity: minQtyFor(p.id) }))
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

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

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
        {filledCount > 0 && (
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : `Save Count (${filledCount})`}
          </button>
        )}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800" />
        </div>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800">
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {filledCount > 0 && (
          <button onClick={() => setCounts({})}
            className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
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
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">No products found</td></tr>
            )}
            {filtered.map((p) => {
              const v = variance(p.id);
              const counted = counts[p.id] ?? "";
              return (
                <tr key={p.id} className={cn("transition-colors", counted !== "" ? "bg-indigo-50/40" : "hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900")}>
                  <td className="px-6 py-3">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{p.name}</p>
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

// --- Update Stock -------------------------------------------------------------
function UpdateStockView() {
  const { products, outlets, loading } = useBaseData();
  const [stock, setStock] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ quantity: "", min_quantity: "" });
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
    setEditForm({ quantity: s?.quantity ?? 0, min_quantity: s?.min_quantity ?? 10 });
    setEditingId(p.id);
  };

  const handleSave = async (pid) => {
    setSaving(true);
    try {
      await api.updateStock({ product_id: pid, outlet_id: outletId, quantity: parseInt(editForm.quantity), min_quantity: parseInt(editForm.min_quantity) });
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

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Edit3 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Update Stock</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Adjust quantities and minimum levels per outlet</p>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800" />
        </div>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800">
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <th className="text-left px-6 py-3">Product</th>
              <th className="text-center px-4 py-3">Current Qty</th>
              <th className="text-center px-4 py-3">Min Qty</th>
              <th className="text-center px-4 py-3">New Qty</th>
              <th className="text-center px-4 py-3">New Min</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">No products found</td></tr>
            )}
            {filtered.map((p) => {
              const s = stockFor(p.id);
              const editing = editingId === p.id;
              return (
                <tr key={p.id} className={cn("transition-colors", editing ? "bg-blue-50/40" : "hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900")}>
                  <td className="px-6 py-3">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{p.name}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-sm font-semibold text-gray-700 dark:text-gray-200">{s?.quantity ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{s?.min_quantity ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {editing ? (
                      <input type="number" min="0" value={editForm.quantity}
                        onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                        className="w-20 px-2 py-1.5 border-2 border-blue-400 rounded-xl text-sm text-center font-mono focus:outline-none" />
                    ) : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editing ? (
                      <input type="number" min="0" value={editForm.min_quantity}
                        onChange={(e) => setEditForm((f) => ({ ...f, min_quantity: e.target.value }))}
                        className="w-20 px-2 py-1.5 border-2 border-blue-400 rounded-xl text-sm text-center font-mono focus:outline-none" />
                    ) : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
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
                      <button onClick={() => openEdit(p)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Transfer Stock -----------------------------------------------------------
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
    && form.from_outlet !== form.to_outlet
    && transferQty > 0
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

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>;

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
        {/* Transfer form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 space-y-5">
          <h2 className="font-bold text-gray-900 dark:text-white">Transfer Details</h2>

          {/* Product search */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Product</label>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
                className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
            </div>
            <select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value, quantity: "" }))}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-emerald-400 bg-white dark:bg-gray-800">
              <option value="">Select product…</option>
              {filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* From → To */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">From Outlet</label>
              <select value={form.from_outlet} onChange={(e) => setForm((f) => ({ ...f, from_outlet: e.target.value }))}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-emerald-400 bg-white dark:bg-gray-800">
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <ArrowRight size={20} className="text-gray-400 flex-shrink-0 mt-5" />
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">To Outlet</label>
              <select value={form.to_outlet} onChange={(e) => setForm((f) => ({ ...f, to_outlet: e.target.value }))}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-emerald-400 bg-white dark:bg-gray-800">
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>

          {form.from_outlet === form.to_outlet && form.from_outlet && (
            <p className="text-xs text-red-500 font-medium">Source and destination outlets must be different.</p>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Quantity to Transfer
              {fromQty != null && <span className="normal-case font-normal text-gray-400 ml-1">(available: {fromQty})</span>}
            </label>
            <input type="number" min="1" max={fromQty ?? undefined} value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              placeholder="0"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-emerald-400" />
            {transferQty > 0 && fromQty != null && transferQty > fromQty && (
              <p className="text-xs text-red-500 font-medium mt-1">Exceeds available stock at source outlet.</p>
            )}
          </div>

          <button onClick={handleTransfer} disabled={!canTransfer || saving}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? "Transferring…" : "Confirm Transfer"}
          </button>
        </div>

        {/* Preview */}
        {form.product_id && form.from_outlet && form.to_outlet && form.from_outlet !== form.to_outlet && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 dark:text-white mb-4">Preview</h2>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
              {products.find((p) => p.id === form.product_id)?.name}
            </p>
            <div className="space-y-3">
              {[
                { label: outlets.find((o) => o.id === form.from_outlet)?.name, current: fromQty, after: fromQty - transferQty, dir: "out" },
                { label: outlets.find((o) => o.id === form.to_outlet)?.name, current: toQty, after: toQty + transferQty, dir: "in" },
              ].map(({ label, current, after, dir }) => (
                <div key={label} className={cn("rounded-xl p-4 border-2", dir === "out" ? "border-red-100 bg-red-50" : "border-green-100 bg-green-50")}>
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{label}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xl font-black text-gray-700 dark:text-gray-200">{current}</span>
                    <ArrowRight size={16} className="text-gray-400" />
                    <span className={cn("font-mono text-xl font-black", dir === "out" ? "text-red-600" : "text-green-600")}>
                      {transferQty > 0 ? after : current}
                    </span>
                    {transferQty > 0 && (
                      <span className={cn("text-xs font-bold ml-auto", dir === "out" ? "text-red-500" : "text-green-600")}>
                        {dir === "out" ? `-${transferQty}` : `+${transferQty}`}
                      </span>
                    )}
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

// --- Entry point --------------------------------------------------------------
export default function InventorySection({ view = "stock" }) {
  if (view === "stock-count") return <StockCountView />;
  if (view === "update-stock") return <UpdateStockView />;
  if (view === "transfer-stock") return <TransferStockView />;
  return <StockLevelsView />;
}
