// =====================================================
// MANNOL POS — Service Worker
// Cache-first for static assets, network-first for navigation.
// Bump CACHE_VERSION on every release to force clients to refresh.
// =====================================================

const CACHE_VERSION = "mannol-pos-supabase-v8";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/admin-app.js",
  "./js/supabase.js",
  "./js/supabase-config.example.js",
  "./js/store.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/currency.js",
  "./js/ui.js",
  "./js/types.js",
  "./js/demo-data.js",
  "./js/offline-sync.js",
  "./js/image-upload.js",
  "./js/csv-export.js",
  "./js/charts.js",
  "./js/push-notify.js",
  "./js/global-search.js",
  "./js/pin-rate-limit.js",
  "./js/components/sync-banner.js",
  "./js/views/home.js",
  "./js/views/pin-login.js",
  "./js/views/user-login.js",
  "./js/views/dashboard.js",
  "./js/views/sales.js",
  "./js/views/sales-history.js",
  "./js/views/stock.js",
  "./js/views/commissions.js",
  "./js/views/transfers.js",
  "./js/views/catalog.js",
  "./js/views/users.js",
  "./js/views/settings.js",
  "./js/views/managers.js",
  "./js/views/admin.js",
  "./js/views/warehouse-interior.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon.png",
  "./icons/icon-64.png",
  "./icons/icon-maskable-512.png",
];

// ===== Lifecycle =====
self.addEventListener("install", (event) => {
  // Use allSettled to tolerate 404s (e.g. supabase-config.js doesn't exist by default)
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ===== Fetch handler =====
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, fallback to cache
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_VERSION);
          cache.put("./", fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match("./");
          return cached || (await cache.match("./offline.html"));
        }
      })()
    );
    return;
  }

  // Static assets: cache-first
  if (request.method === "GET") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return new Response("", { status: 504 });
        }
      })()
    );
    return;
  }
});

// ===== Background sync =====
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-sales") {
    event.waitUntil(notifyClientsToSync());
  }
});

// ===== Message handler — supports both string and object formats =====
self.addEventListener("message", (event) => {
  const data = event.data;
  // Support both {type: "flush-queue"} and plain "flush-queue" string
  const msgType = typeof data === "string" ? data : data?.type;
  if (msgType === "flush-queue" || msgType === "retry-sync") {
    notifyClientsToSync();
  }
});

// Notify all client tabs to sync their offline queues
async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach((client) => {
    client.postMessage({ type: "flush-queue" });
  });
}
