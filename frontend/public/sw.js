const CACHE = "posx-v2";
const API_CACHE = "posx-api-v2";

// API GET endpoints to cache for offline access
const OFFLINE_API_PREFIXES = [
  "/api/products",
  "/api/categories",
  "/api/settings",
  "/api/outlets",
  "/api/terminals",
  "/api/payment-types",
  "/api/tables",
  "/api/bar-tabs",
  "/api/users",
  "/api/printers",
];

// ── Install: cache the app shell ────────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/", "/index.html"]))
  );
  self.skipWaiting();
});

// ── Activate: clear old caches ───────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET" || url.protocol === "chrome-extension:") return;

  // ── Cacheable API reads: network-first, serve cache when offline ──────────
  if (
    url.pathname.startsWith("/api/") &&
    OFFLINE_API_PREFIXES.some((p) => url.pathname.startsWith(p))
  ) {
    e.respondWith(
      fetch(request.clone())
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── Other API calls: network only ─────────────────────────────────────────
  if (url.pathname.startsWith("/api/")) return;

  // ── Static assets (JS/CSS/fonts/images): cache-first ─────────────────────
  if (
    url.pathname.startsWith("/static/") ||
    request.destination === "font" ||
    request.destination === "image"
  ) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // ── Navigation: network-first, fall back to cached index.html ─────────────
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((r) => r || caches.match("/"))
      )
    );
    return;
  }

  // ── Default: network, fall back to cache ──────────────────────────────────
  e.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── Listen for sync trigger from the app ─────────────────────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data?.type === "SYNC_NOW") {
    // Notify all clients that a sync was requested
    self.clients.matchAll().then((clients) =>
      clients.forEach((c) => c.postMessage({ type: "SYNC_READY" }))
    );
  }
});
