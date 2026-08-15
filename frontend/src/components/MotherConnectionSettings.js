import React, { useEffect, useState } from "react";
import { Warehouse, CheckCircle2, X } from "lucide-react";
import { api } from "../lib/api";

export default function MotherConnectionSettings({ onClose }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [linkKey, setLinkKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getMotherConnection()
      .then((c) => { setConfigured(!!c.configured); if (c.base_url) setBaseUrl(c.base_url); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!baseUrl.trim()) { setError("Enter Mother Store's backend URL."); return; }
    if (!linkKey.trim()) { setError("Enter the link key Mother Store gave you."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.setMotherConnection({ base_url: baseUrl.trim(), link_key: linkKey.trim() });
      setConfigured(true);
      setLinkKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
          <Warehouse size={20} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 dark:text-white">Mother Store Connection</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Request stock from a central Mother Store deployment</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {configured && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
              <CheckCircle2 size={16} /> Connected to Mother Store
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
              <CheckCircle2 size={16} /> Saved.
            </div>
          )}
          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Mother Store Backend URL</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://mother-backend.onrender.com"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Link Key</label>
            <input type="password" value={linkKey} onChange={(e) => setLinkKey(e.target.value)}
              placeholder={configured ? "Already configured — enter a new key to replace it" : "Paste the key Mother Store gave you"}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500 font-mono" />
            <p className="mt-1 text-[11px] text-gray-400">Never shown again once saved — Mother Store's admin issues this when they link your business.</p>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save Connection"}
          </button>
        </>
      )}
    </div>
  );
}
