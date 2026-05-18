import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { offlineQueue } from "../utils/offlineQueue";
import { api } from "../lib/api";

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline]           = useState(navigator.onLine);
  const [queueCount, setQueueCount]       = useState(0);
  const [syncing, setSyncing]             = useState(false);
  const [syncResult, setSyncResult]       = useState(null); // { success, failed } | null
  const syncingRef                        = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const n = await offlineQueue.count();
      setQueueCount(n);
    } catch {}
  }, []);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

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
    if (items.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    setSyncResult(null);

    let success = 0;
    let failed  = 0;

    for (const item of items) {
      try {
        await api.createOrder(item.payload);
        await offlineQueue.remove(item.id);
        success++;
      } catch {
        failed++;
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    setSyncResult({ success, failed });
    await refreshCount();

    // Auto-dismiss sync result after 5 s
    setTimeout(() => setSyncResult(null), 5000);
  }, [refreshCount]);

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
    await refreshCount();
  }, [refreshCount]);

  const dismissResult = useCallback(() => setSyncResult(null), []);

  return (
    <OfflineContext.Provider value={{ isOnline, queueCount, syncing, syncResult, queueOrder, syncQueue, dismissResult }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used inside <OfflineProvider>");
  return ctx;
}
