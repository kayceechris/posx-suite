const CACHE = "posx-v5";
const API_CACHE = "posx-api-v5";

// API GET endpoints to cache for offline access. Everything POSPage,
// TablesPage and HeldOrdersPage need to render lives in this list.
const OFFLINE_API_PREFIXES = [
  "/api/products",
  "/api/categories",
  "/api/groups",
  "/api/brands",
  "/api/units",
  "/api/settings",
  "/api/outlets",
  "/api/terminals",
  "/api/payment-types",
  "/api/tables",
  "/api/bar-tabs",
  "/api/floors",
  "/api/users",
  "/api/printers",
  "/api/printer-groups",
  "/api/customers",
  "/api/orders",
  "/api/reservations",
  "/api/stock",
  "/api/ingredients",
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

// Drop any cached GET that lives under one of the cacheable prefixes —
// called after a successful mutation so a stale list (e.g. a floor that
// was just deleted, a product that was just edited) doesn't keep coming
// back from the SWR cache.
async function invalidateCacheFor(pathname) {
  const matching = OFFLINE_API_PREFIXES.filter((p) => pathname.startsWith(p));
  if (!matching.length) return;
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.filter((req) => {
    try {
      const p = new URL(req.url).pathname;
      return matching.some((mp) => p.startsWith(mp));
    } catch { return false; }
  }).map((req) => cache.delete(req)));
}

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip chrome-extension requests
  if (url.protocol === "chrome-extension:") return;

  // Mutations on cached resources — pass through, then invalidate the
  // matching cached GETs so the next read goes to the network.
  if (request.method !== "GET" && url.pathname.startsWith("/api/")) {
    e.respondWith((async () => {
      const res = await fetch(request);
      if (res.ok) {
        // Invalidate by the request's own path, plus a few cross-cutting
        // collections that often change together (deleting a floor can
        // orphan tables; deleting a table can affect floors stats).
        const pathsToBust = new Set([url.pathname]);
        if (url.pathname.startsWith("/api/floors"))      pathsToBust.add("/api/tables");
        if (url.pathname.startsWith("/api/tables"))      pathsToBust.add("/api/floors");
        if (url.pathname.startsWith("/api/outlets"))     { pathsToBust.add("/api/tables"); pathsToBust.add("/api/floors"); }
        if (url.pathname.startsWith("/api/products"))    pathsToBust.add("/api/groups");
        for (const p of pathsToBust) {
          await invalidateCacheFor(p);
        }
      }
      return res;
    })());
    return;
  }

  // Skip non-GET pass-throughs we don't care about
  if (request.method !== "GET") return;

  // ── Cacheable API reads: STALE-WHILE-REVALIDATE ───────────────────────────
  // Serve cached response immediately (instant paint), refresh in the
  // background so the next visit gets fresher data. Falls back to whatever
  // we have when the network fails.
  if (
    url.pathname.startsWith("/api/") &&
    OFFLINE_API_PREFIXES.some((p) => url.pathname.startsWith(p))
  ) {
    e.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request.clone())
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        if (cached) {
          // Fire the refetch in the background; don't block the response.
          e.waitUntil?.(networkFetch.then(() => {}).catch(() => {}));
          return cached;
        }
        const fresh = await networkFetch;
        return fresh || new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      })
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
