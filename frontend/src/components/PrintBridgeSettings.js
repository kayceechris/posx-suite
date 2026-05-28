import React, { useState } from "react";
import { Printer, Wifi, CheckCircle2, XCircle, Loader2, X } from "lucide-react";
import { printService } from "../utils/printService";

export default function PrintBridgeSettings({ onClose }) {
  const [testing, setTesting] = useState(false);
  const [status,  setStatus]  = useState(null); // null | "ok" | "fail"

  const testBridge = async () => {
    setTesting(true);
    setStatus(null);
    const ok = await printService.testBridge();
    setStatus(ok ? "ok" : "fail");
    setTesting(false);
  };

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
        <p className="font-bold text-sm">How to set up:</p>
        <p>1. Double-click <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">start.bat</code> on the Windows PC — it connects automatically.</p>
        <p>2. Tap <strong>Test Bridge</strong> below to confirm the connection.</p>
        <p>3. Add printers in Terminal Settings → Printers tab.</p>
        <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700 text-green-700 dark:text-green-400">
          <p className="font-bold">✓ Works on all browsers and devices — no Chrome flags or cert setup needed.</p>
        </div>
      </div>

      {/* Status */}
      {status === "ok" && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
          <CheckCircle2 size={16} /> Bridge is connected and ready!
        </div>
      )}
      {status === "fail" && (
        <div className="px-4 py-3 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 space-y-1">
          <div className="flex items-center gap-2"><XCircle size={16} /> Bridge not connected.</div>
          <div className="text-xs opacity-80">Make sure start.bat is running on the PC.</div>
        </div>
      )}

      {/* Button */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={testBridge}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          {testing ? <Loader2 size={15} className="animate-spin" /> : <Wifi size={15} />}
          {testing ? "Testing..." : "Test Bridge"}
        </button>
      </div>
    </div>
  );
}
