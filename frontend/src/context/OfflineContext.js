import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { offlineQueue } from "../utils/offlineQueue";
import { api } from "../lib/api";

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline]           = useState(navigator.onLine);
  const [queueCount, setQueueCount]       = useState(0);
  // Items that got a real server rejection (e.g. a 409 — someone else
  // already claimed the table first) rather than a network failure. These
  // stop being auto-retried (retrying won't ever fix a rejection) but stay
  // visible so the user can Discard or Reassign them. Separate from
  // queueCount, which only counts items still waiting to sync normally.
  const [failedItems, setFailedItems]     = useState([]);
  const [syncing, setSyncing]             = useState(false);
  const [syncResult, setSyncResult]       = useState(null); // { success, failed } | null
  const syncingRef                        = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      const items = await offlineQueue.getAll();
      setQueueCount(items.filter((i) => !i.failed).length);
      setFailedItems(items.filter((i) => i.failed));
    } catch {}
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const items = await offlineQueue.getAll();
    const pending = items.filter((i) => !i.failed);
    if (pending.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    setSyncResult(null);

    let success = 0;
    let failed  = 0;

    for (const item of pending) {
      try {
        if (item.type === "update_order") {
          await api.updateOrder(item.payload.order_id, item.payload.data);
        } else if (item.type === "complete_order") {
          await api.completeOrder(item.payload.order_id, item.payload.method);
        } else {
          // checkout, hold, send_kitchen
          await api.createOrder(item.payload);
        }
        await offlineQueue.remove(item.id);
        success++;
      } catch (err) {
        // A real server rejection (4xx) — e.g. the 409 raised when another
        // staff member already claimed the table first — will never
        // resolve itself by retrying. Mark it failed so it stops being
        // retried but stays visible for the user to act on. A network
        // error (no err.status — request() only sets it once a response
        // actually came back) is left untouched so it keeps retrying
        // automatically on the next reconnect, same as before.
        if (err.status && err.status >= 400 && err.status < 500) {
          await offlineQueue.update(item.id, { failed: true, error: err.message });
        }
        failed++;
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    setSyncResult({ success, failed });
    await refreshQueue();

    // Auto-dismiss sync result after 5 s
    setTimeout(() => setSyncResult(null), 5000);
  }, [refreshQueue]);

  // Auto-sync when coming back online
  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    const wasOffline = !isOnlineRef.current;
    isOnlineRef.current = isOnline;
    if (isOnline && wasOffline) {
      syncQueue();
    }
  }, [isOnline, syncQueue]);

  const queueOrder = useCallback(async (type, payload, label = "") => {
    const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await offlineQueue.push({ id, type, payload, label, timestamp: Date.now() });
    await refreshQueue();
  }, [refreshQueue]);

  const dismissResult = useCallback(() => setSyncResult(null), []);

  // Drop a failed item — used both for a plain Discard and as the cleanup
  // step before Reassign hands its payload off to a fresh table pick.
  const discardItem = useCallback(async (id) => {
    await offlineQueue.remove(id);
    await refreshQueue();
  }, [refreshQueue]);

  return (
    <OfflineContext.Provider value={{
      isOnline, queueCount, failedItems, syncing, syncResult,
      queueOrder, syncQueue, dismissResult, discardItem,
    }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used inside <OfflineProvider>");
  return ctx;
}
