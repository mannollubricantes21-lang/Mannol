// =====================================================
// MANNOL POS — Service Worker
// Cache-first for static assets, network-first for navigation.
// Bump CACHE_VERSION on every release to force clients to refresh.
//
// v5.13.0 — La app ABRE y FUNCIONA SIN CONEXIÓN:
//  · La librería de Supabase ahora es local (js/supabase-js.min.js) y se
//    guarda aquí junto con js/supabase-config.js → sin internet ya no cae
//    en "modo demo" con almacenes y productos de prueba.
//  · Lecturas de Supabase (almacenes, productos, stock, ventas, gestores…):
//    red primero; si no hay red (o no responde en 6 s) se usa la última
//    respuesta guardada. Esta caché de datos NO se borra al actualizar.
//  · Escrituras (ventas, RPC) nunca se guardan aquí: van a la red, y si no
//    hay conexión la app las deja en su cola y las sube después.
//  · Páginas: cada una se guarda con su propia clave (antes todas iban a
//    "./" y, sin conexión, index.html podía abrir el panel admin), y si la
//    red no responde en 4 s se abre la copia guardada.
// =====================================================

const CACHE_VERSION = "mannol-pos-supabase-v51";
const DATA_CACHE = "mannol-pos-data-v1"; // respuestas de Supabase (se conserva entre versiones)
const NAV_TIMEOUT_MS = 4000;
const API_TIMEOUT_MS = 6000;
const DATA_CACHE_MAX = 300;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./css/styles.css",
  "./css/mobile-ux.css",
  "./js/app.js",
  "./js/admin-app.js",
  "./js/supabase.js",
  "./js/supabase-js.min.js",   // v5.13.0: librería local (abre sin conexión)
  "./js/supabase-config.js",   // v5.13.0: la config real (404 tolerado si no existe)
  "./js/supabase-config.example.js",
  "./js/store.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/version.js",
  "./js/currency.js",
  "./js/ui.js",
  "./js/types.js",
  "./js/demo-data.js",
  "./js/offline-sync.js",
  "./js/offline-queue.js",     // v5.13.0: cola de ventas sin conexión
  "./js/data-freshness.js",    // v5.17: «stock de hace X min» en el banner
  "./js/image-upload.js",
  "./js/github-storage.js",
  "./js/github-config.example.js",
  "./js/csv-export.js",
  "./js/charts.js",
  "./js/push-notify.js",
  "./js/global-search.js",
  "./js/update-banner.js",
  "./js/pin-rate-limit.js",
  "./js/barcode-scanner.js", // v5.10.0 (js/zxing.min.js se guarda al usarse por primera vez)
  "./js/sales-stats.js",     // v5.10.0: faltaban (cierre, más vendidos, PIN sin conexión)
  "./js/seller-earnings.js", // v5.14.0: lo que lleva ganado el vendedor
  "./js/pin-utils.js",
  "./js/payment-utils.js", // v5.16.0: conversión y validación de pagos
  "./js/ticket.js",        // v5.21.0: ticket compartible y «Vender de nuevo»
  "./js/viscosity.js",
  "./js/catalog-facets.js", // v5.12.0: tipos y marcas del catálogo
  "./js/product-form.js",   // v5.15.0: formulario de producto (lógica)
  "./js/components/sync-banner.js",
  "./js/views/home.js",
  "./js/views/pin-login.js",
  "./js/views/user-login.js",
  "./js/views/dashboard.js",
  "./js/views/sales.js",
  "./js/views/sales-history.js",
  "./js/views/team-status.js", // v5.18.0: «Estado del equipo»
  "./js/views/stock.js",
  "./js/views/commissions.js",
  "./js/views/transfers.js",
  "./js/views/catalog.js",
  "./js/views/users.js",
  "./js/views/settings.js",
  "./js/views/managers.js",
  "./js/views/admin.js",
  "./js/views/product-dialog.js", // v5.15.0: formulario de producto del admin
  "./js/views/warehouse-interior.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon.png",
  "./icons/icon-64.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/logo-192.png",
];

// ===== Lifecycle =====
self.addEventListener("install", (event) => {
  // Use allSettled to tolerate 404s (e.g. supabase-config.js doesn't exist by default)
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
  );
  // v5.17: SIN skipWaiting automático. Antes el SW nuevo tomaba el control
  // nada más instalar y update-banner recargaba la página sola: una venta a
  // medias desaparecía. Ahora el SW nuevo queda en espera y toma el control
  // cuando la persona toca «Actualizar» en el banner (mensaje SKIP_WAITING).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // La caché de DATOS se conserva: así, tras actualizar la app, sigue
        // abriendo sin conexión con los últimos datos reales.
        keys.filter((k) => k !== CACHE_VERSION && k !== DATA_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ===== Helpers =====
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

const swOffline = () => self.navigator && self.navigator.onLine === false;

// Lectura de la API REST de Supabase (otro origen)
function isSupabaseRead(request, url) {
  if (!url.pathname.includes("/rest/v1/")) return false;
  if (url.pathname.includes("/rest/v1/rpc/")) return false; // RPC: siempre red
  return request.headers.has("apikey") || url.hostname.endsWith(".supabase.co");
}

// Consultas que SIEMPRE deben ser frescas (nunca desde la caché):
// la comprobación "¿ya se subió esta venta?" (client_ref) de la cola.
function mustBeFresh(url) {
  return url.search.includes("client_ref=");
}

// Quién pregunta (rol + usuario del token): la copia del panel admin no se
// mezcla con la de una sesión PIN en el mismo equipo. Estable aunque el
// token se renueve cada hora.
function authScope(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return "none";
  try {
    const json = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return `${json.role || "?"}:${json.sub || ""}`;
  } catch {
    return "none";
  }
}

// Clave de caché: la URL + quién pregunta (+ tipo de respuesta si se pidió un solo objeto)
function dataKey(request) {
  const u = new URL(request.url);
  const accept = request.headers.get("accept") || "";
  if (accept.includes("vnd.pgrst.object")) u.searchParams.set("__mannol_accept", "object");
  u.searchParams.set("__mannol_scope", authScope(request));
  return u.toString();
}

let _trimTimer = null;
function trimDataCacheSoon() {
  if (_trimTimer) return;
  _trimTimer = setTimeout(async () => {
    _trimTimer = null;
    try {
      const cache = await caches.open(DATA_CACHE);
      const keys = await cache.keys();
      const extra = keys.length - DATA_CACHE_MAX;
      for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
    } catch {}
  }, 4000);
}

async function apiNetworkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  const key = dataKey(request);
  const network = fetch(request).then((res) => {
    if (res && res.status === 200) {
      cache.put(key, res.clone()).then(trimDataCacheSoon).catch(() => {});
    }
    return res;
  });

  // Sin red declarada: la copia guardada al instante
  if (swOffline()) {
    const cached = await cache.match(key);
    if (cached) {
      network.catch(() => {});
      return cached;
    }
    return network; // fallará y la app mostrará su estado sin datos
  }

  try {
    const res = await withTimeout(network, API_TIMEOUT_MS);
    if (res.status >= 500) {
      const cached = await cache.match(key);
      return cached || res;
    }
    return res; // 2xx / 4xx: respuesta real del servidor
  } catch {
    // Sin red o sin respuesta a tiempo → última copia guardada
    const cached = await cache.match(key);
    if (cached) {
      network.catch(() => {});
      return cached;
    }
    return network; // sin copia: esperar a la red (o fallar)
  }
}

// Clave de página: la ruta sin parámetros (index.html, admin.html, "./"…)
function pageKey(url) {
  return url.origin + url.pathname;
}

async function navigationHandler(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_VERSION);
  const key = pageKey(url);
  const network = fetch(request).then((res) => {
    if (res && res.ok && res.type === "basic" && !res.redirected) {
      cache.put(key, res.clone()).catch(() => {});
    }
    return res;
  });
  try {
    return await withTimeout(network, swOffline() ? 1 : NAV_TIMEOUT_MS);
  } catch {
    let cached = await cache.match(key);
    if (!cached && url.pathname.endsWith("/")) {
      cached = (await cache.match("./index.html")) || (await cache.match("./"));
    }
    if (!cached && /\/index\.html$/.test(url.pathname)) {
      cached = await cache.match("./");
    }
    if (cached) {
      network.catch(() => {});
      return cached;
    }
    try {
      return await network;
    } catch {
      return (await cache.match("./offline.html")) || Response.error();
    }
  }
}

// ===== Fetch handler =====
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // escrituras: siempre a la red
  const url = new URL(request.url);

  // Otro origen: solo las lecturas de Supabase (con copia para sin conexión)
  if (url.origin !== self.location.origin) {
    if (isSupabaseRead(request, url) && !mustBeFresh(url)) {
      event.respondWith(apiNetworkFirst(request));
    }
    return;
  }

  // Navigation: network-first (con tiempo límite), fallback to cache
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return new Response("", { status: 504 });
      }
    })()
  );
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
  // Activar el SW nuevo inmediatamente (banner de actualización)
  if (msgType === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Notify all client tabs to sync their offline queues
async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach((client) => {
    client.postMessage({ type: "flush-queue" });
  });
}
