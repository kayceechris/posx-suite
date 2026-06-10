import React, { useState } from "react";
import { Wifi, Bluetooth, Loader2, AlertCircle } from "lucide-react";

/**
 * Shows WiFi and/or Bluetooth scan buttons on mobile/tablet only (< 1024px).
 * WiFi scan calls the local Print Bridge /scan endpoint (requires bridge running).
 * Bluetooth scan uses Web Bluetooth API (Chrome Android / Capacitor).
 *
 * Props:
 *   mode          "wifi" | "bluetooth" | "both"
 *   onSelectWifi(ip)      called when user picks a WiFi printer IP
 *   onSelectBluetooth(name) called when user pairs a BT device
 */
export default function MobilePrinterScanner({ mode = "both", onSelectWifi, onSelectBluetooth, forceShow = false }) {
  const [wifiScanning, setWifiScanning] = useState(false);
  const [wifiFound,    setWifiFound]    = useState([]);
  const [btScanning,   setBtScanning]   = useState(false);
  const [error,        setError]        = useState("");

  const bridgeUrl    = (localStorage.getItem("print_bridge_url") || "").trim().replace(/[).,\s]+$/, "").replace(/\/+$/, "");
  const hasBluetooth = typeof navigator !== "undefined" && !!navigator.bluetooth;
  const isVisible    = forceShow || (typeof window !== "undefined" && window.innerWidth < 1024);

  // Treat the default placeholder as "not configured"
  const hasValidBridgeUrl = !!bridgeUrl && !bridgeUrl.includes(".x:") && bridgeUrl !== "http://192.168.1.x:8765";

  const wantsWifi = isVisible && (mode === "wifi" || mode === "both");
  const showWifi  = wantsWifi && hasValidBridgeUrl;
  const showBT    = isVisible && (mode === "bluetooth" || mode === "both") && hasBluetooth;

  if (!wantsWifi && !showBT) return null;

  const scanWifi = async () => {
    setWifiScanning(true);
    setWifiFound([]);
    setError("");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);
      const r = await fetch(`${bridgeUrl}/scan`, {
        signal: controller.signal,
        mode: "cors",
        credentials: "omit",
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error("Bridge scan failed");
      const data = await r.json();
      const list = data.found || [];
      setWifiFound(list);
      if (list.length === 0) setError("No printers found on this network");
    } catch (e) {
      if (e.name === "AbortError") {
        setError("Scan timed out — check bridge.py is running");
      } else if (!e.message || e.message === "Failed to fetch" || e.message.includes("fetch")) {
        setError("Cannot reach bridge. Check: (1) bridge.py is running, (2) Windows Firewall allows port 8765, (3) phone is on the same Wi-Fi, (4) use https:// URL if app is on HTTPS");
      } else {
        setError(e.message);
      }
    } finally {
      setWifiScanning(false);
    }
  };

  const scanBluetooth = async () => {
    setBtScanning(true);
    setError("");
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb"],
      });
      if (device?.name && onSelectBluetooth) onSelectBluetooth(device.name);
    } catch (e) {
      if (e.name !== "NotFoundError" && e.name !== "AbortError") {
        setError(e.message || "Bluetooth error");
      }
    } finally {
      setBtScanning(false);
    }
  };

  return (
    <div className="space-y-2 mt-1.5">
      <div className="flex gap-2 flex-wrap items-center">
        {wantsWifi && !hasValidBridgeUrl && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertCircle size={11} />
            {bridgeUrl ? "Bridge URL looks like a placeholder — enter the actual PC IP below" : "Enter the Bridge URL below to enable WiFi scanning"}
          </p>
        )}
        {showWifi && (
          <button
            type="button"
            onClick={scanWifi}
            disabled={wifiScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-semibold border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            {wifiScanning ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
            {wifiScanning ? "Scanning network…" : "Scan WiFi"}
          </button>
        )}
        {showBT && (
          <button
            type="button"
            onClick={scanBluetooth}
            disabled={btScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-semibold border border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/50 disabled:opacity-50 transition-colors"
          >
            {btScanning ? <Loader2 size={12} className="animate-spin" /> : <Bluetooth size={12} />}
            {btScanning ? "Opening Bluetooth…" : "Scan Bluetooth"}
          </button>
        )}
      </div>

      {wifiFound.length > 0 && (
        <div className="border-2 border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
          <p className="px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
            Found {wifiFound.length} printer{wifiFound.length !== 1 ? "s" : ""}
          </p>
          {wifiFound.map((ip) => (
            <button
              key={ip}
              type="button"
              onClick={() => { onSelectWifi && onSelectWifi(ip); setWifiFound([]); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900 last:border-0 transition-colors"
            >
              <span className="font-mono text-gray-800 dark:text-gray-200">{ip}</span>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Select →</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}
