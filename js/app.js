// =====================================================
// App bootstrap — MANNOL POS
// =====================================================

import { getStore, applyTheme } from "./store.js";
import { getAppearance, applyAppearance, sellerSlotOf } from "./appearance.js";
import { subscribeAuth } from "./auth.js";
import { isSupabaseConfiguredAsync } from "./supabase.js";
import { setupAutoSync } from "./offline-sync.js";
import { setupGlobalSearch } from "./global-search.js";
import { askPermission, notifyConnectionRestored } from "./push-notify.js";
import { setupUpdateBanner } from "./update-banner.js";
import { setupTableCards, escapeHtml, toast } from "./ui.js";
import { setupErrorReporting } from "./error-report.js";
import { initTelemetry } from "./telemetry.js";
import { initPwaInstall } from "./pwa-install.js";
import { mountHomeView } from "./views/home.js";
import { mountPinLoginView } from "./views/pin-login.js";
import { mountUserLoginView } from "./views/user-login.js";
import { mountDashboardView } from "./views/dashboard.js";

// ===== View router =====
const VIEWS = ["home", "pin", "login", "dashboard"];

function getViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get("view");
  if (VIEWS.includes(v)) return v;
  // Manifest shortcuts use ?view=sales or ?view=stock — map to dashboard
  if (v === "sales" || v === "stock" || v === "managers" || v === "history") {
    return "dashboard";
  }
  return null;
}

function getTabFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") || params.get("view") || null;
}

function setUrlView(view) {
  try {
    const url = new URL(window.location.href);
    if (view === "home") {
      // Limpiar el parámetro view en la home para que la próxima vez
      // no se reabra en una vista previa (ej: ?view=login pegado del pasado)
      url.searchParams.delete("view");
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("view", view);
    }
    window.history.replaceState({}, "", url.toString());
  } catch {}
}

// ===== Main render =====
let currentCleanup = null;
let currentViewName = null; // v5.20.0: para que «atrás» cambie de sección sin re-montar

function renderView(container, view, navigate) {
  if (currentCleanup) {
    try { currentCleanup(); } catch {}
    currentCleanup = null;
  }

  const store = getStore();
  const user = store.getState().currentUser;

  // Redirect logic
  // v5.1.4: el admin YA NO es expulsado del index. El dueño también usa el
  // acceso por PIN (interior de almacén) en este dispositivo, así que:
  //  - admin + home  → home (hub: PIN + botón "Abrir panel admin")
  //  - admin + pin   → pin (flujo normal del almacén)
  //  - admin + login → dashboard (ya tiene sesión; el login no aplica)
  //  - otros roles con sesión → dashboard (comportamiento original)
  const isAdmin = user?.role === "admin";
  if (user && !isAdmin && (view === "home" || view === "pin" || view === "login")) {
    view = "dashboard";
  }
  if (isAdmin && view === "login") {
    view = "dashboard";
  }
  if (!user && view === "dashboard") {
    view = "home";
  }
  currentViewName = view;
  // v5.25.0: apariencia propia del almacén (color, fondo, letra, catálogo)
  try {
    const wh = store.getState().currentWarehouse;
    applyAppearance(view === "dashboard" && wh ? getAppearance(wh.id, sellerSlotOf(store.getState().currentUser)) : null, applyTheme, store.getState().theme);
  } catch (e) { console.warn("[apariencia]", e); }

  try {
    switch (view) {
      case "home":
        currentCleanup = mountHomeView(container, navigate);
        break;
      case "pin":
        currentCleanup = mountPinLoginView(container, navigate);
        break;
      case "login":
        currentCleanup = mountUserLoginView(container, navigate);
        break;
      case "dashboard":
        currentCleanup = mountDashboardView(container, navigate);
        break;
      default:
        currentCleanup = mountHomeView(container, navigate);
    }
  } catch (err) {
    console.error("renderView failed:", err);
    container.innerHTML = `
      <div class="mobile-shell">
        <div class="bg-diagonal"></div>
        <main class="mobile-main">
          <div class="card">
            <div class="card-content">
              <h2 class="text-lg font-bold mb-2">⚠️ Error al cargar la vista</h2>
              <p class="text-sm text-muted mb-4">${escapeHtml(err.message)}</p>
              <button class="btn btn-primary" onclick="location.reload()">Reintentar</button>
            </div>
          </div>
        </main>
      </div>
    `;
  }
}

// ===== Init =====
function init() {
  console.info("[App] init starting...");
  // v5.39.2: la red global de errores se instala PRIMERO; cualquier fallo
  // posterior (promesas incluidas) queda registrado y reportable.
  setupErrorReporting();
  const store = getStore();

  // Apply initial theme
  applyTheme(store.getState().theme);

  const container = document.getElementById("app");
  if (!container) {
    console.error("[App] #app container not found");
    return;
  }
  setupTableCards(container); // v5.10.0: tablas como tarjetas en el móvil (Inventario)

  const navigate = (view) => {
    // v5.4.0: recordar el último destino para reabrirlo al volver
    try { localStorage.setItem("mannol-last-view", view); } catch {}
    setUrlView(view);
    renderView(container, view, navigate);
  };

  // v5.1.4: se ELIMINA la redirección automática index → admin.html.
  // Antes: con una sesión de admin guardada en el dispositivo, el index
  // rebotaba SIEMPRE a admin.html y el dueño no podía entrar por PIN a sus
  // almacenes (tampoco podía verificar el stock como empleado).
  // Ahora el index es el hub de entrada (PIN + botón "Abrir panel admin")
  // y admin.html sigue funcionando de forma independiente.

  // Initial view
  let initialView = getViewFromUrl();
  if (!initialView) {
    const user = store.getState().currentUser;
    // v5.1.4: el admin aterriza en el home-hub (PIN + acceso al panel);
    // el resto de roles con sesión, en su dashboard.
    initialView = user && user.role !== "admin" ? "dashboard" : "home";
    // v5.4.0: abrir en el último destino del dispositivo. Solo aplica al
    // admin (los demás roles son redirigidos a dashboard de todas formas).
    // "pin" solo si quedó un almacén activo de la sesión anterior.
    if (user && user.role === "admin") {
      try {
        const last = localStorage.getItem("mannol-last-view");
        const hasPinSession = store.getState().authMode === "pin" && !!store.getState().currentWarehouse;
        if (last === "dashboard" || last === "home" || (last === "pin" && hasPinSession)) {
          initialView = last;
        }
      } catch {}
    }
  }

  console.info("[App] rendering initial view:", initialView);
  renderView(container, initialView, navigate);
  console.info("[App] initial view rendered");

  // Check Supabase config (async, non-blocking)
  isSupabaseConfiguredAsync().then((configured) => {
    console.info("[App] Supabase configured:", configured);
    if (configured) {
      // Subscribe to auth changes only if Supabase is available
      subscribeAuth((user) => {
        // v5.1.4: si en este dispositivo hay una sesión PIN activa, manda
        // el perfil del almacén; la sesión de Supabase (admin) NO la
        // sobrescribe al recargar la página.
        if (store.getState().authMode === "pin") return;
        if (user) {
          store.setUser(user);
          store.setAuthMode("user");
        } else {
          store.setUser(null);
        }
      });
    } else {
      console.info("[App] Running in DEMO mode (Supabase not configured)");
    }
  }).catch((err) => {
    console.warn("[App] Supabase check failed:", err);
  });

  // Handle browser back/forward
  // v5.20.0: dentro del panel, «atrás» (botón del teléfono o del navegador)
  // vuelve a la sección anterior sin volver a montar todo el panel.
  window.addEventListener("popstate", () => {
    const view = getViewFromUrl() || "home";
    if (view === "dashboard" && currentViewName === "dashboard") {
      const tab = new URLSearchParams(window.location.search).get("tab") || "dashboard";
      window.dispatchEvent(new CustomEvent("mannol:tab", { detail: { view: tab } }));
      return;
    }
    renderView(container, view, navigate);
  });

  // Handle SW messages (offline queue sync)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", async (event) => {
      const msg = event.data;
      if (msg?.type === "retry-sync-sale" && msg.sale) {
        // Legacy: single sale retry — use new sync system instead
        try {
          const { syncOfflineQueue } = await import("./offline-sync.js");
          await syncOfflineQueue({ silent: true });
        } catch (err) {
          console.error("Retry sync failed:", err);
        }
      } else if (msg?.type === "flush-queue" || msg?.type === "retry-sync") {
        try {
          const { syncOfflineQueue } = await import("./offline-sync.js");
          await syncOfflineQueue({ silent: true });
        } catch (err) {
          console.error("SW-triggered sync failed:", err);
        }
      }
    });
  }

  // Setup auto-sync: triggers on 'online' event + periodic check every 30s
  setupAutoSync();

  // v5.39.2: si la cuota de localStorage se llena, los espejos offline dejan
  // de actualizarse en silencio (hallazgo 6 de la revisión); ahora avisa.
  window.addEventListener("mannol:mirror-quota", () => {
    toast(
      "Memoria del navegador llena: los datos para trabajar sin conexión pueden quedar desactualizados. Exporta un respaldo y libera espacio.",
      "warning",
      8000
    );
  });

  // v5.13.0: precarga en segundo plano de lo necesario para vender sin
  // conexión en cualquier almacén (al abrir y al volver internet).
  const warmUp = () => {
    import("./db.js")
      .then((m) => m.warmOfflineCache())
      .then((r) => { if (r && r.total) console.info(`[Offline] Datos guardados para trabajar sin conexión: ${r.ok}/${r.total}`); })
      .catch(() => {});
  };
  setTimeout(warmUp, 4000);
  window.addEventListener("online", () => setTimeout(warmUp, 6000));

  // Setup global search palette (Cmd/Ctrl+K)
  setupGlobalSearch((view) => navigate(view));

  // v5.40: telemetría de campo (p75 LCP/INP/CLS → Etapa C) + instalación PWA
  initTelemetry();
  initPwaInstall();

  // Setup offline badge + kiosk button
  setupOfflineBadge();
  setupKioskButton();

  // Ask for notification permission (silent, non-blocking)
  askPermission();

  // Notify when connection restores
  window.addEventListener("online", () => {
    setTimeout(() => notifyConnectionRestored(), 1500);
  });

  console.info("[App] init done");
}

// ===== Offline badge — fixed top-right indicator =====
function setupOfflineBadge() {
  let badge = document.querySelector(".offline-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "offline-badge";
    badge.setAttribute("role", "status");
    badge.innerHTML = `<span class="dot"></span><span>Sin conexión</span>`;
    document.body.appendChild(badge);
  }
  // v5.13.0: colgar el indicador justo bajo la cabecera de la pantalla actual
  // (las cabeceras cambian de alto según la vista), sin tapar sus botones.
  let timer = null;
  function place() {
    const h = document.querySelector(".app-header, .premium-header, .admin-topbar");
    let top = 8;
    if (h) {
      const r = h.getBoundingClientRect();
      if (r.height > 0 && r.bottom > 0) top = Math.round(r.bottom - 11);
    }
    badge.style.setProperty("--offline-badge-top", `${Math.max(4, top)}px`);
  }
  function update() {
    if (navigator.onLine) {
      badge.classList.remove("show");
      if (timer) { clearInterval(timer); timer = null; }
    } else {
      place();
      badge.classList.add("show");
      if (!timer) timer = setInterval(place, 1000);
    }
  }
  update();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  window.addEventListener("resize", () => { if (!navigator.onLine) place(); });
}

// ===== Kiosk mode — fullscreen toggle =====
function setupKioskButton() {
  let btn = document.querySelector(".kiosk-btn");
  if (!btn) {
    btn = document.createElement("button");
    btn.className = "kiosk-btn show";
    btn.setAttribute("aria-label", "Activar modo kiosko (pantalla completa)");
    btn.setAttribute("title", "Modo kiosko");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="8" height="8" x="8" y="8" rx="1"/></svg>`;
    document.body.appendChild(btn);
  }
  btn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });
}

// ===== Bootstrap with error handling =====
// Use dynamic import for app.js itself so we can catch load errors.
// But since this IS app.js, we just run init() with a try/catch.
try {
  init();
} catch (err) {
  console.error("[App] init crashed:", err);
  const container = document.getElementById("app");
  if (container) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; font-family: sans-serif;">
        <h2 style="color: #ef4444;">⚠️ Error al iniciar</h2>
        <p style="color: #666; max-width: 400px;">${escapeHtml(err.message)}</p>
        <button onclick="location.reload()" style="padding: 0.5rem 1.5rem; background: #10b981; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-size: 1rem;">Reintentar</button>
      </div>
    `;
  }
}

// Register service worker + banner "Nueva versión disponible" (skip on file://)
setupUpdateBanner({ register: true });
