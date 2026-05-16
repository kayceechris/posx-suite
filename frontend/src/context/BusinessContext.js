import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { setCurrencySymbol } from "../lib/utils";

const BusinessContext = createContext(null);

function applySettings(s) {
  if (!s) return;
  const sym = s.currency_symbol || "₦";
  setCurrencySymbol(sym);
  try { localStorage.setItem("pos_currency_symbol", sym); } catch {}
}

const CACHE_KEY = "pos_settings_cache";

function getCached() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}
function saveCache(s) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch {}
}

export function BusinessProvider({ children }) {
  const cached = getCached();
  const [settings, setSettings] = useState(cached || null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    api
      .getSettings({ signal: controller.signal })
      .then((s) => { applySettings(s); saveCache(s); setSettings(s); })
      .catch(() => {
        const fallback = getCached() || { setup_completed: true, business_type: "restaurant", currency_symbol: "₦" };
        applySettings(fallback);
        setSettings(fallback);
      })
      .finally(() => { clearTimeout(timer); setLoading(false); });
  }, []);

  const refreshSettings = async () => {
    try {
      const s = await api.getSettings();
      applySettings(s);
      setSettings(s);
    } catch (_) {}
  };

  return (
    <BusinessContext.Provider value={{ settings, loading, refreshSettings, setSettings }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  return useContext(BusinessContext);
}
