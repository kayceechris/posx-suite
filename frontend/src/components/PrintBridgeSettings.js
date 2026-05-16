import React, { useState, useEffect } from "react";
import { Printer, Wifi, CheckCircle2, XCircle, Loader2, Save } from "lucide-react";
import { printService } from "../utils/printService";

export default function PrintBridgeSettings() {
  const [bridgeUrl,    setBridgeUrl]    = useState(() => localStorage.getItem("print_bridge_url")    || "http://192.168.1.x:8765");
  const [printerIp,    setPrinterIp]    = useState(() => localStorage.getItem("print_printer_ip")    || "");
  const [printerPort,  setPrinterPort]  = useState(() => localStorage.getItem("print_printer_port")  || "9100");
  const [bridgeToken,  setBridgeToken]  = useState(() => localStorage.getItem("print_bridge_token")  || "posx-bridge-2025");
  const [testing,      setTesting]      = useState(false);
  const [status,       setStatus]       = useState(null); // null | "ok" | "fail"
  const [saved,        setSaved]        = useState(false);

  const testBridge = async () => {
    setTesting(true);
    setStatus(null);
    const ok = await printService.testBridge(bridgeUrl);
    setStatus(ok ? "ok" : "fail");
    setTesting(false);
  };

  const save = () => {
    localStorage.setItem("print_bridge_url",   bridgeUrl);
    localStorage.setItem("print_printer_ip",   printerIp);
    localStorage.setItem("print_printer_port", printerPort);
    localStorage.setItem("print_bridge_token", bridgeToken);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testPrint = async () => {
    await printService.printReceipt(
      {
        businessName : "POSx Suite",
        orderNo      : "TEST-001",
        tableName    : "T1",
        items        : [{ name: "Test Item", quantity: 1, price: 1000 }],
        subtotal     : 1000,
        total        : 1000,
        paymentMethod: "cash",
        footer       : "Test print successful!",
      },
      { bridgeUrl, ip: printerIp, port: Number(printerPort) }
    );
  };

  const INPUT = "w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-blue-500";
  const LABEL = "block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center">
          <Printer size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">Local Print Bridge</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Connect to Wi-Fi/network thermal printers silently</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-300 space-y-1">
        <p className="font-bold mb-1">How to set up:</p>
        <p>1. Run <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">bridge.py</code> on a Windows PC on your restaurant Wi-Fi</p>
        <p>2. Note the IP shown (e.g. <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">192.168.1.10:8765</code>)</p>
        <p>3. Enter the bridge URL and your printer IP below</p>
        <p>4. Click Test Bridge → Test Print</p>
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

        {/* Printer IP + Port */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={LABEL}>Printer IP Address</label>
            <input
              className={INPUT}
              value={printerIp}
              onChange={(e) => setPrinterIp(e.target.value)}
              placeholder="192.168.1.50"
            />
          </div>
          <div>
            <label className={LABEL}>Port</label>
            <input
              className={INPUT}
              value={printerPort}
              onChange={(e) => setPrinterPort(e.target.value)}
              placeholder="9100"
            />
          </div>
        </div>
      </div>

      {/* Status indicator */}
      {status && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          status === "ok"
            ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
            : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
        }`}>
          {status === "ok"
            ? <><CheckCircle2 size={16} /> Bridge is reachable! ✓</>
            : <><XCircle size={16} /> Cannot reach bridge. Check URL and that bridge.py is running.</>}
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
          onClick={testPrint}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
        >
          <Printer size={15} />
          Test Print
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
