// =====================================================
// App bootstrap — MANNOL POS
// =====================================================

import { getStore, applyTheme } from "./store.js";
import { subscribeAuth } from "./auth.js";
import { isFirebaseConfiguredAsync } from "./firebase.js";
import { setupAutoSync } from "./offline-sync.js";
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

  // Initial view
  let initialView = getViewFromUrl();
  if (!initialView) {
    const user = store.getState().currentUser;
    initialView = user ? "dashboard" : "home";
  }

  console.info("[App] rendering initial view:", initialView);
  renderView(container, initialView, navigate);
  console.info("[App] initial view rendered");

  // Check Firebase config (async, non-blocking)
  isFirebaseConfiguredAsync().then((configured) => {
    console.info("[App] Firebase configured:", configured);
    if (configured) {
      // Subscribe to auth changes only if Firebase is available
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
      console.info("[App] Running in DEMO mode (Firebase not configured)");
    }
  }).catch((err) => {
    console.warn("[App] Firebase check failed:", err);
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

  console.info("[App] init done");
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
