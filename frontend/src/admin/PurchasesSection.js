import React, { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, Edit2, Eye,
  FileText, Mail, MapPin, Phone, Plus, RefreshCw,
  Search, ShieldCheck, Trash2, Truck, X,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { cn, formatCurrency } from "../lib/utils";

function Toast({ msg, type, onClose }) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-4 rounded-xl mb-4 border",
      type === "success"
        ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
        : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
    )}>
      {type === "success"
        ? <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
        : <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />}
      <p className={cn("text-sm font-medium flex-1",
        type === "success" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300")}>{msg}</p>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
    </div>
  );
}

const STATUS_STYLES = {
  pending:   { label: "PENDING",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  approved:  { label: "APPROVED",  cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  received:  { label: "RECEIVED",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  cancelled: { label: "CANCELLED", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const TYPE_STYLES = {
  external: { label: "EXTERNAL", cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  internal: { label: "INTERNAL", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold tracking-wide", s.cls)}>{s.label}</span>;
}

function TypeBadge({ type }) {
  const t = TYPE_STYLES[type] || TYPE_STYLES.external;
  return <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold tracking-wide", t.cls)}>{t.label}</span>;
}

const UNITS = ["pcs", "carton", "kg", "g", "litre", "dozen", "box", "pack", "bag", "crate"];

const EMPTY_ITEM = { product_id: "", description: "", quantity: 1, unit: "pcs", unit_cost: "", total: 0 };

function NewPOModal({ suppliers, products, units, onClose, onCreated }) {
  const [form, setForm] = useState({ supplier_id: "", type: "external", notes: "" });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (i, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === "quantity" || field === "unit_cost") {
        const qty  = field === "quantity"  ? parseFloat(value) || 0 : parseFloat(next[i].quantity)  || 0;
        const cost = field === "unit_cost" ? parseFloat(value) || 0 : parseFloat(next[i].unit_cost) || 0;
        next[i].total = qty * cost;
      }
      if (field === "product_id" && value) {
        const p = products.find((pr) => pr.id === value);
        if (p) {
          next[i].description = p.name;
        }
      }
      return next;
    });
  };

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.total) || 0), 0);

  const handleSubmit = async () => {
    if (!form.supplier_id) { setError("Please select a supplier"); return; }
    if (items.some((it) => !it.description.trim())) { setError("All items need a description"); return; }
    setSaving(true); setError("");
    try {
      await api.createPurchaseOrder({
        supplier_id: form.supplier_id,
        type: form.type,
        notes: form.notes,
        status: "pending",
        items: items.map((it) => ({
          product_id: it.product_id || null,
          description: it.description,
          quantity: parseFloat(it.quantity) || 1,
          unit: it.unit || "pcs",
          unit_cost: parseFloat(it.unit_cost) || 0,
          total: parseFloat(it.total) || 0,
        })),
        subtotal,
        tax: 0,
        total: subtotal,
      });
      onCreated();
    } catch (err) {
      setError(err.message || "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">New Purchase Order</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
              <Clock size={11} /> Will be submitted for approval
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Supplier</label>
              <div className="relative">
                <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400 appearance-none">
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Type</label>
              <div className="relative">
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400 appearance-none">
                  <option value="external">External (Supplier)</option>
                  <option value="internal">Internal Transfer</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Items</label>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border-2 border-gray-300 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Item {i + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600"><X size={14} /></button>
                    )}
                  </div>
                  <div className="mb-2">
                    <div className="relative mb-2">
                      <select value={item.product_id} onChange={(e) => updateItem(i, "product_id", e.target.value)}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400 appearance-none">
                        <option value="">Custom Item</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
                    </div>
                    <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)}
                      placeholder="Description"
                      className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">QTY</label>
                      <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unit</label>
                      <div className="relative">
                        <select value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)}
                          className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400 appearance-none capitalize">
                          {(units.length ? units.map(u => u.name) : UNITS).map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unit Cost</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={item.unit_cost} onChange={(e) => updateItem(i, "unit_cost", e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Total</label>
                      <div className="px-3 py-2 border-2 border-gray-100 dark:border-gray-600 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
              className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400">
              <Plus size={15} /> Add Item
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400 resize-none" />
          </div>

          <div className="text-right">
            <span className="text-base font-black text-green-600 dark:text-green-400">Total: {formatCurrency(subtotal)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? "Submitting…" : "Submit for Approval"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PODetailModal({ po, suppliers, canApprove, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(po.status);
  const supplierName = suppliers.find((s) => s.id === po.supplier_id)?.name || "—";
  const fmtDate = (s) => s ? new Date(s).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "";

  const updateStatus = async (newStatus) => {
    setSaving(true);
    try {
      await api.updatePurchaseOrder(po.id, { status: newStatus });
      setStatus(newStatus);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">{po.po_number}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(po.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={status} />
            <TypeBadge type={po.type} />
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Supplier</p>
            <p className="font-semibold text-gray-900 dark:text-white text-sm mt-0.5">{supplierName}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Items</p>
            <div className="space-y-2">
              {(po.items || []).map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.description}</p>
                    <p className="text-xs text-gray-400">{item.quantity} {item.unit || "pcs"} × {formatCurrency(item.unit_cost)}</p>
                  </div>
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{formatCurrency(item.total)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between font-black text-base text-gray-900 dark:text-white pt-2">
            <span>Total</span>
            <span className="text-green-600 dark:text-green-400">{formatCurrency(po.total)}</span>
          </div>

          {po.notes && (
            <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">{po.notes}</p>
          )}

          {status !== "cancelled" && (
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Actions</p>
              <div className="flex gap-2 flex-wrap">
                {status === "pending" && canApprove && (
                  <button onClick={() => updateStatus("approved")} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition-colors">
                    <ShieldCheck size={14} /> Approve PO
                  </button>
                )}
                {status === "pending" && !canApprove && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                    <Clock size={12} /> Awaiting approval from an authorised user
                  </p>
                )}
                {status === "approved" && (
                  <button onClick={() => updateStatus("received")} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    <CheckCircle2 size={14} /> Mark as Received
                  </button>
                )}
                {(status === "pending" || status === "approved") && (
                  <button onClick={() => updateStatus("cancelled")} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition-colors">
                    <X size={14} /> Cancel PO
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OrdersView({ statusFilter, title, emptyMsg, icon: Icon, accentColor }) {
  const { user } = useAuth();
  const canApprove = user?.role === "admin" || user?.permissions?.includes("approve_purchase");

  const [pos, setPOs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getPurchaseOrders(), api.getSuppliers(), api.getProducts(), api.getUnits()])
      .then(([all, s, pr, u]) => {
        setPOs(statusFilter ? all.filter((p) => statusFilter.includes(p.status)) : all);
        setSuppliers(s);
        setProducts(pr.filter((pr) => pr.active !== false));
        setUnits(u);
      })
      .catch((err) => {
        setToast({ msg: `Failed to load: ${err.message || "Network error"}`, type: "error" });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this purchase order?")) return;
    try {
      await api.deletePurchaseOrder(id);
      setToast({ msg: "Purchase order deleted.", type: "success" });
      load();
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    }
  };

  const handleApprove = async (po) => {
    try {
      await api.updatePurchaseOrder(po.id, { status: "approved" });
      setToast({ msg: `${po.po_number} approved!`, type: "success" });
      load();
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    }
  };

  const isPending = statusFilter?.includes("pending");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0", accentColor)}>
            <Icon size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">{title}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{pos.length} order{pos.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} title="Refresh" className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          {isPending && (
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
              <Plus size={16} /> <span className="hidden sm:inline">New Purchase Order</span><span className="sm:hidden">New PO</span>
            </button>
          )}
        </div>
      </div>

      {isPending && canApprove && pos.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-5">
          <ShieldCheck size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-amber-700 dark:text-amber-300 text-sm font-medium">
            You have authority to approve purchase orders. Review and approve below.
          </p>
        </div>
      )}

      {isPending && !canApprove && pos.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-300 dark:border-gray-600 rounded-xl mb-5">
          <Clock size={18} className="text-gray-400 flex-shrink-0" />
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            These orders are awaiting approval from an authorised user.
          </p>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <FileText size={48} className="mb-4 opacity-25" />
          <p className="font-semibold text-lg">{emptyMsg}</p>
          {isPending && <p className="text-sm mt-1">Create a new purchase order above</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {pos.map((po) => (
            <div key={po.id}
              className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm px-4 py-4 flex items-center gap-2 sm:gap-4 hover:shadow-md transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-black text-gray-900 dark:text-white text-sm sm:text-base">{po.po_number}</span>
                  <StatusBadge status={po.status} />
                  <TypeBadge type={po.type} />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  Supplier: <span className="font-medium text-gray-700 dark:text-gray-300">{supplierName(po.supplier_id)}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{po.items?.length || 0} item{po.items?.length !== 1 ? "s" : ""} · {formatCurrency(po.total)}</p>
              </div>

              <button
                onClick={() => setDetail(po)}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                title="View order details"
              >
                <Eye size={14} /> <span className="hidden sm:inline">View</span>
              </button>

              {isPending && canApprove && (
                <button
                  onClick={() => handleApprove(po)}
                  className="flex items-center gap-1.5 px-2.5 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-colors flex-shrink-0"
                  title="Approve this purchase order"
                >
                  <ShieldCheck size={14} /> <span className="hidden sm:inline">Approve</span>
                </button>
              )}

              <button
                onClick={() => handleDelete(po.id)}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors flex-shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewPOModal
          suppliers={suppliers}
          products={products}
          units={units}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            setToast({ msg: "Purchase order submitted for approval!", type: "success" });
            load();
          }}
        />
      )}

      {detail && (
        <PODetailModal
          po={detail}
          suppliers={suppliers}
          canApprove={canApprove}
          onClose={() => setDetail(null)}
          onUpdated={() => { setDetail(null); load(); }}
        />
      )}
    </div>
  );
}

function SupplierFormModal({ existing, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: existing?.name || "",
    contact_name: existing?.contact_name || "",
    phone: existing?.phone || "",
    email: existing?.email || "",
    address: existing?.address || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Company name is required"); return; }
    setSaving(true); setError("");
    try {
      if (existing) {
        await api.updateSupplier(existing.id, form);
      } else {
        await api.createSupplier(form);
      }
      onSaved();
    } catch (err) {
      setError(err.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white text-lg">{existing ? "Edit Supplier" : "Add Supplier"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Company Name</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 border-2 border-blue-400 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Contact Person</label>
            <input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Address</label>
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : existing ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SuppliersView() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    api.getSuppliers().then(setSuppliers).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this supplier?")) return;
    try {
      await api.deleteSupplier(id);
      setToast({ msg: "Supplier deleted.", type: "success" });
      load();
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    }
  };

  const filtered = suppliers.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Truck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Suppliers</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button onClick={() => setModal("new")}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
          <Plus size={16} /> Add Supplier
        </button>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-white" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Truck size={48} className="mb-4 opacity-25" />
          <p className="font-semibold text-lg">No suppliers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <div key={s.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">{s.name}</p>
                  {s.contact_name && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{s.contact_name}</p>}
                </div>
                <div className="flex gap-1.5 flex-shrink-0 ml-2">
                  <button onClick={() => setModal(s)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 text-blue-500 hover:bg-blue-100 transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(s.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {s.phone && <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Phone size={13} className="flex-shrink-0" /><span>{s.phone}</span></div>}
                {s.email && <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Mail size={13} className="flex-shrink-0" /><span className="truncate">{s.email}</span></div>}
                {s.address && <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><MapPin size={13} className="flex-shrink-0" /><span className="truncate">{s.address}</span></div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <SupplierFormModal
          existing={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setToast({ msg: modal === "new" ? "Supplier added!" : "Supplier updated!", type: "success" });
            load();
          }}
        />
      )}
    </div>
  );
}

export default function PurchasesSection({ view = "pending" }) {
  if (view === "approved") {
    return (
      <OrdersView
        key="approved"
        statusFilter={["approved", "received"]}
        title="Approved Orders"
        emptyMsg="No approved orders yet"
        icon={ShieldCheck}
        accentColor="bg-green-600"
      />
    );
  }
  if (view === "suppliers") return <SuppliersView />;
  return (
    <OrdersView
      key="pending"
      statusFilter={["pending", "draft"]}
      title="Pending Orders"
      emptyMsg="No pending orders"
      icon={Clock}
      accentColor="bg-amber-500"
    />
  );
}
