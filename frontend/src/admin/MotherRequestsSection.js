import React, { useEffect, useState } from "react";
import { ClipboardList, CheckCircle2, AlertTriangle, X, RefreshCw } from "lucide-react";
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

const STATUS_META = {
  pending:         { label: "Pending",         cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  approved:        { label: "Approved",        cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  rejected:        { label: "Rejected",        cls: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" },
  delivered:       { label: "Delivered",       cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  delivery_failed: { label: "Delivery Failed", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function RequestCard({ req, onChanged, setToast }) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[req.status] || STATUS_META.pending;

  const act = async (action, apiCall) => {
    setBusy(true);
    try {
      await apiCall();
      onChanged();
    } catch (err) {
      setToast({ msg: err.message || `Failed to ${action}`, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="font-bold text-gray-900 dark:text-white text-sm">{req.business_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(req.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            {" · "}Deliver to <strong className="capitalize">{req.destination_store}</strong>
          </p>
        </div>
        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0", meta.cls)}>{meta.label}</span>
      </div>

      <div className="space-y-1 mb-3">
        {req.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-200">{it.name} <span className="text-gray-400 font-mono text-xs">({it.sku})</span></span>
            <span className="font-semibold text-gray-900 dark:text-white">{it.quantity_requested}</span>
          </div>
        ))}
      </div>

      {req.notes && <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg p-2 mb-3">{req.notes}</p>}

      {req.status === "delivery_failed" && req.delivery_error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-2 mb-3">{req.delivery_error}</p>
      )}

      {req.status === "pending" && (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => act("approve", () => api.approveMotherRequisition(req.id))}
            className="flex-1 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition-colors">
            {busy ? "Approving…" : "Approve"}
          </button>
          <button disabled={busy} onClick={() => act("reject", () => api.rejectMotherRequisition(req.id))}
            className="flex-1 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition-colors">
            Reject
          </button>
        </div>
      )}

      {req.status === "delivery_failed" && (
        <button disabled={busy} onClick={() => act("retry delivery", () => api.retryMotherRequisitionDelivery(req.id))}
          className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {busy ? "Retrying…" : "Retry Delivery"}
        </button>
      )}
    </div>
  );
}

export default function MotherRequestsSection() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    api.getMotherRequisitions(statusFilter === "all" ? undefined : statusFilter)
      .then(setRequests).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Mother Requests</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Incoming stock requests from linked businesses</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex gap-2 mb-5 flex-wrap">
        {["pending", "delivery_failed", "delivered", "rejected", "all"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors",
              statusFilter === s ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700")}>
            {s === "all" ? "All" : (STATUS_META[s]?.label || s)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 px-8 py-16 text-center">
          <ClipboardList size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No requests here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {requests.map((req) => (
            <RequestCard key={req.id} req={req} onChanged={load} setToast={setToast} />
          ))}
        </div>
      )}
    </div>
  );
}
