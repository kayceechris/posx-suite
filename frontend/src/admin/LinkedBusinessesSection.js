import React, { useEffect, useState } from "react";
import { Building2, CheckCircle2, AlertTriangle, Copy, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

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

// Shown exactly once, right after creation — this is the only time the
// plaintext link key is ever available. The admin needs to copy it into
// the business's own Settings → Mother Store Connection.
function KeyRevealModal({ business, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(business.link_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">"{business.name}" linked</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
            Copy this key now — it will not be shown again. Paste it into <strong>{business.name}</strong>'s own Settings → Mother Store Connection, along with this Mother deployment's URL.
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Link Key</label>
            <div className="flex gap-2">
              <input readOnly value={business.link_key}
                className="flex-1 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white rounded-xl text-sm font-mono focus:outline-none" />
              <button onClick={copy}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-1.5">
                <Copy size={14} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

function NewBusinessModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Enter a business name."); return; }
    if (!baseUrl.trim()) { setError("Enter the business's backend URL."); return; }
    setSaving(true); setError("");
    try {
      const created = await api.createLinkedBusiness({ name: name.trim(), base_url: baseUrl.trim() });
      onCreated(created);
    } catch (err) {
      setError(err.message || "Failed to create linked business");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">Link a Business</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">{error}</div>}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Business Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Melbourne"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Backend URL</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://their-backend.onrender.com"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
            <p className="mt-1 text-[11px] text-gray-400">The business's own backend API URL, not their storefront/admin URL.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? "Creating…" : "Create & Get Key"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LinkedBusinessesSection() {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [revealBusiness, setRevealBusiness] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    api.getLinkedBusinesses().then(setBusinesses).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleToggleActive = async (b) => {
    try {
      await api.updateLinkedBusiness(b.id, { active: !b.active });
      load();
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Remove "${b.name}"? They'll no longer be able to request stock.`)) return;
    try {
      await api.deleteLinkedBusiness(b.id);
      setToast({ msg: `"${b.name}" removed.`, type: "success" });
      load();
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Linked Businesses</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Businesses this Mother Store supplies</p>
          </div>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
          <Plus size={16} /> Link a Business
        </button>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : businesses.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-8 py-16 text-center">
          <Building2 size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No businesses linked yet.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Business</th>
                <th className="text-left px-4 py-3">Backend URL</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {businesses.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white text-sm">{b.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-xs">{b.base_url}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggleActive(b)}
                      className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold",
                        b.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400")}>
                      {b.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleDelete(b)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewBusinessModal
          onClose={() => setShowNew(false)}
          onCreated={(created) => { setShowNew(false); setRevealBusiness(created); load(); }}
        />
      )}

      {revealBusiness && (
        <KeyRevealModal business={revealBusiness} onClose={() => setRevealBusiness(null)} />
      )}
    </div>
  );
}
