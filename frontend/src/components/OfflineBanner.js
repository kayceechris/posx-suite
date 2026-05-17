import React, { useEffect, useState } from "react";
import { WifiOff, RefreshCw, Wifi } from "lucide-react";
import { triggerSync } from "../serviceWorkerRegistration";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [justCameOnline, setJustCameOnline] = useState(false);

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    triggerSync();
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      setJustCameOnline(true);
      setTimeout(() => setJustCameOnline(false), 4000);
      // Auto-sync as soon as connection is restored
      setSyncing(true);
      triggerSync();
      setTimeout(() => window.location.reload(), 800);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline && !justCameOnline) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-all
      ${offline ? "bg-red-600 text-white" : "bg-emerald-500 text-white"}`}>
      <div className="flex items-center gap-2">
        {offline
          ? <WifiOff size={16} />
          : <Wifi size={16} />}
        <span>
          {offline
            ? "You are offline — showing cached data"
            : "Back online!"}
        </span>
      </div>
      {offline && (
        <span className="text-red-200 text-xs">Orders will sync when connection is restored</span>
      )}
      {justCameOnline && !offline && (
        <span className="flex items-center gap-1.5 text-xs font-bold">
          <RefreshCw size={13} className="animate-spin" />
          Syncing…
        </span>
      )}
    </div>
  );
}
