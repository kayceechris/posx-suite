import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff, X } from "lucide-react";
import { useOffline } from "../context/OfflineContext";

// Rejected queued items (e.g. a 409 — another staff member already claimed
// the table first) never resolve themselves by retrying. Shown as its own
// persistent panel — separate from the single-line status banner below,
// since each item needs its own Reassign/Discard actions.
function FailedItemsPanel({ items, onDiscard, onReassign }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] w-[min(90vw,420px)] bg-white dark:bg-gray-800 border-2 border-red-300 dark:border-red-700 rounded-2xl shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800">
        <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
        <span className="text-sm font-bold text-red-700 dark:text-red-400">
          {items.length} order{items.length !== 1 ? "s" : ""} couldn't sync
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
        {items.map((item) => (
          <div key={item.id} className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              {item.label || "Order"}
            </p>
            {item.error && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{item.error}</p>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onReassign(item)}
                className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Reassign to another table
              </button>
              <button
                onClick={() => onDiscard(item.id)}
                title="Discard"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OfflineBanner() {
  const { isOnline, queueCount, failedItems, syncing, syncResult, syncQueue, dismissResult, discardItem } = useOffline();
  const navigate = useNavigate();

  const handleReassign = async (item) => {
    await discardItem(item.id);
    navigate("/tables", { state: { reassignCart: item.payload } });
  };

  const failedPanel = (
    <FailedItemsPanel items={failedItems} onDiscard={discardItem} onReassign={handleReassign} />
  );

  // Post-sync result toast
  if (syncResult) {
    const allOk = syncResult.failed === 0;
    return (
      <>
        {failedPanel}
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold ${allOk ? "bg-emerald-600" : "bg-amber-600"}`}>
          {allOk ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {allOk
            ? `${syncResult.success} offline order${syncResult.success !== 1 ? "s" : ""} synced`
            : `${syncResult.success} synced, ${syncResult.failed} failed`}
          <button onClick={dismissResult} className="ml-2 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      </>
    );
  }

  // Syncing spinner
  if (syncing) {
    return (
      <>
        {failedPanel}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl bg-blue-600 text-white text-sm font-semibold">
          <RefreshCw size={16} className="animate-spin" />
          Syncing offline orders…
        </div>
      </>
    );
  }

  // Offline — orders in queue
  if (!isOnline && queueCount > 0) {
    return (
      <>
        {failedPanel}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl bg-amber-600 text-white text-sm font-semibold">
          <WifiOff size={16} />
          {queueCount} order{queueCount !== 1 ? "s" : ""} queued — will sync when connected
        </div>
      </>
    );
  }

  // Offline — nothing queued
  if (!isOnline) {
    return (
      <>
        {failedPanel}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl bg-red-600 text-white text-sm font-semibold">
          <WifiOff size={16} />
          You're offline — new orders will be saved and synced automatically
        </div>
      </>
    );
  }

  // Online but queue not yet flushed
  if (queueCount > 0) {
    return (
      <>
        {failedPanel}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl bg-amber-500 text-white text-sm font-semibold">
          <AlertTriangle size={16} />
          {queueCount} order{queueCount !== 1 ? "s" : ""} pending
          <button onClick={syncQueue} className="underline underline-offset-2 hover:no-underline">
            Sync now
          </button>
        </div>
      </>
    );
  }

  return failedPanel;
}
