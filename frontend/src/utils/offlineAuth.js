// Offline auth + warm-cache helpers.
//
// On successful online login we store the user blob and a salted hash of
// the pincode in IndexedDB so a waiter can re-enter their pin while the
// internet is down and still get into the POS. Records expire after
// OFFLINE_AUTH_TTL_MS to limit the staleness window.
//
// We also warm the service-worker cache by pre-fetching the read-only
// endpoints the POS needs (products, categories, tables, …). The SW's
// network-first/cache-fallback rules in public/sw.js then keep them
// available when the backend is unreachable.

import { api } from "../lib/api";

const DB_NAME = "posx-offline-auth";
const STORE   = "users";
const VERSION = 1;

// 7 days — offline session can't outlive this without a fresh online login.
const OFFLINE_AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "pin_hash" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror  = (e) => reject(e.target.error);
  });
}

async function hashPin(pincode) {
  const data = new TextEncoder().encode(`posx-offline-v1:${pincode}`);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function saveOfflineCredentials(pincode, user, token) {
  if (!pincode || !user) return;
  try {
    const pin_hash = await hashPin(pincode);
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        pin_hash,
        user,
        token,                  // last known online token (may be expired offline, but useful for queued sync)
        saved_at: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror    = (e) => reject(e.target.error);
    });
  } catch (e) {
    // Non-fatal: offline login just won't be available for this user
    console.warn("[offlineAuth] could not save credentials:", e?.message);
  }
}

export async function tryOfflineLogin(pincode) {
  if (!pincode) return null;
  try {
    const pin_hash = await hashPin(pincode);
    const db = await openDB();
    const rec = await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(pin_hash);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
    if (!rec) return null;
    if (Date.now() - rec.saved_at > OFFLINE_AUTH_TTL_MS) return null;
    return { user: rec.user, token: rec.token, offline: true };
  } catch (e) {
    console.warn("[offlineAuth] lookup failed:", e?.message);
    return null;
  }
}

export async function clearOfflineCredentials(pincode) {
  if (!pincode) return;
  try {
    const pin_hash = await hashPin(pincode);
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(pin_hash);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch {}
}

// Pre-fetch endpoints the POS shell relies on. The service worker (public/
// sw.js) intercepts these and caches the responses for offline reads.
// Fire-and-forget — failures here are not fatal.
export function warmOfflineCache() {
  const calls = [
    () => api.getProducts(),
    () => api.getCategories(),
    () => api.getGroups(),
    () => api.getBrands?.(),
    () => api.getUnits?.(),
    () => api.getTables(),
    () => api.getBarTabs(),
    () => api.getFloors(),
    () => api.getOutlets(),
    () => api.getTerminals(),
    () => api.getPaymentTypes(),
    () => api.getSettings(),
    () => api.getCustomers(),
    () => api.getAssignedPrinters(),
    // The three offline-critical pages
    () => api.getHeldOrders(),                  // HeldOrdersPage
    () => api.getOrders?.(),                    // OrdersSection, ReportsSection
    () => api.getUpcomingReservations?.(),      // TablesPage badge
    () => api.getPrinterGroups?.(),             // Kitchen / Bar routing
  ];
  Promise.all(calls.map((c) => { try { return c?.().catch(() => null); } catch { return null; } }))
    .catch(() => {});
}
