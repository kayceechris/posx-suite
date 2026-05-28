import React, { useState } from "react";
import { Printer, Wifi, CheckCircle2, XCircle, Loader2, Save, X } from "lucide-react";
import { printService } from "../utils/printService";

export default function PrintBridgeSettings({ onClose }) {
  const [bridgeUrl,   setBridgeUrl]   = useState(() => localStorage.getItem("print_bridge_url")   || "");
  const [bridgeToken, setBridgeToken] = useState(() => localStorage.getItem("print_bridge_token") || "posx-bridge-2025");
  const [testing,     setTesting]     = useState(false);
  const [status,      setStatus]      = useState(null); // null | "ok" | "fail"
  const [saved,       setSaved]       = useState(false);

  const [bridgeError, setBridgeError] = useState(null);

  const testBridge = async () => {
    setTesting(true);
    setStatus(null);
    setBridgeError(null);
    const cleanUrl = bridgeUrl.trim().replace(/[).,\s]+$/, "").replace(/\/+$/, "");
    const result = await printService.testBridge(cleanUrl);
    if (result?.ok) {
      setStatus("ok");
    } else {
      setStatus("fail");
      setBridgeError(result?.error || null);
    }
    setTesting(false);
  };

  const save = () => {
    const cleanUrl = bridgeUrl.trim().replace(/[).,\s]+$/, "").replace(/\/+$/, "");
    if (cleanUrl !== bridgeUrl) setBridgeUrl(cleanUrl);
    localStorage.setItem("print_bridge_url",   cleanUrl);
    localStorage.setItem("print_bridge_token", bridgeToken);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const INPUT = "w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-500";
  const LABEL = "block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
          <Printer size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 dark:text-white">Local Print Bridge</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Connect to Wi-Fi/network thermal printers silently</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      {/* How it works */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-300 space-y-1.5">
        <p className="font-bold">How to set up:</p>
        <p>1. Place <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">mkcert.exe</code> in the print-bridge folder, then double-click <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">start.bat</code></p>
        <p>2. Copy the <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://</code> URL shown and paste it below</p>
        <p>3. Click <strong>Save Settings</strong>, then <strong>Test Bridge</strong></p>
        <p>4. Add printers in Terminal Settings → Printers tab</p>
        <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
          <p><strong>Same PC as bridge?</strong> Use <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded font-bold">https://localhost:8765</code></p>
          <p><strong>Tablet / phone?</strong> Use the <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://</code> IP address shown in the bridge window</p>
        </div>
        <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2">
          <p className="font-bold text-orange-700 dark:text-orange-400">Android one-time setup (per device):</p>
          <p className="mt-1">1. Copy <code className="bg-orange-100 dark:bg-orange-900 px-1 rounded">rootCA.pem</code> from the PC to the device</p>
          <p>2. Settings → Biometrics and security → Install from device storage → <strong>CA certificate</strong></p>
          <p>3. Tap <strong>Test Bridge</strong> — Chrome will ask "Allow access to local network?" → tap <strong>Allow</strong></p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className={LABEL}>Bridge URL (PC running bridge.py)</label>
          <input
            className={INPUT}
            value={bridgeUrl}
            onChange={(e) => { setBridgeUrl(e.target.value); setStatus(null); }}
            placeholder="https://192.168.1.10:8765"
          />
        </div>
        <div>
          <label className={LABEL}>Bridge Secret Token</label>
          <input
            className={INPUT}
            value={bridgeToken}
            onChange={(e) => setBridgeToken(e.target.value)}
            placeholder="posx-bridge-2025"
          />
          <p className="text-xs text-gray-400 mt-1">Must match the SECRET_TOKEN in bridge.py</p>
        </div>
      </div>

      {/* Status */}
      {status === "ok" && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
          <CheckCircle2 size={16} /> Bridge is reachable!
        </div>
      )}
      {status === "fail" && (
        <div className="px-4 py-3 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 space-y-1">
          <div className="flex items-center gap-2"><XCircle size={16} /> Cannot reach bridge.</div>
          {bridgeError && <div className="text-xs font-mono break-all opacity-80">{bridgeError}</div>}
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={testBridge}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          {testing ? <Loader2 size={15} className="animate-spin" /> : <Wifi size={15} />}
          {testing ? "Testing..." : "Test Bridge"}
        </button>
        <button
          onClick={save}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors ml-auto"
        >
          {saved ? <><CheckCircle2 size={15} /> Saved!</> : <><Save size={15} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}
