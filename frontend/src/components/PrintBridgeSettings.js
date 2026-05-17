import React, { useState } from "react";
import { Printer, Wifi, CheckCircle2, XCircle, Loader2, Save, X, ExternalLink, ShieldAlert } from "lucide-react";
import { printService } from "../utils/printService";

export default function PrintBridgeSettings({ onClose }) {
  const [bridgeUrl,   setBridgeUrl]   = useState(() => localStorage.getItem("print_bridge_url")   || "");
  const [bridgeToken, setBridgeToken] = useState(() => localStorage.getItem("print_bridge_token") || "posx-bridge-2025");
  const [testing,     setTesting]     = useState(false);
  const [status,      setStatus]      = useState(null); // null | "ok" | "fail"
  const [saved,       setSaved]       = useState(false);

  const isHttps = bridgeUrl.trim().toLowerCase().startsWith("https://");

  const testBridge = async () => {
    setTesting(true);
    setStatus(null);
    const cleanUrl = bridgeUrl.trim().replace(/[).,\s]+$/, "").replace(/\/+$/, "");
    const ok = await printService.testBridge(cleanUrl);
    setStatus(ok ? "ok" : "fail");
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
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-300 space-y-2">
        <p className="font-bold">How to set up:</p>
        <p>1. Double-click <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">start.bat</code> on the Windows PC — click <strong>Yes</strong> on the UAC prompt to trust the certificate</p>
        <p>2. Enter the bridge URL below, click <strong>Save Settings</strong>, then <strong>Test Bridge</strong></p>
        <p>3. Add printers in Terminal Settings → Printers tab</p>
        <div className="mt-1 pt-2 border-t border-blue-200 dark:border-blue-700 space-y-1">
          <p className="font-bold text-green-700 dark:text-green-400">Using this app on the same PC as the bridge?</p>
          <p>Use <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded font-bold">http://localhost:8765</code> as the Bridge URL — no certificate needed.</p>
          <p className="text-blue-500 dark:text-blue-400">Use the IP address (e.g. <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://192.168.1.10:8765</code>) only when connecting from a tablet or different device.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Bridge URL */}
        <div>
          <label className={LABEL}>Bridge URL (PC running bridge.py)</label>
          <input
            className={INPUT}
            value={bridgeUrl}
            onChange={(e) => setBridgeUrl(e.target.value)}
            placeholder="http://192.168.1.10:8765"
          />
        </div>

        {/* Bridge Token */}
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

      {/* HTTPS cert hint shown whenever URL is https and not yet confirmed working */}
      {isHttps && status !== "ok" && (
        <div className="px-4 py-3 rounded-xl text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 space-y-1.5">
          <div className="flex items-start gap-2">
            <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
            <span><strong>HTTPS certificate required.</strong> If the app is running on the same PC as the bridge, switch to <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded font-bold">http://localhost:8765</code> — no certificate needed.</span>
          </div>
          <p>If using a tablet or remote device: run <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">start.bat</code> on the bridge PC and click <strong>Yes</strong> on the UAC prompt to trust the certificate, then fully restart Chrome.</p>
        </div>
      )}

      {/* Status indicator */}
      {status === "ok" && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
          <CheckCircle2 size={16} /> Bridge is reachable!
        </div>
      )}

      {status === "fail" && (
        <div className="rounded-xl overflow-hidden border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
            <XCircle size={16} /> Cannot reach bridge. Check the URL and that bridge.py is running.
          </div>
          {isHttps && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800 space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  <strong>HTTPS certificate not accepted.</strong> Chrome blocks connections to self-signed certificates from web apps.
                  You must open the bridge URL directly in this browser and accept the certificate first.
                </span>
              </div>
              <a
                href={`${bridgeUrl.trim().replace(/\/+$/, "")}/health`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors"
              >
                <ExternalLink size={12} /> Open bridge in new tab to accept certificate
              </a>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                After clicking "Advanced → Proceed", come back and click Test Bridge again.
              </p>
            </div>
          )}
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
