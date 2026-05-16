import React, { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
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
  occupied: "bg-red-100 border-red-300 text-red-800",
};

export default function BarTabsAdminSection() {
  const [tabs, setTabs] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ number: "", outlet_id: "", tab_type: "regular" });
  const [saving, setSaving] = useState(false);
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
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await api.createBarTab({ number: form.number, outlet_id: form.outlet_id, tab_type: form.tab_type });
      setModal(false);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tab) => {
    if (!window.confirm(`Delete bar tab "${tab.number}"?`)) return;
    try { await api.deleteBarTab(tab.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Bar Tab Management</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{tabs.length} bar tab positions configured</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors">
          <Plus size={16} /> Add Bar Tab
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : tabs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <p className="font-semibold text-gray-500 dark:text-gray-400">No bar tabs configured</p>
          <p className="text-sm mt-1">Add bar tab positions to manage bar orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {tabs.map((tab) => {
            const status = tab.status || "available";
            const colorClass = STATUS_COLORS[status] || STATUS_COLORS.available;
            return (
              <div key={tab.id} className={cn("rounded-2xl border-2 p-4 flex flex-col items-center relative group", colorClass)}>
                <p className="text-2xl font-black mb-1">{tab.number}</p>
                <p className="text-xs font-medium opacity-75">{outletName(tab.outlet_id)}</p>
                <p className="text-xs opacity-60 mt-0.5 capitalize">{tab.tab_type}</p>
                <p className={cn("text-xs font-semibold mt-1 capitalize", status === "occupied" ? "text-red-600" : "text-green-600")}>{status}</p>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                  <button onClick={() => handleDelete(tab)} className="text-red-500 hover:text-red-700 bg-white dark:bg-gray-800 rounded-lg p-0.5 shadow-sm">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title="Add Bar Tab Position" onClose={() => setModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Bar Tab Name / Number</label>
              <input required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-purple-500"
                placeholder="e.g., Bar 1, VIP Bar, Counter A" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Outlet</label>
              <select value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-purple-500">
                <option value="">Select outlet…</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Tab Type</label>
              <select value={form.tab_type} onChange={(e) => setForm({ ...form, tab_type: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-purple-500">
                <option value="regular">Regular</option>
                <option value="vip">VIP</option>
                <option value="bottle_service">Bottle Service</option>
              </select>
            </div>
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(false)}
                className="flex-1 py-2.5 border-2 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {saving ? "Creating…" : "Create Bar Tab"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
