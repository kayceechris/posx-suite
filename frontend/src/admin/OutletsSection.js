import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Monitor } from "lucide-react";
import { api } from "../lib/api";

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

const OUTLET_TYPES = ["restaurant", "bar", "cafe", "warehouse", "retail", "other"];
const TERMINAL_TYPES = ["POS", "Bar", "Kitchen", "Drive-through", "Self-service"];

// â”€â”€â”€ All Outlets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AllOutlets() {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", type: "restaurant", address: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => {
    setLoading(true);
    api.getOutlets().then(setOutlets).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setForm({ name: "", type: "restaurant", address: "", phone: "" });
    setFormError(""); setModal({ mode: "add" });
  };
  const openEdit = (o) => {
    setForm({ name: o.name, type: o.type, address: o.address || "", phone: o.phone || "" });
    setFormError(""); setModal({ mode: "edit", id: o.id });
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setFormError("");
    try {
      if (modal.mode === "add") await api.createOutlet(form);
      else await api.updateOutlet(modal.id, form);
      setModal(null); load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (o) => {
    if (!window.confirm(`Delete outlet "${o.name}"?`)) return;
    try { await api.deleteOutlet(o.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">All Outlets</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{outlets.length} locations</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
          <Plus size={16} /> Add Outlet
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-6 py-3">Name</th>
                <th className="text-left px-6 py-3">Type</th>
                <th className="text-left px-6 py-3">Address</th>
                <th className="text-left px-6 py-3">Phone</th>
                <th className="text-left px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {outlets.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">
                  <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-sm">{o.name}</td>
                  <td className="px-6 py-4"><span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold capitalize">{o.type}</span></td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300 text-sm">{o.address || "—"}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300 text-sm">{o.phone || "—"}</td>
                  <td className="px-6 py-4 flex items-center gap-2">
                    <button onClick={() => openEdit(o)} className="text-gray-400 hover:text-blue-500 transition-colors"><Pencil size={15} /></button>
                    <button onClick={() => handleDelete(o)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
              {outlets.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No outlets yet</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "Add Outlet" : "Edit Outlet"} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Outlet Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
                placeholder="e.g. Main Branch" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
                placeholder="Street, City" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
                {OUTLET_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Phone (optional)</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
                placeholder="+1 234 567 890" />
            </div>
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <button type="submit" disabled={saving}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : modal.mode === "add" ? "Add Outlet" : "Save Changes"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// â”€â”€â”€ Terminals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Terminals() {
  const [terminals, setTerminals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", outlet_id: "", type: "POS", description: "" });
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

  const outletName = (id) => outlets.find((o) => o.id === id)?.name || "Unknown";

  const openAdd = () => {
    setForm({ name: "", outlet_id: outlets[0]?.id || "", type: "POS", description: "" });
    setFormError(""); setModal({ mode: "add" });
  };
  const openEdit = (t) => {
    setForm({ name: t.name, outlet_id: t.outlet_id, type: (t.type || "pos").charAt(0).toUpperCase() + (t.type || "pos").slice(1), description: t.description || "" });
    setFormError(""); setModal({ mode: "edit", id: t.id });
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setFormError("");
    try {
      const payload = { ...form, type: form.type.toLowerCase() };
      if (modal.mode === "add") await api.createTerminal(payload);
      else await api.updateTerminal(modal.id, payload);
      setModal(null); load();
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Monitor size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Terminals</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{terminals.length} terminals configured</p>
          </div>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
          <Plus size={16} /> Add Terminal
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : terminals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Monitor size={56} className="mb-4 opacity-20" />
          <p className="font-semibold text-gray-500 dark:text-gray-400">No terminals configured</p>
          <p className="text-sm mt-1">Add terminals to your outlets to start processing orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {terminals.map((t) => (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Monitor size={18} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">{t.name}</p>
                    <p className="text-xs text-gray-400">{outletName(t.outlet_id)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-blue-500 transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(t)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs font-semibold uppercase">{t.type}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                  {t.active !== false ? "Active" : "Inactive"}
                </span>
              </div>
              {t.description && <p className="text-xs text-gray-400 mt-2">{t.description}</p>}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === "add" ? "Add Terminal" : "Edit Terminal"} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Terminal Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
                placeholder="e.g. Bar Terminal 1" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Outlet</label>
              <select required value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
                <option value="">Select outlet…</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
                {TERMINAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Description (optional)</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
                placeholder="Optional description" />
            </div>
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(null)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : modal.mode === "add" ? "Create" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// â”€â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function OutletsSection({ view = "outlets" }) {
  return view === "terminals" ? <Terminals /> : <AllOutlets />;
}
