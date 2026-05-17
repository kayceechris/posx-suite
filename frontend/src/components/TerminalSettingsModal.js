import React, { useEffect, useState } from "react";
import { ChevronDown, Plus, Printer, Trash2, Check, X, Wifi, Usb, Globe, Bluetooth, Monitor, ExternalLink, Cpu } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import MobilePrinterScanner from "./MobilePrinterScanner";
import { useAuth } from "../context/AuthContext";

const TABS = ["Terminal", "Printers", "Display", "Peripherals"];

const PRINTER_TYPES = ["receipt", "kitchen", "bar", "label"];
const ALL_CONN_MODES = [
  { value: "usb",       label: "USB",       icon: Usb },
  { value: "network",   label: "Network (IP)", icon: Wifi },
  { value: "bluetooth", label: "Bluetooth", icon: Bluetooth },
  { value: "browser",   label: "Browser",   icon: Globe },
];

function detectMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const CONN_ICON = {
  usb:       <Usb size={11} className="inline mr-0.5" />,
  network:   <Wifi size={11} className="inline mr-0.5" />,
  bluetooth: <Bluetooth size={11} className="inline mr-0.5" />,
  browser:   <Globe size={11} className="inline mr-0.5" />,
};

function getPrintSetting(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)); }
  catch { return fallback; }
}

export default function TerminalSettingsModal({
  terminals = [],
  outlets = [],
  selectedTerminal = "",
  selectedOutlet = "",
  onSave,
  onClose,
}) {
  const { user } = useAuth();
  const isAdmin = ["admin", "manager"].includes(user?.role);
  const isMobile = detectMobile();
  const CONN_MODES = isMobile
    ? ALL_CONN_MODES.filter((m) => m.value === "network" || m.value === "bluetooth")
    : ALL_CONN_MODES;

  const [tab, setTab] = useState("terminal");
  const [terminal, setTerminal] = useState(selectedTerminal);
  const [outlet, setOutlet] = useState(selectedOutlet);

  // â"€â"€ Printers state â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const [savedPrinters, setSavedPrinters]   = useState([]);
  const [winPrinters, setWinPrinters]       = useState([]);
  const [printerGroups, setPrinterGroups]   = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [showAdd, setShowAdd]               = useState(false);
  const [addLoading, setAddLoading]         = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [printerErr, setPrinterErr]         = useState("");
  const [printerForm, setPrinterForm]       = useState({
    name: "", windows_printer_name: "", type: "receipt",
    mode: isMobile ? "network" : "usb", outlet_id: outlets[0]?.id || "",
    ip_address: "", port: "", printer_group_ids: [],
  });
  const [pingStatus, setPingStatus] = useState(null); // null | "testing" | "ok" | "fail"
  const [pingError, setPingError]   = useState("");
  const [bridgeUrlLocal, setBridgeUrlLocal] = useState(() => localStorage.getItem("print_bridge_url") || "");
  const saveBridgeUrl = (url) => { const clean = url.trim().replace(/[).,\s]+$/, "").replace(/\/+$/, ""); setBridgeUrlLocal(clean); localStorage.setItem("print_bridge_url", clean); };

  // Test print state per printer id: { status: "idle"|"loading"|"ok"|"error", msg: "" }
  const [testPrintState, setTestPrintState] = useState({});

  // Saved flash: "config" | "printers" | "display" | ""
  const [savedFlash, setSavedFlash] = useState("");

  // Print behaviour (per-terminal localStorage)
  const [autoPrint, setAutoPrint]     = useState(() => getPrintSetting("pos_auto_print", true));
  const [cashDrawer, setCashDrawer]   = useState(() => getPrintSetting("pos_cash_drawer", true));
  const [printCopies, setPrintCopies] = useState(() => getPrintSetting("pos_print_copies", 1));

  // Display settings (localStorage)
  const [displayEnabled,    setDisplayEnabled]    = useState(() => getPrintSetting("display_enabled", true));
  const [displayTerminalId, setDisplayTerminalId] = useState(() => getPrintSetting("display_terminal_id", "terminal-1"));
  const [displayTheme,      setDisplayTheme]      = useState(() => getPrintSetting("display_theme", "dark"));
  const [displayAutoLaunch, setDisplayAutoLaunch] = useState(() => getPrintSetting("display_auto_launch", false));
  const [displayFullscreen, setDisplayFullscreen] = useState(() => getPrintSetting("display_fullscreen", true));

  const displayUrl = `${window.location.origin}/display?terminal=${displayTerminalId || "terminal-1"}`;

  const saveDisplaySettings = () => {
    localStorage.setItem("display_enabled",     JSON.stringify(displayEnabled));
    localStorage.setItem("display_terminal_id", JSON.stringify(displayTerminalId));
    localStorage.setItem("display_theme",       JSON.stringify(displayTheme));
    localStorage.setItem("display_auto_launch", JSON.stringify(displayAutoLaunch));
    localStorage.setItem("display_fullscreen",  JSON.stringify(displayFullscreen));
  };

  const launchDisplay = () => {
    saveDisplaySettings();
    const win = window.open(displayUrl, "_blank", displayFullscreen ? "fullscreen=yes" : "");
    if (win && displayFullscreen) win.moveTo(0, 0);
  };

  // Peripherals state
  const PERIPHERAL_TYPES = ["Cash Drawer", "Customer Display", "Barcode Scanner", "Scale", "Card Reader", "Other"];
  const PERIPHERAL_CONNS = ["USB", "LAN", "Bluetooth", "Serial"];
  const [peripherals,      setPeripherals]      = useState([]);
  const [loadingPeriph,    setLoadingPeriph]    = useState(false);
  const [showAddPeriph,    setShowAddPeriph]    = useState(false);
  const [savingPeriph,     setSavingPeriph]     = useState(false);
  const [periphErr,        setPeriphErr]        = useState("");
  const [periphForm,       setPeriphForm]       = useState({ name: "", type: "Cash Drawer", connection: "USB", ip_address: "", port: "" });

  useEffect(() => {
    if (tab !== "peripherals") return;
    setLoadingPeriph(true);
    api.getPeripherals().then(setPeripherals).catch(console.error).finally(() => setLoadingPeriph(false));
  }, [tab]);

  const handleAddPeripheral = async (e) => {
    e.preventDefault();
    setSavingPeriph(true);
    setPeriphErr("");
    try {
      const payload = {
        name: periphForm.name,
        type: periphForm.type.toLowerCase().replace(/ /g, "_"),
        connection: periphForm.connection.toLowerCase(),
        ...(periphForm.connection === "LAN" && {
          ip_address: periphForm.ip_address,
          port: periphForm.port ? parseInt(periphForm.port) : null,
        }),
      };
      await api.createPeripheral(payload);
      const list = await api.getPeripherals();
      setPeripherals(list);
      setShowAddPeriph(false);
      setPeriphForm({ name: "", type: "Cash Drawer", connection: "USB", ip_address: "", port: "" });
    } catch (err) {
      setPeriphErr(err.message);
    } finally {
      setSavingPeriph(false);
    }
  };

  const handleDeletePeripheral = async (p) => {
    if (!window.confirm(`Remove "${p.name}"?`)) return;
    try {
      await api.deletePeripheral(p.id);
      setPeripherals((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) { alert(err.message); }
  };

  useEffect(() => {
    if (tab !== "printers") return;
    setLoadingPrinters(true);
    const fetcher = isAdmin ? api.getPrinters() : api.getAssignedPrinters?.() ?? Promise.resolve([]);
    Promise.all([fetcher, api.getPrinterGroups().catch(() => [])])
      .then(([printers, groups]) => { setSavedPrinters(printers); setPrinterGroups(groups); })
      .catch(console.error)
      .finally(() => setLoadingPrinters(false));
  }, [tab, isAdmin]);

  const handlePingTest = async () => {
    if (!printerForm.ip_address) { setPingError("Enter IP address first"); return; }
    setPingStatus("testing"); setPingError("");
    try {
      const res = await api.pingPrinter(printerForm.ip_address, printerForm.port || 9100);
      if (res.reachable) {
        setPingStatus("ok");
      } else {
        setPingStatus("fail");
        setPingError(res.error || "Printer not reachable");
      }
    } catch (err) {
      setPingStatus("fail");
      setPingError(err.message);
    }
  };

  const openAddPrinter = async () => {
    setShowAdd(true);
    setPrinterErr(""); setPingStatus(null); setPingError("");
    setPrinterForm((f) => ({ ...f, outlet_id: outlets[0]?.id || "", printer_group_ids: [] }));
    if (!isAdmin) return;
    setAddLoading(true);
    try {
      const bridgeUrl = localStorage.getItem("print_bridge_url") || "";
      if (bridgeUrl) {
        const res = await fetch(`${bridgeUrl}/printers`, { signal: AbortSignal.timeout(3000) });
        const data = res.ok ? await res.json() : { printers: [] };
        setWinPrinters(data.printers || []);
      } else {
        setWinPrinters([]);
      }
    } catch {
      setWinPrinters([]);
    } finally {
      setAddLoading(false);
    }
  };

  const handleAddPrinter = async (e) => {
    e.preventDefault();
    if (isMobile && printerForm.mode === "network" && pingStatus !== "ok") {
      setPrinterErr("Test the connection before saving.");
      return;
    }
    setSaving(true);
    setPrinterErr("");
    try {
      const payload = {
        name: printerForm.name,
        windows_printer_name: printerForm.windows_printer_name || printerForm.name,
        type: printerForm.type,
        mode: printerForm.mode,
        outlet_id: printerForm.outlet_id || outlets[0]?.id || "",
        printer_group_ids: printerForm.printer_group_ids || [],
        ...(printerForm.mode === "network" && {
          ip_address: printerForm.ip_address,
          port: printerForm.port ? parseInt(printerForm.port) : null,
        }),
      };
      await api.createPrinter(payload);
      setShowAdd(false);
      const list = await api.getPrinters();
      setSavedPrinters(list);
    } catch (err) {
      setPrinterErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrinter = async (printer) => {
    if (!window.confirm(`Remove "${printer.name}"?`)) return;
    try {
      await api.deletePrinter(printer.id);
      setSavedPrinters((prev) => prev.filter((p) => p.id !== printer.id));
    } catch (err) { alert(err.message); }
  };

  const handleTestPrint = async (printer) => {
    setTestPrintState((prev) => ({ ...prev, [printer.id]: { status: "loading", msg: "" } }));
    try {
      if (printer.mode === "usb") {
        const bridgeUrl = (localStorage.getItem("print_bridge_url") || "").trim();
        if (!bridgeUrl) {
          throw new Error("Set a Bridge URL in printer settings to test USB printers");
        }
        const token = localStorage.getItem("print_bridge_token") || "posx-bridge-2025";
        const printerName = (printer.windows_printer_name || printer.name || "").trim();
        const res = await fetch(`${bridgeUrl}/test-usb`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Bridge-Token": token },
          body: JSON.stringify({ printer_name: printerName }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Bridge error ${res.status}`);
        }
      } else {
        await api.testPrint(printer.id);
      }
      setTestPrintState((prev) => ({ ...prev, [printer.id]: { status: "ok", msg: "Printed!" } }));
      setTimeout(() => setTestPrintState((prev) => ({ ...prev, [printer.id]: { status: "idle", msg: "" } })), 3000);
    } catch (err) {
      setTestPrintState((prev) => ({ ...prev, [printer.id]: { status: "error", msg: err.message } }));
      setTimeout(() => setTestPrintState((prev) => ({ ...prev, [printer.id]: { status: "idle", msg: "" } })), 5000);
    }
  };

  const handleSaveConfig = () => {
    setSavedFlash("config");
    setTimeout(() => {
      onSave(terminal, outlet);
    }, 700);
  };

  const savePrintBehaviour = () => {
    localStorage.setItem("pos_auto_print", JSON.stringify(autoPrint));
    localStorage.setItem("pos_cash_drawer", JSON.stringify(cashDrawer));
    localStorage.setItem("pos_print_copies", JSON.stringify(printCopies));
    setSavedFlash("printers");
    setTimeout(() => setSavedFlash(""), 2000);
  };

  const handleSaveDisplay = () => {
    saveDisplaySettings();
    setSavedFlash("display");
    setTimeout(() => setSavedFlash(""), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h3 className="font-bold text-gray-900 dark:text-white text-lg">Terminal Settings</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-4 flex-shrink-0 overflow-x-auto scrollbar-none">
          {TABS.map((t) => (
            <button key={t} onClick={() => { setTab(t.toLowerCase()); setShowAdd(false); }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0",
                (t === "Display" || t === "Peripherals") && "hidden lg:inline-flex",
                tab === t.toLowerCase() ? "bg-gray-900 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-200"
              )}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* â"€â"€ Terminal tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {tab === "terminal" && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-4">
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white mb-1">Outlet &amp; Terminal</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-4">
                  Select which outlet and terminal this POS station operates as.
                </p>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Outlet</label>
                <div className="relative mb-4">
                  <select value={outlet} onChange={(e) => setOutlet(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 appearance-none pr-8">
                    <option value="">All Outlets</option>
                    {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                </div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Terminal</label>
                <div className="relative">
                  <select value={terminal} onChange={(e) => setTerminal(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 appearance-none pr-8">
                    <option value="">Default</option>
                    {terminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {/* â"€â"€ Printers tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {tab === "printers" && (
            <div className="space-y-5">
              {/* Installed Printers */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">Installed Printers</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Add printers installed on this computer</p>
                  </div>
                  {isAdmin && !showAdd && (
                    <button onClick={openAddPrinter}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-colors flex-shrink-0">
                      <Plus size={12} /> Add Printer
                    </button>
                  )}
                </div>

                {/* Add Printer inline form */}
                {showAdd && (
                  <form onSubmit={handleAddPrinter} className="px-5 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 space-y-3">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">New Printer</p>

                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 block">Printer Name</label>
                      <input required
                        value={printerForm.name}
                        onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
                        placeholder="e.g. Receipt Printer, Kitchen"
                        className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-400"
                      />
                    </div>

                    {/* Windows printer selection -- desktop only */}
                    {isAdmin && !isMobile && (
                      <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 block">
                          System Printer {addLoading && <span className="text-gray-400 dark:text-gray-500">(detecting…)</span>}
                        </label>
                        {winPrinters.length > 0 ? (
                          <select
                            value={printerForm.windows_printer_name}
                            onChange={(e) => setPrinterForm({ ...printerForm, windows_printer_name: e.target.value })}
                            className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800">
                            <option value="">Select installed printer…</option>
                            {winPrinters.map((wp) => (
                              <option key={wp.name} value={wp.name}>{wp.name}</option>
                            ))}
                          </select>
                        ) : !addLoading ? (
                          <input
                            value={printerForm.windows_printer_name}
                            onChange={(e) => setPrinterForm({ ...printerForm, windows_printer_name: e.target.value })}
                            placeholder="Enter printer name manually"
                            className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-400"
                          />
                        ) : null}
                      </div>
                    )}

                    {/* Type + Connection */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 block">Type</label>
                        <select
                          value={printerForm.type}
                          onChange={(e) => setPrinterForm({ ...printerForm, type: e.target.value })}
                          className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 capitalize">
                          {PRINTER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 block">Connection</label>
                        <select
                          value={printerForm.mode}
                          onChange={(e) => { setPrinterForm({ ...printerForm, mode: e.target.value }); setPingStatus(null); setPingError(""); }}
                          className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800">
                          {CONN_MODES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Printer Groups */}
                    {printerGroups.length > 0 && (
                      <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Printer Groups</label>
                        <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl max-h-32 overflow-y-auto bg-white dark:bg-gray-800">
                          {printerGroups.map((g) => (
                            <label key={g.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0">
                              <input
                                type="checkbox"
                                checked={(printerForm.printer_group_ids || []).includes(g.id)}
                                onChange={() => {
                                  const ids = printerForm.printer_group_ids || [];
                                  setPrinterForm((f) => ({
                                    ...f,
                                    printer_group_ids: ids.includes(g.id) ? ids.filter((x) => x !== g.id) : [...ids, g.id],
                                  }));
                                }}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
                              />
                              <span className="text-xs text-gray-700 dark:text-gray-200">{g.name}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Select which groups this printer handles</p>
                      </div>
                    )}

                    {/* Bridge URL (needed for WiFi scanning) */}
                    {printerForm.mode === "network" && (
                      <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                          Bridge URL <span className="font-normal text-gray-400">(bridge.py on your PC)</span>
                        </label>
                        <input
                          type="url"
                          value={bridgeUrlLocal}
                          onChange={(e) => saveBridgeUrl(e.target.value)}
                          placeholder="http://192.168.1.10:8765"
                          className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-400"
                        />
                        <p className="text-xs text-gray-400 mt-1">Run bridge.py on a Windows PC on the same Wi-Fi. Required for WiFi scanning.</p>
                      </div>
                    )}

                    {/* Scanner -- always shown when connection mode matches */}
                    {printerForm.mode === "network" && (
                      <MobilePrinterScanner
                        mode="wifi"
                        forceShow={true}
                        onSelectWifi={(ip) => { setPrinterForm((f) => ({ ...f, ip_address: ip })); setPingStatus(null); }}
                      />
                    )}
                    {printerForm.mode === "bluetooth" && (
                      <MobilePrinterScanner
                        mode="bluetooth"
                        forceShow={true}
                        onSelectBluetooth={(name) => setPrinterForm((f) => ({ ...f, name: f.name || name, windows_printer_name: name }))}
                      />
                    )}

                    {/* Network settings */}
                    {printerForm.mode === "network" && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">IP Address</label>
                            <input
                              value={printerForm.ip_address}
                              onChange={(e) => { setPrinterForm({ ...printerForm, ip_address: e.target.value }); setPingStatus(null); }}
                              placeholder="192.168.1.100"
                              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-400"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Port</label>
                            <input
                              type="number" min="1" max="65535"
                              value={printerForm.port}
                              onChange={(e) => { setPrinterForm({ ...printerForm, port: e.target.value }); setPingStatus(null); }}
                              placeholder="9100"
                              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-400"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={handlePingTest} disabled={pingStatus === "testing"}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors",
                              pingStatus === "ok"
                                ? "bg-green-500 text-white"
                                : pingStatus === "fail"
                                  ? "bg-red-500 text-white"
                                  : "bg-blue-500 text-white hover:bg-blue-600"
                            )}>
                            <Wifi size={11} />
                            {pingStatus === "testing" ? "Testing…" : pingStatus === "ok" ? "Connected ✓" : pingStatus === "fail" ? "Failed ✗" : "Test Connection"}
                          </button>
                          {isMobile && pingStatus !== "ok" && (
                            <span className="text-xs text-amber-500">Required on mobile</span>
                          )}
                        </div>
                        {pingError && <p className="text-red-500 text-xs">{pingError}</p>}
                      </div>
                    )}

                    {printerErr && <p className="text-red-500 text-xs">{printerErr}</p>}

                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowAdd(false)}
                        className="flex-1 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-gray-700 transition-colors">
                        Cancel
                      </button>
                      <button type="submit" disabled={saving}
                        className="flex-1 py-2 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors">
                        {saving ? "Saving…" : "Add Printer"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Printer list */}
                {loadingPrinters ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : savedPrinters.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">No printers added yet</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {savedPrinters.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                        <div className="w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Printer size={16} className="text-gray-500 dark:text-gray-400 dark:text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {CONN_ICON[p.mode]}{p.mode}
                            <span className="mx-1">·</span>
                            {p.type}
                          </p>
                          {(p.printer_group_ids || []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(p.printer_group_ids || []).map((gid) => {
                                const grp = printerGroups.find((g) => g.id === gid);
                                return grp ? (
                                  <span key={gid} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[10px] font-semibold">{grp.name}</span>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>
                        {(() => {
                          const ts = testPrintState[p.id] || { status: "idle", msg: "" };
                          return (
                            <button
                              onClick={() => handleTestPrint(p)}
                              disabled={ts.status === "loading"}
                              title={ts.msg || "Test print"}
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0",
                                ts.status === "ok"    ? "bg-green-100 text-green-700" :
                                ts.status === "error" ? "bg-red-100 text-red-600" :
                                                        "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                              )}>
                              <Printer size={12} />
                              {ts.status === "loading" ? "…" : ts.status === "ok" ? "OK" : ts.status === "error" ? "Err" : "Test"}
                            </button>
                          );
                        })()}
                        {isAdmin && (
                          <button onClick={() => handleDeletePrinter(p)}
                            className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Print Behaviour */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="font-bold text-gray-900 dark:text-white text-sm">Print Behavior</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {/* Auto-print receipt */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Auto-print receipt</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Print automatically after payment</p>
                    </div>
                    <button onClick={() => { setAutoPrint((v) => !v); }}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                        autoPrint ? "bg-blue-500" : "bg-gray-300"
                      )}>
                      <span className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-gray-800 rounded-full shadow transition-transform",
                        autoPrint ? "translate-x-5" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                  {/* Cash drawer */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Open cash drawer</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Kick drawer on cash payment</p>
                    </div>
                    <button onClick={() => { setCashDrawer((v) => !v); }}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                        cashDrawer ? "bg-blue-500" : "bg-gray-300"
                      )}>
                      <span className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-gray-800 rounded-full shadow transition-transform",
                        cashDrawer ? "translate-x-5" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                  {/* Print copies */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Print copies</p>
                    <input
                      type="number" min="1" max="5"
                      value={printCopies}
                      onChange={(e) => setPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm text-center focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              </div>

              {/* Test print error details */}
              {Object.values(testPrintState).some((s) => s.status === "error") && (
                <div className="rounded-2xl border-2 border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-xs text-red-600 dark:text-red-400 space-y-1">
                  {Object.entries(testPrintState).filter(([, s]) => s.status === "error").map(([id, s]) => {
                    const name = savedPrinters.find((p) => p.id === id)?.name || id;
                    return <p key={id}><span className="font-semibold">{name}:</span> {s.msg}</p>;
                  })}
                </div>
              )}
            </div>
          )}

          {/* â"€â"€ Display tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {tab === "display" && (
            <div className="space-y-4">
              {/* Customer-Facing Display toggle */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Monitor size={20} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Customer-Facing Display</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Show order items and totals to the customer</p>
                </div>
                <button onClick={() => setDisplayEnabled((v) => !v)}
                  className={cn("relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                    displayEnabled ? "bg-blue-500" : "bg-gray-300")}>
                  <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-gray-800 rounded-full shadow transition-transform",
                    displayEnabled ? "translate-x-5" : "translate-x-0")} />
                </button>
              </div>

              {/* Terminal ID */}
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">Terminal ID</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Unique identifier for this terminal's display.</p>
                <input
                  value={displayTerminalId}
                  onChange={(e) => setDisplayTerminalId(e.target.value)}
                  placeholder="terminal-1"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* Display Theme */}
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">Display Theme</p>
                <div className="grid grid-cols-2 gap-3">
                  {[{ value: "dark", label: "Dark", desc: "Dark background" }, { value: "light", label: "Light", desc: "Light background" }].map((t) => (
                    <button key={t.value} onClick={() => setDisplayTheme(t.value)}
                      className={cn("p-4 rounded-2xl border-2 text-left transition-all",
                        displayTheme === t.value ? "border-blue-400 bg-blue-50" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300")}>
                      <p className={cn("text-sm font-bold", displayTheme === t.value ? "text-blue-600" : "text-gray-700 dark:text-gray-200")}>{t.label}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Auto-launch on login</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Open display when POS starts</p>
                  </div>
                  <button onClick={() => setDisplayAutoLaunch((v) => !v)}
                    className={cn("relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                      displayAutoLaunch ? "bg-blue-500" : "bg-gray-300")}>
                    <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-gray-800 rounded-full shadow transition-transform",
                      displayAutoLaunch ? "translate-x-5" : "translate-x-0")} />
                  </button>
                </div>
                <div className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Fullscreen mode</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Open in fullscreen</p>
                  </div>
                  <button onClick={() => setDisplayFullscreen((v) => !v)}
                    className={cn("relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                      displayFullscreen ? "bg-blue-500" : "bg-gray-300")}>
                    <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-gray-800 rounded-full shadow transition-transform",
                      displayFullscreen ? "translate-x-5" : "translate-x-0")} />
                  </button>
                </div>
              </div>

              {/* Display URL */}
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Display URL</p>
                <p className="text-xs font-mono text-gray-700 dark:text-gray-200 break-all bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 mb-2">
                  {displayUrl}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Open this URL on the customer-facing screen</p>
              </div>

              {/* Launch button */}
              <button onClick={launchDisplay}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-colors">
                <ExternalLink size={16} />
                Launch Customer Display
              </button>
            </div>
          )}

          {/* â"€â"€ Peripherals tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {tab === "peripherals" && (
            <div className="space-y-4">
              {/* Add Peripheral modal */}
              {showAddPeriph && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-sm p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h4 className="font-bold text-gray-900 dark:text-white text-base">Add Peripheral</h4>
                      <button onClick={() => { setShowAddPeriph(false); setPeriphErr(""); }}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300">
                        <X size={18} />
                      </button>
                    </div>
                    <form onSubmit={handleAddPeripheral} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Name</label>
                        <input required
                          value={periphForm.name}
                          onChange={(e) => setPeriphForm({ ...periphForm, name: e.target.value })}
                          placeholder="e.g. Front Cash Drawer"
                          className="w-full px-3 py-2.5 border-2 border-blue-400 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Type</label>
                          <div className="relative">
                            <select value={periphForm.type}
                              onChange={(e) => setPeriphForm({ ...periphForm, type: e.target.value })}
                              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 appearance-none pr-8">
                              {PERIPHERAL_TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select>
                            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Connection</label>
                          <div className="relative">
                            <select value={periphForm.connection}
                              onChange={(e) => setPeriphForm({ ...periphForm, connection: e.target.value })}
                              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 appearance-none pr-8">
                              {PERIPHERAL_CONNS.map((c) => <option key={c}>{c}</option>)}
                            </select>
                            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      {periphForm.connection === "LAN" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">IP Address</label>
                            <input value={periphForm.ip_address}
                              onChange={(e) => setPeriphForm({ ...periphForm, ip_address: e.target.value })}
                              placeholder="192.168.1.100"
                              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Port</label>
                            <input type="number" value={periphForm.port}
                              onChange={(e) => setPeriphForm({ ...periphForm, port: e.target.value })}
                              placeholder="9100"
                              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-400"
                            />
                          </div>
                        </div>
                      )}
                      {periphErr && <p className="text-red-500 text-xs">{periphErr}</p>}
                      <div className="flex gap-3 pt-1">
                        <button type="button" onClick={() => { setShowAddPeriph(false); setPeriphErr(""); }}
                          className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                          Cancel
                        </button>
                        <button type="submit" disabled={savingPeriph}
                          className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {savingPeriph ? "Adding…" : "Add"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Device list */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Devices connected to this terminal</p>
                  {isAdmin && (
                    <button onClick={() => { setShowAddPeriph(true); setPeriphErr(""); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-colors">
                      <Plus size={12} /> Add
                    </button>
                  )}
                </div>

                {loadingPeriph ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : peripherals.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-2 text-gray-400 dark:text-gray-500">
                    <Cpu size={28} className="text-gray-300" />
                    <p className="text-sm">No peripherals added yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {peripherals.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                        <div className="w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Cpu size={16} className="text-gray-500 dark:text-gray-400 dark:text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {p.type?.replace(/_/g, " ")}
                            <span className="mx-1">·</span>
                            {p.connection}
                            {p.ip_address && <><span className="mx-1">·</span>{p.ip_address}</>}
                          </p>
                        </div>
                        {isAdmin && (
                          <button onClick={() => handleDeletePeripheral(p)}
                            className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          {tab === "terminal" ? (
            <button
              onClick={handleSaveConfig}
              disabled={savedFlash === "config"}
              className={cn(
                "w-full py-3 rounded-2xl font-bold transition-colors",
                savedFlash === "config"
                  ? "bg-green-500 text-white"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}>
              {savedFlash === "config" ? "Saved!" : "Save Configuration"}
            </button>
          ) : tab === "printers" ? (
            <button
              onClick={savePrintBehaviour}
              className={cn(
                "w-full py-3 rounded-2xl font-bold transition-colors",
                savedFlash === "printers"
                  ? "bg-green-500 text-white"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}>
              {savedFlash === "printers" ? "Saved!" : "Save Print Settings"}
            </button>
          ) : tab === "display" ? (
            <button
              onClick={handleSaveDisplay}
              className={cn(
                "w-full py-3 rounded-2xl font-bold transition-colors",
                savedFlash === "display"
                  ? "bg-green-500 text-white"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}>
              {savedFlash === "display" ? "Saved!" : "Save Display Settings"}
            </button>
          ) : tab === "peripherals" ? (
            <button
              onClick={onClose}
              className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-colors">
              Done
            </button>
          ) : (
            <button onClick={onClose}
              className="w-full py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl font-bold hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
