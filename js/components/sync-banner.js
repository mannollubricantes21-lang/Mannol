// =====================================================
// Sync banner — muestra estado de cola offline
// =====================================================

import { subscribeSyncStatus, manualSync } from "../offline-sync.js";
import { icon } from "../ui.js";

export function createSyncBanner(container) {
  let unsub = null;
  let status = { syncing: false, pending: 0 };

  function render() {
    const isOnline = navigator.onLine;
    const { syncing, pending } = status;

    // No mostrar nada si no hay pendientes y estamos online y no sincronizando
    if (pending === 0 && isOnline && !syncing) {
      container.innerHTML = "";
      return;
    }

    if (!isOnline) {
      container.innerHTML = `
        <div class="sync-banner sync-banner-offline">
          <div class="sync-banner-icon">${icon("wifiOff", 18)}</div>
          <div class="sync-banner-content">
            <div class="sync-banner-title">Sin conexión</div>
            <div class="sync-banner-sub">
              ${pending > 0
                ? `${pending} venta(s) en cola · Se sincronizarán al recuperar internet`
                : "Las ventas se guardarán localmente"
              }
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (syncing) {
      container.innerHTML = `
        <div class="sync-banner sync-banner-syncing">
          <div class="sync-banner-icon">
            <div class="spinner" style="width:1.25rem;height:1.25rem;border-width:2px"></div>
          </div>
          <div class="sync-banner-content">
            <div class="sync-banner-title">Sincronizando ventas...</div>
            <div class="sync-banner-sub">${pending} venta(s) pendiente(s)</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="sync-banner sync-banner-pending">
        <div class="sync-banner-icon">${icon("clock", 18)}</div>
        <div class="sync-banner-content">
          <div class="sync-banner-title">${pending} venta(s) pendiente(s)</div>
          <div class="sync-banner-sub">Listas para sincronizar</div>
        </div>
        <button class="btn btn-primary btn-sm" id="sync-now-btn">
          ${icon("refresh", 14)} Sincronizar
        </button>
      </div>
    `;

    const btn = container.querySelector("#sync-now-btn");
    if (btn) {
      btn.addEventListener("click", () => manualSync());
    }
  }

  unsub = subscribeSyncStatus((newStatus) => {
    status = newStatus;
    render();
  });

  const onOnline = () => render();
  const onOffline = () => render();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  render();

  return () => {
    if (unsub) unsub();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
