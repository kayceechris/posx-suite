import React from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { useOffline } from "../context/OfflineContext";

export default function OfflineBanner() {
  const { isOnline, queueCount, syncing, syncResult, syncQueue, dismissResult } = useOffline();

  // Post-sync result toast
  if (syncResult) {
    const allOk = syncResult.failed === 0;
    return (
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold ${allOk ? "bg-emerald-600" : "bg-amber-600"}`}>
        {allOk ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        {allOk
          ? `${syncResult.success} offline order${syncResult.success !== 1 ? "s" : ""} synced`
          : `${syncResult.success} synced, ${syncResult.failed} failed — retry when connection improves`}
        <button onClick={dismissResult} className="ml-2 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
      </div>
    );
  }

  // Syncing spinner
  if (syncing) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl bg-blue-600 text-white text-sm font-semibold">
        <RefreshCw size={16} className="animate-spin" />
        Syncing offline orders…
      </div>
    );
  }

  // Offline — orders in queue
  if (!isOnline && queueCount > 0) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl bg-amber-600 text-white text-sm font-semibold">
        <WifiOff size={16} />
        {queueCount} order{queueCount !== 1 ? "s" : ""} queued — will sync when connected
      </div>
    );
  }

  // Offline — nothing queued
  if (!isOnline) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl bg-red-600 text-white text-sm font-semibold">
        <WifiOff size={16} />
        You're offline — new orders will be saved and synced automatically
      </div>
    );
  }

  // Online but queue not yet flushed (failed sync items remain)
  if (queueCount > 0) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl bg-amber-500 text-white text-sm font-semibold">
        <AlertTriangle size={16} />
        {queueCount} order{queueCount !== 1 ? "s" : ""} pending
        <button onClick={syncQueue} className="underline underline-offset-2 hover:no-underline">
          Sync now
        </button>
      </div>
    );
  }

  return null;
}
