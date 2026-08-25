// =====================================================
// App bootstrap — MANNOL POS
// =====================================================

import { getStore, applyTheme } from "./store.js";
import { subscribeAuth } from "./auth.js";
import { isSupabaseConfiguredAsync } from "./supabase.js";
import { setupAutoSync } from "./offline-sync.js";
import { setupGlobalSearch } from "./global-search.js";
import { askPermission, notifyConnectionRestored } from "./push-notify.js";
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
    url.searchParams.set("view", view);
    window.history.replaceState({}, "", url.toString());
  } catch {}
}

// ===== Main render =====
let currentCleanup = null;

function renderView(container, view, navigate) {
  if (currentCleanup) {
    try { currentCleanup(); } catch {}
    currentCleanup = null;
  }

  const store = getStore();
  const user = store.getState().currentUser;

  // Redirect logic
  if (user && (view === "home" || view === "pin" || view === "login")) {
    view = "dashboard";
  }
  if (!user && view === "dashboard") {
    view = "home";
  }

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
              <p class="text-sm text-muted mb-4">${err.message}</p>
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
  const store = getStore();

  // Apply initial theme
  applyTheme(store.getState().theme);

  const container = document.getElementById("app");
  if (!container) {
    console.error("[App] #app container not found");
    return;
  }

  const navigate = (view) => {
    setUrlView(view);
    renderView(container, view, navigate);
  };

  // Si el usuario es admin, redirigir automáticamente al panel admin dedicado
  // (admin.html) en lugar de mostrar la app de vendedores.
  const currentUser = store.getState().currentUser;
  if (currentUser && currentUser.role === "admin") {
    // No redirigir si ya estamos en admin.html (evitar loop)
    if (!window.location.pathname.endsWith("admin.html")) {
      window.location.replace("./admin.html");
      return;
    }
  }

  // Initial view
  let initialView = getViewFromUrl();
  if (!initialView) {
    const user = store.getState().currentUser;
    initialView = user ? "dashboard" : "home";
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
        if (user) {
          store.setUser(user);
          store.setAuthMode("user");
        } else {
          if (store.getState().authMode !== "pin") {
            store.setUser(null);
          }
        }
      });
    } else {
      console.info("[App] Running in DEMO mode (Supabase not configured)");
    }
  }).catch((err) => {
    console.warn("[App] Supabase check failed:", err);
  });

  // Handle browser back/forward
  window.addEventListener("popstate", () => {
    const view = getViewFromUrl() || "home";
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

  // Setup global search palette (Cmd/Ctrl+K)
  setupGlobalSearch((view) => navigate(view));

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
  function update() {
    if (navigator.onLine) badge.classList.remove("show");
    else badge.classList.add("show");
  }
  update();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
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
        <p style="color: #666; max-width: 400px;">${err.message}</p>
        <button onclick="location.reload()" style="padding: 0.5rem 1.5rem; background: #10b981; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-size: 1rem;">Reintentar</button>
      </div>
    `;
  }
}

// Register service worker (skip on file:// protocol)
if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .then((reg) => console.info("[SW] registered:", reg.scope))
      .catch((err) => console.warn("[SW] registration failed:", err));
  });
}
