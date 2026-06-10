import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, GlassWater } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  available: "bg-green-100 border-green-300 text-green-800",
  open:      "bg-red-100 border-red-300 text-red-800",
  reserved:  "bg-yellow-100 border-yellow-300 text-yellow-800",
};

const TAB_TYPES = [
  { value: "regular", label: "Regular" },
  { value: "vip",     label: "VIP" },
  { value: "private", label: "Private" },
];

const TYPE_BADGE = {
  regular: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  vip:     "bg-purple-100 text-purple-700",
  private: "bg-blue-100 text-blue-700",
};

export default function BarTabsSection() {
  const [tabs, setTabs]       = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [form, setForm]       = useState({ number: "", outlet_id: "", tab_type: "regular" });
  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([api.getBarTabs(), api.getOutlets()])
      .then(([t, o]) => { setTabs(t); setOutlets(o); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const outletName = (id) => outlets.find((o) => o.id === id)?.name || "Unknown";

  const openAdd = () => {
    setForm({ number: "", outlet_id: outlets[0]?.id || "", tab_type: "regular" });
    setFormError("");
    setModal({ mode: "add" });
  };

  const openEdit = (t) => {
    setForm({ number: t.number, outlet_id: t.outlet_id || "", tab_type: t.tab_type || "regular" });
    setFormError("");
    setModal({ mode: "edit", id: t.id });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const payload = { number: form.number, outlet_id: form.outlet_id, tab_type: form.tab_type };
      if (modal.mode === "add") await api.createBarTab(payload);
      else await api.updateBarTab(modal.id, payload);
      setModal(null);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    if (t.status === "open") {
      alert("Cannot delete a bar tab with an open order. Void the order first.");
      return;
    }
    if (!window.confirm(`Delete bar tab "${t.number}"?`)) return;
    try { await api.deleteBarTab(t.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
            <GlassWater size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Bar Tab Management</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{tabs.length} bar tab{tabs.length !== 1 ? "s" : ""} configured</p>
          </div>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors">
          <Plus size={16} /> Add Bar Tab
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-5 text-xs font-semibold">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
          <span className="text-gray-500 dark:text-gray-400">Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
          <span className="text-gray-500 dark:text-gray-400">Open (in use)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
          <span className="text-gray-500 dark:text-gray-400">Reserved</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tabs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <div className="w-16 h-16 mb-4 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
            <GlassWater size={32} className="opacity-30" />
          </div>
          <p className="font-semibold text-gray-500 dark:text-gray-400 text-lg">No bar tabs configured</p>
          <p className="text-sm mt-1">Add bar tabs to start managing nightclub service</p>
          <button onClick={openAdd}
            className="mt-5 flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors">
            <Plus size={16} /> Add First Bar Tab
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {tabs.map((t) => {
            const status = t.status || "available";
            const colorClass = STATUS_COLORS[status] || STATUS_COLORS.available;
            const typeBadge = TYPE_BADGE[t.tab_type] || TYPE_BADGE.regular;
            return (
              <div key={t.id}
                className={cn("rounded-2xl border-2 p-4 flex flex-col items-center relative group", colorClass)}>
                <p className="text-2xl font-black mb-1">{t.number}</p>
                <p className="text-xs font-medium opacity-75 text-center leading-tight">{outletName(t.outlet_id)}</p>
                <span className={cn("mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", typeBadge)}>
                  {t.tab_type || "regular"}
                </span>
                <p className="text-[10px] opacity-50 mt-1 capitalize">{status}</p>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                  <button onClick={() => openEdit(t)}
                    className="text-blue-500 hover:text-blue-700 bg-white dark:bg-gray-800 rounded-lg p-0.5 shadow-sm">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleDelete(t)}
                    className="text-red-500 hover:text-red-700 bg-white dark:bg-gray-800 rounded-lg p-0.5 shadow-sm">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === "add" ? "Add New Bar Tab" : "Edit Bar Tab"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Tab Name / Number
              </label>
              <input
                required
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-purple-500"
                placeholder="e.g., Tab 1, VIP 1, Bar 3"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Outlet
              </label>
              <select
                value={form.outlet_id}
                onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="">Select outlet…</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Tab Type
              </label>
              <div className="flex gap-2">
                {TAB_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setForm({ ...form, tab_type: type.value })}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors",
                      form.tab_type === type.value
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                        : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300"
                    )}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {formError && <p className="text-red-500 text-xs">{formError}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 border-2 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : modal.mode === "add" ? "Create" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
