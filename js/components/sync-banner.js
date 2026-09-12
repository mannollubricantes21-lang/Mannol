// =====================================================
// Sync banner — muestra estado de cola offline
// =====================================================

import { subscribeSyncStatus, manualSync, getLastSyncError } from "../offline-sync.js";
import { icon, escapeHtml } from "../ui.js";

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

    // Error del último intento de sync (visible para poder reportarlo)
    const lastErr = getLastSyncError();
    const errHtml = lastErr
      ? `<div class="sync-banner-error" style="margin-top:0.375rem;font-size:0.7rem;line-height:1.3;color:var(--danger,#ef4444);word-break:break-word">
          ${icon("alertTriangle", 12)} No se pudo subir la venta ${escapeHtml(String(lastErr.saleCode))}:
          <span style="opacity:0.9">[${escapeHtml(String(lastErr.code))}] ${escapeHtml(lastErr.message)}</span>
        </div>
        ${/^(PGRST|42501|42P01)/.test(String(lastErr.code))
          ? `<div style="margin-top:0.25rem;font-size:0.7rem;font-weight:600;color:var(--warning,#f59e0b)">Actualiza esta página 2 veces para cargar la versión nueva de la app.</div>`
          : ""}`
      : "";

    container.innerHTML = `
      <div class="sync-banner sync-banner-pending">
        <div class="sync-banner-icon">${icon("clock", 18)}</div>
        <div class="sync-banner-content">
          <div class="sync-banner-title">${pending} venta(s) pendiente(s)</div>
          <div class="sync-banner-sub">Listas para sincronizar</div>
          ${errHtml}
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
