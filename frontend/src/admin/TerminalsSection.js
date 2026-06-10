import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Monitor } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const TERMINAL_TYPES = ["pos", "bar", "kitchen", "club", "cashier", "kiosk", "other"];

const EMPTY = { name: "", outlet_id: "", type: "pos", description: "" };

const TYPE_COLORS = {
  pos: "bg-blue-100 text-blue-700",
  bar: "bg-purple-100 text-purple-700",
  kitchen: "bg-orange-100 text-orange-700",
  club: "bg-pink-100 text-pink-700",
  cashier: "bg-green-100 text-green-700",
  kiosk: "bg-teal-100 text-teal-700",
  other: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
};

export default function TerminalsSection() {
  const [terminals, setTerminals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([api.getTerminals(), api.getOutlets()])
      .then(([t, o]) => { setTerminals(t); setOutlets(o); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const outletName = (id) => outlets.find((o) => o.id === id)?.name || "—";

  const openAdd = () => {
    setForm({ ...EMPTY, outlet_id: outlets[0]?.id || "" });
    setFormError("");
    setModal({ mode: "add" });
  };

  const openEdit = (t) => {
    setForm({ name: t.name, outlet_id: t.outlet_id, type: t.type, description: t.description || "" });
    setFormError("");
    setModal({ mode: "edit", id: t.id });
  };

  const closeModal = () => setModal(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.outlet_id) { setFormError("Please select an outlet."); return; }
    setSaving(true); setFormError("");
    try {
      if (modal.mode === "add") await api.createTerminal(form);
      else await api.updateTerminal(modal.id, form);
      closeModal(); load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete terminal "${t.name}"?`)) return;
    try { await api.deleteTerminal(t.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
            <Monitor size={20} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Terminals</h1>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
        >
          <Plus size={16} /> Add Terminal
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {terminals.map((t) => (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Monitor size={17} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight">{t.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{outletName(t.outlet_id)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button onClick={() => openEdit(t)} className="text-blue-500 hover:text-blue-700 transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(t)} className="text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-semibold",
                  TYPE_COLORS[t.type] || TYPE_COLORS.other
                )}>
                  {t.type}
                </span>
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-semibold",
                  t.active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                )}>
                  {t.active !== false ? "Active" : "Inactive"}
                </span>
              </div>
              {t.description && (
                <p className="mt-2 text-xs text-gray-400 truncate">{t.description}</p>
              )}
            </div>
          ))}
          {terminals.length === 0 && (
            <div className="col-span-3 py-16 text-center text-gray-400">
              <Monitor size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No terminals yet. Click "Add Terminal" to get started.</p>
            </div>
          )}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === "add" ? "Add Terminal" : "Edit Terminal"} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Terminal Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-blue-400 rounded-xl text-sm focus:outline-none focus:border-blue-600"
                placeholder="e.g. Bar Terminal 1"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Outlet</label>
              <div className="relative">
                <select
                  value={form.outlet_id}
                  onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-500 appearance-none bg-white dark:bg-gray-800"
                >
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">▾</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Type</label>
              <div className="relative">
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-500 appearance-none bg-white dark:bg-gray-800"
                >
                  {TERMINAL_TYPES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">▾</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
                placeholder="Optional description"
              />
            </div>
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
