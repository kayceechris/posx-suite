import React, { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardList, Plus, RefreshCw,
  Trash2, X, ChevronDown, ChevronUp, ArrowRight, Package, Pencil,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, userHasPermission } from "../lib/utils";
import { useAuth } from "../context/AuthContext";

const STORE_LABELS = { main: "Main Store", kitchen: "Kitchen Store", bar: "Bar Store" };
const STORE_COLORS = {
  main:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  kitchen: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  bar:     "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};
const COLOR_BADGE = {
  blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  red:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  teal:   "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  pink:   "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
};
const storeLabel = (id, stores) => STORE_LABELS[id] || stores?.find(s => s.id === id)?.name || id;
const storeColor = (id, stores) => {
  if (STORE_COLORS[id]) return STORE_COLORS[id];
  const s = stores?.find(st => st.id === id);
  return s ? (COLOR_BADGE[s.color] || COLOR_BADGE.indigo) : COLOR_BADGE.indigo;
};
const STATUS_META = {
  pending:   { label: "Pending",   bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  approved:  { label: "Approved",  bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  fulfilled: { label: "Fulfilled", bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  rejected:  { label: "Rejected",  bg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

function Toast({ msg, type, onClose }) {
  return (
    <div className={cn("flex items-center gap-3 p-4 rounded-xl mb-4 border",
      type === "success" ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
        : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800")}>
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
    <div className="flex justify-center py-12">
      <div className={`w-7 h-7 border-4 border-${color}-600 border-t-transparent rounded-full animate-spin`} />
    </div>
  );
}

// ── Fulfill Modal ─────────────────────────────────────────────────────────────

function FulfillModal({ req, products, ingredients = [], outlets, stores, units, onClose, onFulfilled, setToast }) {
  const [mainStock, setMainStock] = useState([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [qtys, setQtys] = useState({});
  const [fulfilling, setFulfilling] = useState(false);

  const subjectId = (item) => item.ingredient_id || item.product_id;
  const subjectName = (item) => {
    if (item.ingredient_id) return ingredients.find((i) => i.id === item.ingredient_id)?.name || item.product_name || item.ingredient_id;
    return products.find((p) => p.id === item.product_id)?.name || item.product_name || item.product_id;
  };
  const subjectUnitId = (item) => {
    if (item.unit_id) return item.unit_id;
    if (item.ingredient_id) return ingredients.find((i) => i.id === item.ingredient_id)?.unit_id || "";
    return products.find((p) => p.id === item.product_id)?.unit_id || "";
  };
  const matchStock = (item) =>
    mainStock.find((s) => item.ingredient_id ? s.ingredient_id === item.ingredient_id : s.product_id === item.product_id);

  const outletName = (id) => outlets.find((o) => o.id === id)?.name || id;
  const productName = (item) => subjectName(item);
  const mainQty = (item) => matchStock(item)?.quantity ?? 0;
  const productUnit = (item) => {
    const uid = subjectUnitId(item);
    const u = units.find((u) => u.id === uid);
    return u?.abbreviation || u?.name || "";
  };

  useEffect(() => {
    setLoadingStock(true);
    api.getStock(req.outlet_id, "main")
      .then((stock) => {
        setMainStock(stock);
        const init = {};
        req.items.forEach((item) => {
          const sid = subjectId(item);
          const avail = stock.find((s) => item.ingredient_id ? s.ingredient_id === item.ingredient_id : s.product_id === item.product_id)?.quantity ?? 0;
          init[sid] = Math.min(item.quantity_requested, avail);
        });
        setQtys(init);
      })
      .catch(console.error)
      .finally(() => setLoadingStock(false));
  }, [req.outlet_id, req.items]);

  const handleFulfill = async () => {
    const total = Object.values(qtys).reduce((s, v) => s + (parseInt(v) || 0), 0);
    if (total === 0) { setToast({ msg: "All transfer quantities are 0 — nothing to transfer.", type: "error" }); return; }
    setFulfilling(true);
    try {
      await api.fulfillRequisition(req.id, qtys);
      onFulfilled();
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
      setFulfilling(false);
    }
  };

  const insufficientCount = req.items.filter((item) => mainQty(item) < item.quantity_requested).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Transfer Stock</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {STORE_LABELS.main} → <span className="font-semibold">{storeLabel(req.from_store, stores)}</span>
              {" · "}{outletName(req.outlet_id)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
        </div>

        {loadingStock ? <Spinner /> : (
          <div className="p-6">
            {insufficientCount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl mb-4">
                <AlertTriangle size={15} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
                  {insufficientCount} item{insufficientCount > 1 ? "s have" : " has"} less available in Main Store than requested. Transfer quantities are capped automatically — add more stock to Main Store if needed.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm mb-5">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left pb-2.5">Product</th>
                    <th className="text-center pb-2.5 px-2">Req</th>
                    <th className="text-center pb-2.5 px-2">In Main</th>
                    <th className="text-center pb-2.5 px-2">Transfer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {req.items.map((item) => {
                    const sid = subjectId(item);
                    const avail = mainQty(item);
                    const isShort = avail < item.quantity_requested;
                    return (
                      <tr key={sid}>
                        <td className="py-2.5 pr-2 font-medium text-gray-800 dark:text-gray-200 text-xs leading-tight">
                          {productName(item)}
                          {productUnit(item) && <span className="ml-1 text-[10px] text-gray-400 font-semibold">{productUnit(item)}</span>}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-bold text-gray-600 dark:text-gray-300 text-sm">{item.quantity_requested}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={cn("font-mono font-black text-sm", isShort ? "text-red-500" : "text-green-600 dark:text-green-400")}>
                            {avail}
                          </span>
                          {isShort && <span className="block text-[10px] text-red-400 font-semibold">Low</span>}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="number" min="0" max={avail}
                            value={qtys[sid] ?? 0}
                            onChange={(e) => setQtys((prev) => ({
                              ...prev,
                              [sid]: Math.min(parseInt(e.target.value) || 0, avail),
                            }))}
                            className="w-20 px-2 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-center font-mono focus:outline-none focus:border-green-500 bg-white dark:bg-gray-700 dark:text-white"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleFulfill} disabled={fulfilling}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors">
                {fulfilling ? "Transferring…" : "Confirm Transfer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Requisition Card ──────────────────────────────────────────────────────────

function ReqCard({ req, products, ingredients = [], outlets, stores, units, onApprove, onReject, onDelete, onFulfillOpen, onEdit, isPrivileged }) {
  const [expanded, setExpanded] = useState(false);
  const outletName = (id) => outlets.find((o) => o.id === id)?.name || id;
  const itemName = (item) => {
    if (item.ingredient_id) return ingredients.find((i) => i.id === item.ingredient_id)?.name || item.product_name || item.ingredient_id;
    return products.find((p) => p.id === item.product_id)?.name || item.product_name || item.product_id;
  };
  const itemUnit = (item) => {
    const uid = item.unit_id
      || (item.ingredient_id ? ingredients.find((i) => i.id === item.ingredient_id)?.unit_id : products.find((p) => p.id === item.product_id)?.unit_id);
    if (!uid) return "";
    const u = (units || []).find((u) => u.id === uid);
    return u?.abbreviation || u?.name || "";
  };
  const itemKey = (item) => item.ingredient_id || item.product_id;
  const meta = STATUS_META[req.status] || STATUS_META.pending;
  const totalRequested = req.items.reduce((s, i) => s + i.quantity_requested, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded((v) => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 dark:text-white text-sm">{outletName(req.outlet_id)}</p>
            <ArrowRight size={13} className="text-gray-400 flex-shrink-0" />
            <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", storeColor(req.from_store, stores))}>
              {storeLabel(req.from_store, stores)}
            </span>
            <span className="text-[11px] text-gray-400">requests from</span>
            <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", STORE_COLORS.main)}>
              {STORE_LABELS.main}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {req.items.length} item{req.items.length !== 1 ? "s" : ""} · {totalRequested} units
            {req.created_by_name && <> · by <span className="font-medium">{req.created_by_name}</span></>}
            {" · "}{new Date(req.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0", meta.bg)}>{meta.label}</span>
        {expanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
          {req.notes && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 italic">"{req.notes}"</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm mb-4 min-w-[280px]">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase">
                  <th className="text-left py-1.5">Product</th>
                  <th className="text-center py-1.5">Requested</th>
                  {req.status === "fulfilled" && <th className="text-center py-1.5 text-green-600">Transferred</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {req.items.map((item) => (
                  <tr key={itemKey(item)}>
                    <td className="py-2 font-medium text-gray-800 dark:text-gray-200">
                      {itemName(item)}
                      {itemUnit(item) && <span className="ml-1 text-[10px] text-gray-400 font-semibold">{itemUnit(item)}</span>}
                    </td>
                    <td className="py-2 text-center font-mono font-bold text-gray-700 dark:text-gray-200">{item.quantity_requested}</td>
                    {req.status === "fulfilled" && (
                      <td className="py-2 text-center font-mono font-bold text-green-600 dark:text-green-400">{item.quantity_fulfilled}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isPrivileged && (
            <div className="flex gap-2 flex-wrap items-center">
              {req.status === "pending" && (
                <>
                  <button onClick={() => onApprove(req.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                    Approve
                  </button>
                  <button onClick={() => onEdit(req)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <Pencil size={13} /> Edit
                  </button>
                  <button onClick={() => onReject(req.id)}
                    className="px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-xl text-sm font-semibold hover:bg-red-200 transition-colors">
                    Reject
                  </button>
                  <button onClick={() => onDelete(req.id)} className="ml-auto text-gray-300 hover:text-red-500 transition-colors p-1.5">
                    <Trash2 size={15} />
                  </button>
                </>
              )}
              {req.status === "approved" && (
                <>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <Package size={13} className="text-blue-500" />
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Ready to transfer from Main Store</span>
                  </div>
                  <button onClick={() => onFulfillOpen(req)}
                    className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors">
                    Transfer Stock
                  </button>
                  <button onClick={() => onReject(req.id)}
                    className="px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-xl text-sm font-semibold hover:bg-red-200 transition-colors">
                    Reject
                  </button>
                </>
              )}
              {req.status === "fulfilled" && (
                <p className="text-xs text-gray-400">
                  Transferred by {req.fulfilled_by_name || "—"} on {req.fulfilled_at ? new Date(req.fulfilled_at).toLocaleDateString() : "—"}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Requisition Modal ──────────────────────────────────────────────────

function CreateRequisitionModal({ products, ingredients = [], outlets, groups, stores, units, onClose, onCreated }) {
  const outletId = outlets[0]?.id || "";
  const childStores = stores.filter(s => !s.is_main);
  const [fromStore, setFromStore] = useState(childStores[0]?.id || "kitchen");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ subject_key: "", product_id: "", ingredient_id: "", product_name: "", quantity_requested: 1, unit_id: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mainStock, setMainStock] = useState([]);
  const [stockLoaded, setStockLoaded] = useState(false);

  const foodGroupIds = groups.filter((g) => g.main_category === "food").map((g) => g.id);
  const drinkGroupIds = groups.filter((g) => g.main_category === "drinks").map((g) => g.id);

  // Main Store stock is polymorphic — each row holds either an ingredient_id
  // or a product_id (see backend Stock model). Pull whatever the outlet's
  // Main Store actually tracks and use that to drive the picker.
  useEffect(() => {
    if (!outletId) return;
    api.getStock(outletId, "main")
      .then(stock => { setMainStock(stock); setStockLoaded(true); })
      .catch(() => setStockLoaded(true));
  }, [outletId]);

  // Build a unified picker from main-store stock — each entry resolves to
  // either an ingredient or a product.
  const pickerOptions = (() => {
    if (!stockLoaded) return [];
    const out = [];
    for (const row of mainStock) {
      if (row.ingredient_id) {
        const ing = ingredients.find((i) => i.id === row.ingredient_id);
        if (!ing) continue;
        out.push({
          key: `i:${ing.id}`, kind: "ingredient", id: ing.id, name: ing.name,
          unit_id: ing.unit_id || "", category_id: null, qty: row.quantity ?? 0,
        });
      } else if (row.product_id) {
        const p = products.find((pr) => pr.id === row.product_id);
        if (!p) continue;
        out.push({
          key: `p:${p.id}`, kind: "product", id: p.id, name: p.name,
          unit_id: p.unit_id || "", category_id: p.category_id, qty: row.quantity ?? 0,
        });
      }
    }
    // For product-based catalogs, kitchen/bar still get category-filtered;
    // ingredients aren't categorized, so they always show up.
    return out.filter((o) => {
      if (o.kind === "ingredient") return true;
      if (fromStore === "kitchen") return foodGroupIds.includes(o.category_id);
      if (fromStore === "bar") return drinkGroupIds.includes(o.category_id);
      return true;
    });
  })();

  const optionByKey = (key) => pickerOptions.find((o) => o.key === key);

  const setItem = (idx, key, val) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems((prev) => [...prev, { subject_key: "", product_id: "", ingredient_id: "", product_name: "", quantity_requested: 1, unit_id: "" }]);

  const handleSubjectChange = (idx, key) => {
    const opt = optionByKey(key);
    setItems((prev) => prev.map((it, i) => i === idx ? {
      ...it,
      subject_key: key,
      product_id:    opt?.kind === "product"    ? opt.id : "",
      ingredient_id: opt?.kind === "ingredient" ? opt.id : "",
      product_name:  opt?.name || "",
      unit_id:       opt?.unit_id || "",
    } : it));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validItems = items
      .filter((it) => (it.product_id || it.ingredient_id) && it.quantity_requested > 0)
      .map((it) => ({
        product_id:    it.product_id || null,
        ingredient_id: it.ingredient_id || null,
        product_name:  it.product_name,
        quantity_requested: it.quantity_requested,
        unit_id: it.unit_id || null,
      }));
    if (!validItems.length) { setError("Add at least one item."); return; }
    setSaving(true); setError("");
    try {
      await api.createRequisition({ outlet_id: outletId, from_store: fromStore, items: validItems, notes: notes || null });
      onCreated();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  const mainStoreEmpty = mainStock.length === 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="font-bold text-gray-900 dark:text-white">New Requisition</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mainStoreEmpty && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
              <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">
                Main Store has no stock for this outlet. The requisition will be created but cannot be fulfilled until stock is added to Main Store.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Requesting Store</label>
            <select required value={fromStore} onChange={(e) => setFromStore(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
              {childStores.length > 0
                ? childStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                : <option value="kitchen">Kitchen Store</option>}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Items</label>
              <button type="button" onClick={addItem}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Plus size={13} /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const opt = optionByKey(item.subject_key);
                const avail = opt ? opt.qty : null;
                const isShort = avail !== null && item.quantity_requested > avail;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex flex-wrap gap-2 items-center">
                      <select required value={item.subject_key} onChange={(e) => handleSubjectChange(idx, e.target.value)}
                        disabled={!stockLoaded}
                        className="basis-full sm:basis-0 sm:flex-1 min-w-0 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60">
                        <option value="">{!stockLoaded ? "Loading inventory…" : pickerOptions.length === 0 ? "No stocked items in Main Store" : "Select item…"}</option>
                        {pickerOptions.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                      </select>
                      <input type="number" min="1" required value={item.quantity_requested}
                        inputMode="numeric"
                        onChange={(e) => setItem(idx, "quantity_requested", parseInt(e.target.value) || 1)}
                        className={cn("flex-1 sm:flex-none sm:w-20 px-3 py-2 border-2 rounded-xl text-sm text-center focus:outline-none bg-white dark:bg-gray-700 dark:text-white",
                          isShort ? "border-yellow-400 focus:border-yellow-500" : "border-gray-200 dark:border-gray-700 focus:border-blue-500")} />
                      <select
                        value={item.unit_id || ""}
                        onChange={(e) => setItem(idx, "unit_id", e.target.value)}
                        className="flex-1 sm:flex-none sm:w-24 px-2 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Unit</option>
                        {(units || []).map((u) => (
                          <option key={u.id} value={u.id}>{u.abbreviation || u.name}</option>
                        ))}
                      </select>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    {item.subject_key && (
                      <p className={cn("text-[11px] pl-1 font-semibold",
                        avail === null ? "text-gray-400" : isShort ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400")}>
                        {isShort
                          ? `⚠ Only ${avail} available in Main Store`
                          : `✓ ${avail} available in Main Store`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? "Creating…" : "Submit Requisition"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Edit Requisition Modal ────────────────────────────────────────────────────

function EditRequisitionModal({ req, products, groups, stores, units, onClose, onSaved }) {
  const childStores = stores.filter(s => !s.is_main);
  const fromStore = req.from_store;

  const foodGroupIds = groups.filter((g) => g.main_category === "food").map((g) => g.id);
  const drinkGroupIds = groups.filter((g) => g.main_category === "drinks").map((g) => g.id);
  const [items, setItems] = useState(req.items.map((it) => ({
    ...it,
    unit_id: it.unit_id || products.find((p) => p.id === it.product_id)?.unit_id || "",
  })));
  const [notes, setNotes] = useState(req.notes || "");
  const [mainStock, setMainStock] = useState([]);
  const [stockLoaded, setStockLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const existingProductIds = new Set(req.items.map((it) => it.product_id).filter(Boolean));
  const stockedIds = new Set(mainStock.map((s) => s.product_id));
  const filteredProducts = fromStore === "kitchen"
    ? products.filter((p) => (foodGroupIds.includes(p.category_id) && stockedIds.has(p.id)) || existingProductIds.has(p.id))
    : fromStore === "bar"
    ? products.filter((p) => (drinkGroupIds.includes(p.category_id) && stockedIds.has(p.id)) || existingProductIds.has(p.id))
    : products.filter((p) => stockedIds.has(p.id) || existingProductIds.has(p.id));

  const productUnit = (pid) => {
    const p = products.find((pr) => pr.id === pid);
    if (!p?.unit_id) return "";
    const u = (units || []).find((u) => u.id === p.unit_id);
    return u?.abbreviation || u?.name || "";
  };

  useEffect(() => {
    api.getStock(req.outlet_id, "main")
      .then((stock) => { setMainStock(stock); setStockLoaded(true); })
      .catch(() => setStockLoaded(true));
  }, [req.outlet_id]);

  const mainQty = (pid) => mainStock.find((s) => s.product_id === pid)?.quantity ?? null;

  const setItem = (idx, key, val) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems((prev) => [...prev, { product_id: "", product_name: "", quantity_requested: 1, unit_id: "" }]);

  const handleProductChange = (idx, pid) => {
    const p = products.find((pr) => pr.id === pid);
    setItems((prev) => prev.map((it, i) => i === idx ? {
      ...it,
      product_id: pid,
      product_name: p?.name || "",
      unit_id: p?.unit_id || "",
    } : it));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const validItems = items.filter((it) => it.product_id && it.quantity_requested > 0);
    if (!validItems.length) { setError("Add at least one product."); return; }
    setSaving(true); setError("");
    try {
      await api.updateRequisition(req.id, { items: validItems, notes: notes || null });
      onSaved();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Edit Requisition</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Requesting store: <span className="font-semibold text-gray-600 dark:text-gray-300">{storeLabel(fromStore, stores)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <AlertTriangle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
              Adjust quantities if Main Store cannot fulfill the full amount. Changes apply before approval.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Items</label>
              <button type="button" onClick={addItem}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Plus size={13} /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const avail = item.product_id ? mainQty(item.product_id) : null;
                const isShort = avail !== null && item.quantity_requested > avail;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex flex-wrap gap-2 items-center">
                      <select required value={item.product_id} onChange={(e) => handleProductChange(idx, e.target.value)}
                        disabled={!stockLoaded}
                        className="basis-full sm:basis-0 sm:flex-1 min-w-0 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60">
                        <option value="">{!stockLoaded ? "Loading inventory…" : filteredProducts.length === 0 ? "No stocked products" : "Select product…"}</option>
                        {filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input type="number" min="1" required value={item.quantity_requested}
                        inputMode="numeric"
                        onChange={(e) => setItem(idx, "quantity_requested", parseInt(e.target.value) || 1)}
                        className={cn("flex-1 sm:flex-none sm:w-20 px-3 py-2 border-2 rounded-xl text-sm text-center focus:outline-none bg-white dark:bg-gray-700 dark:text-white",
                          isShort ? "border-yellow-400 focus:border-yellow-500" : "border-gray-200 dark:border-gray-700 focus:border-blue-500")} />
                      <select
                        value={item.unit_id || ""}
                        onChange={(e) => setItem(idx, "unit_id", e.target.value)}
                        className="flex-1 sm:flex-none sm:w-24 px-2 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Unit</option>
                        {(units || []).map((u) => (
                          <option key={u.id} value={u.id}>{u.abbreviation || u.name}</option>
                        ))}
                      </select>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    {item.product_id && (
                      <p className={cn("text-[11px] pl-1 font-semibold",
                        avail === null ? "text-gray-400" : isShort ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400")}>
                        {avail === null ? "Loading availability…" : isShort
                          ? `⚠ Only ${avail} available in Main Store`
                          : `✓ ${avail} available in Main Store`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export default function RequisitionsSection() {
  const { user } = useAuth();
  // Anyone allowed to manage requisitions counts as 'privileged' here —
  // honors both the admin/manager role and any custom role holding the
  // manage_requisitions / manage_inventory permission.
  const isPrivileged = userHasPermission(user, "manage_requisitions");

  const [requisitions, setRequisitions] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [groups, setGroups] = useState([]);
  const [stores, setStores] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [fulfillReq, setFulfillReq] = useState(null);
  const [editReq, setEditReq] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.getRequisitions(),
      api.getProducts(),
      api.getOutlets(),
      api.getGroups(),
      api.getStores(),
      api.getUnits(),
      api.getIngredients().catch(() => []),
    ])
      .then(([r, p, o, g, s, u, i]) => {
        setRequisitions(r);
        setProducts(p.filter((pr) => pr.active !== false));
        setOutlets(o);
        setGroups(g);
        setStores(s);
        setUnits(u);
        setIngredients(i || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    try {
      await api.approveRequisition(id);
      setToast({ msg: "Requisition approved — ready for stock transfer.", type: "success" });
      load();
    } catch (err) { setToast({ msg: err.message, type: "error" }); }
  };

  const handleReject = async (id) => {
    try {
      await api.rejectRequisition(id);
      setToast({ msg: "Requisition rejected.", type: "success" });
      load();
    } catch (err) { setToast({ msg: err.message, type: "error" }); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this requisition?")) return;
    try {
      await api.deleteRequisition(id);
      setToast({ msg: "Requisition deleted.", type: "success" });
      load();
    } catch (err) { setToast({ msg: err.message, type: "error" }); }
  };

  const handleFulfilled = () => {
    setFulfillReq(null);
    setToast({ msg: "Stock transferred successfully — Main Store updated.", type: "success" });
    load();
  };

  const counts = requisitions.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const displayed = tab === "all" ? requisitions : requisitions.filter((r) => r.status === tab);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Requisitions</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 hidden sm:block">
              Kitchen &amp; Bar request stock from Main Store
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={load}
            className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
            <Plus size={16} /> <span className="hidden sm:inline">New</span> Requisition
          </button>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {isPrivileged && counts.pending > 0 && tab !== "pending" && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-4">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-amber-800 dark:text-amber-200 text-sm font-semibold">
              {counts.pending} pending requisition{counts.pending !== 1 ? "s" : ""} awaiting approval
            </p>
            <p className="text-amber-600 dark:text-amber-400 text-xs mt-0.5">
              Kitchen or Bar has requested stock from Main Store.
            </p>
          </div>
          <button onClick={() => setTab("pending")}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors whitespace-nowrap">
            <ArrowRight size={13} /> Review
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Pending",   key: "pending",   color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" },
          { label: "Approved",  key: "approved",  color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "Fulfilled", key: "fulfilled", color: "text-green-600 dark:text-green-400",   bg: "bg-green-50 dark:bg-green-900/20" },
          { label: "Rejected",  key: "rejected",  color: "text-red-600 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-900/20" },
        ].map((s) => (
          <div key={s.key} className={cn("rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 text-center", s.bg)}>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={cn("text-3xl font-black leading-tight truncate", s.color)}>{counts[s.key] || 0}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          ["all", `All (${requisitions.length})`],
          ["pending", `Pending (${counts.pending || 0})`],
          ["approved", `Approved (${counts.approved || 0})`],
          ["fulfilled", `Fulfilled (${counts.fulfilled || 0})`],
          ["rejected", `Rejected (${counts.rejected || 0})`],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              tab === v ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700")}>
            {l}
          </button>
        ))}
      </div>

      {loading ? <Spinner color="blue" /> : (
        <div className="space-y-3">
          {displayed.map((req) => (
            <ReqCard
              key={req.id} req={req} products={products} ingredients={ingredients} outlets={outlets} stores={stores} units={units}
              isPrivileged={isPrivileged}
              onApprove={handleApprove}
              onReject={handleReject}
              onDelete={handleDelete}
              onFulfillOpen={(r) => setFulfillReq(r)}
              onEdit={(r) => setEditReq(r)}
            />
          ))}
          {displayed.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 px-6 py-12 text-center">
              <ClipboardList size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm font-medium">No {tab === "all" ? "" : tab} requisitions</p>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateRequisitionModal
          products={products} ingredients={ingredients} outlets={outlets} groups={groups} stores={stores} units={units}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); setToast({ msg: "Requisition submitted.", type: "success" }); }}
        />
      )}

      {fulfillReq && (
        <FulfillModal
          req={fulfillReq}
          products={products}
          ingredients={ingredients}
          outlets={outlets}
          stores={stores}
          units={units}
          setToast={setToast}
          onClose={() => setFulfillReq(null)}
          onFulfilled={handleFulfilled}
        />
      )}

      {editReq && (
        <EditRequisitionModal
          req={editReq}
          products={products}
          ingredients={ingredients}
          groups={groups}
          stores={stores}
          units={units}
          onClose={() => setEditReq(null)}
          onSaved={() => { setEditReq(null); load(); setToast({ msg: "Requisition updated.", type: "success" }); }}
        />
      )}
    </div>
  );
}
