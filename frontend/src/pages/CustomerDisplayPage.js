import React, { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { formatCurrency, setCurrencySymbol } from "../lib/utils";

function getDisplaySettings() {
  const get = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  // Sync currency symbol so formatCurrency uses the right one
  const sym = localStorage.getItem("pos_currency_symbol");
  if (sym) setCurrencySymbol(sym);
  return {
    theme:      get("display_theme", "dark"),
    terminalId: get("display_terminal_id", "terminal-1"),
  };
}

export default function CustomerDisplayPage() {
  const params   = new URLSearchParams(window.location.search);
  const terminalId = params.get("terminal") || getDisplaySettings().terminalId;
  const theme    = params.get("theme")    || getDisplaySettings().theme;

  const isDark = theme !== "light";

  const [order, setOrder] = useState(null); // { items, subtotal, customerName }
  const [time,  setTime]  = useState(new Date());

  // Poll localStorage for order updates
  useEffect(() => {
    const key = `display_order_${terminalId}`;
    const poll = () => {
      try {
        const raw = localStorage.getItem(key);
        setOrder(raw ? JSON.parse(raw) : null);
      } catch { setOrder(null); }
    };
    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [terminalId]);

  // Clock
  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const bg      = isDark ? "bg-gray-950"  : "bg-gray-50";
  const surface = isDark ? "bg-gray-900"  : "bg-white";
  const border  = isDark ? "border-gray-800" : "border-gray-200";
  const text     = isDark ? "text-white"   : "text-gray-900";
  const muted    = isDark ? "text-gray-400" : "text-gray-500";
  const divider  = isDark ? "divide-gray-800" : "divide-gray-100";

  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  if (!order) {
    // Idle / welcome screen
    return (
      <div className={`h-screen flex flex-col items-center justify-center ${bg} select-none`}>
        <div className="flex flex-col items-center gap-6">
          <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl">
            <Monitor size={48} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className={`text-4xl font-black tracking-tight ${text}`}>Welcome</h1>
            <p className={`text-lg mt-2 ${muted}`}>Your order will appear here</p>
          </div>
          <div className={`text-center mt-4 ${muted}`}>
            <p className="text-5xl font-bold tabular-nums">{timeStr}</p>
            <p className="text-base mt-1">{dateStr}</p>
          </div>
        </div>
      </div>
    );
  }

  const { items = [], subtotal = 0, customerName } = order;

  return (
    <div className={`h-screen flex flex-col ${bg} select-none overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-8 py-5 ${surface} border-b ${border}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Monitor size={20} className="text-white" />
          </div>
          <div>
            <p className={`font-black text-lg leading-none ${text}`}>
              {customerName || "Customer Order"}
            </p>
            <p className={`text-xs mt-0.5 ${muted}`}>{items.length} item{items.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <p className={`text-sm tabular-nums ${muted}`}>{timeStr}</p>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        <div className={`${surface} rounded-2xl border ${border} overflow-hidden`}>
          {/* Column headers */}
          <div className={`grid grid-cols-12 gap-2 px-5 py-3 border-b ${border}`}>
            <p className={`col-span-6 text-xs font-bold uppercase tracking-widest ${muted}`}>Item</p>
            <p className={`col-span-2 text-xs font-bold uppercase tracking-widest text-center ${muted}`}>Qty</p>
            <p className={`col-span-2 text-xs font-bold uppercase tracking-widest text-right ${muted}`}>Price</p>
            <p className={`col-span-2 text-xs font-bold uppercase tracking-widest text-right ${muted}`}>Total</p>
          </div>

          <div className={`divide-y ${divider}`}>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 px-5 py-4 items-center">
                <p className={`col-span-6 font-semibold text-base ${text}`}>{item.product_name}</p>
                <div className="col-span-2 flex justify-center">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                    ${isDark ? "bg-blue-900/60 text-blue-300" : "bg-blue-50 text-blue-600"}`}>
                    {item.quantity}
                  </span>
                </div>
                <p className={`col-span-2 text-right text-sm ${muted}`}>{formatCurrency(item.price)}</p>
                <p className={`col-span-2 text-right font-bold ${text}`}>{formatCurrency(item.total)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Total footer */}
      <div className={`px-8 py-6 ${surface} border-t ${border}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm ${muted}`}>Order Total</p>
            <p className={`text-xs mt-0.5 ${muted}`}>Thank you for your order</p>
          </div>
          <div className="text-right">
            <p className={`text-5xl font-black tabular-nums ${isDark ? "text-blue-400" : "text-blue-600"}`}>
              {formatCurrency(subtotal)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
