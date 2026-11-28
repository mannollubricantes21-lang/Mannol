// =====================================================
// Update banner — detecta nuevas versiones de la PWA (service worker)
// =====================================================
// Cuando sw.js se actualiza (nueva CACHE_VERSION), el nuevo SW queda
// en estado "installed" esperando a que todas las pestañas se cierren.
// Esta capa muestra un banner "Nueva versión disponible" con botón
// «Actualizar» que activa el SW nuevo al instante (SKIP_WAITING + reload).
//
// Además REGISTRA el service worker si la página no lo hizo (admin.html
// se puede abrir directo sin pasar por index) y revisa periódicamente
// si hay versión nueva mientras la app queda abierta varios días.
// =====================================================

import { icon } from "./ui.js";

let _bannerShown = false;

function showUpdateBanner(onRefresh) {
  if (_bannerShown) return;
  _bannerShown = true;

  let host = document.getElementById("update-banner-container");
  if (!host) {
    host = document.createElement("div");
    host.id = "update-banner-container";
    host.style.cssText =
      "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(1rem + env(safe-area-inset-bottom,0px));" +
      "z-index:1200;width:min(92vw,26rem);";
    document.body.appendChild(host);
  }
  host.innerHTML = `
    <div class="sync-banner sync-banner-offline" role="status" aria-live="polite" style="border-color:var(--primary)">
      <div class="sync-banner-icon">${icon("refresh", 18)}</div>
      <div class="sync-banner-content">
        <div class="sync-banner-title">Nueva versión disponible</div>
        <div class="sync-banner-sub">Toca «Actualizar» para recargar la app con los cambios.</div>
      </div>
      <button id="sw-update-btn" class="btn btn-primary" type="button"
        style="padding:0.4rem 0.8rem;font-size:0.8rem;flex-shrink:0">Actualizar</button>
    </div>
  `;
  host.querySelector("#sw-update-btn").addEventListener("click", () => {
    host.innerHTML = `
      <div class="sync-banner sync-banner-offline">
        <div class="sync-banner-icon">${icon("refresh", 18)}</div>
        <div class="sync-banner-content">
          <div class="sync-banner-title">Actualizando…</div>
        </div>
      </div>
    `;
    onRefresh();
  });
}

/**
 * Registra (opcional) el SW y muestra el banner cuando hay una versión nueva.
 * @param {Object} opts - { register: boolean } — true en la página principal de cada app.
 */
export function setupUpdateBanner({ register = false } = {}) {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;

  const activate = (reg) => {
    // Ya había un SW esperando al cargar (p.ej. el usuario recargó tras una actualización)
    if (reg.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(() => reg.waiting.postMessage({ type: "SKIP_WAITING" }));
    }
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        // Solo avisar si ya había un SW controlando (es una actualización, no la 1ª instalación)
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateBanner(() => nw.postMessage({ type: "SKIP_WAITING" }));
        }
      });
    });
    // Revisar cada hora si salió una versión nueva (app abierta varios días)
    setInterval(() => { try { reg.update().catch(() => {}); } catch {} }, 60 * 60 * 1000);
  };

  if (register) {
    const doRegister = () => {
      // v5.39.5: el SW es módulo ES (importa la versión de js/version.js)
      navigator.serviceWorker.register("./sw.js", { scope: "./", type: "module" })
        .then(activate)
        .catch((err) => console.warn("[SW] registration failed:", err));
    };
    // v5.13.0: index.html carga app.js con import() dinámico, que casi
    // siempre termina DESPUÉS del evento "load" de la página. Antes el
    // registro esperaba ese evento ya pasado → el service worker NUNCA se
    // registraba y la app no podía abrir sin conexión.
    if (document.readyState === "complete") doRegister();
    else window.addEventListener("load", doRegister, { once: true });
  } else {
    navigator.serviceWorker.getRegistration("./").then((reg) => {
      if (reg) activate(reg);
    });
  }

  // Recargar cuando el nuevo SW tome el control (evita estados mezclados)
  let refreshing = false;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true; // 1ª instalación — no recargar
      return;
    }
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
