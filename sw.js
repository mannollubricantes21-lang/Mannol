// =====================================================
// Almacén POS — Service Worker
// Cache-first for static assets, network-first for navigation,
// IndexedDB queue for offline sale POSTs.
// =====================================================

const CACHE_VERSION = "almacen-pos-v6";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/firebase.js",
  "./js/firebase-config.example.js",
  "./js/store.js",
  "./js/auth.js",
  "./js/firestore.js",
  "./js/currency.js",
  "./js/ui.js",
  "./js/types.js",
  "./js/demo-data.js",
  "./js/offline-sync.js",
  "./js/image-upload.js",
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
];

// IndexedDB for offline sale queue (legacy — app uses localStorage via store)
const DB_NAME = "almacen-pos-queue";
const STORE_NAME = "sales";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getQueuedSales() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

// ===== Lifecycle =====
self.addEventListener("install", (event) => {
  // Use allSettled to tolerate 404s (e.g. firebase-config.js doesn't exist by default)
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
