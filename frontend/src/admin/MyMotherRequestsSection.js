import React, { useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

const STATUS_META = {
  pending:         { label: "Pending",         cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  approved:        { label: "Approved",        cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  rejected:        { label: "Rejected",        cls: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" },
  delivered:       { label: "Delivered",       cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  delivery_failed: { label: "Delivery Failed", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

export default function MyMotherRequestsSection() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true); setError("");
    api.getMyMotherRequests().then(setRequests).catch((err) => setError(err.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">My Mother Requests</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Status of stock you've requested from Mother Store</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-8 py-16 text-center">
          <ClipboardList size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {error ? "Set up your connection under Settings → Mother Store Connection." : "No requests sent yet."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-4 py-3">Items</th>
                <th className="text-left px-4 py-3">Into</th>
                <th className="text-center px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {requests.map((req) => {
                const meta = STATUS_META[req.status] || STATUS_META.pending;
                return (
                  <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(req.created_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {req.items.map((it) => `${it.name} ×${it.quantity_requested}`).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 capitalize">{req.destination_store}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", meta.cls)}>{meta.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
