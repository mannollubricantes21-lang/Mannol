// =====================================================
// Estado del equipo — v5.18.0
// Una sola pantalla que responde «¿ya se subió mi venta?»:
// la última subida correcta, el último error y las ventas que
// este equipo tiene en espera (agrupadas por almacén, con su
// estado). Solo LEE la cola local (offline-sync): no toca la red
// aparte, se actualiza viva con subscribeSyncStatus.
// =====================================================

import {
  subscribeSyncStatus,
  manualSync,
  getLastSyncError,
  getPendingSales,
  getLastSyncOkAt,
  isSyncing,
  BLOCK_REASONS,
} from "../offline-sync.js";
import { groupPendingByWarehouse } from "../offline-queue.js";
import { getStore } from "../store.js";
import { formatMoney, formatWhen } from "../currency.js";
import { icon, esc } from "../ui.js";
import { openPendingList } from "../components/sync-banner.js";

// Roles que además tienen «Historial» en el menú (para el acceso directo)
const HISTORY_ROLES = ["admin", "gestor", "vendedor", "warehouse"];

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function stateBadge(s) {
  if (s.blockedReason) return `<span class="badge badge-danger">Para revisar</span>`;
  if (s.uploading) return `<span class="badge badge-accent">Subiendo…</span>`;
  if (s.lastError && !s.lastError.network) return `<span class="badge badge-danger" title="${esc(s.lastError.message)}">Error · reintenta</span>`;
  return `<span class="badge badge-warning">${navigator.onLine === false ? "Sin conexión" : "En espera"}</span>`;
}

export function mountTeamStatusView(container, navigate) {
  let disposed = false;

  function render() {
    if (disposed) return;
    const state = getStore().getState();
    const user = state.currentUser;
    const wh = state.currentWarehouse || null;
    const online = navigator.onLine !== false;
    const syncing = isSyncing();
    const lastOk = getLastSyncOkAt();
    const lastErr = getLastSyncError();
    const all = getPendingSales();
    const groups = groupPendingByWarehouse(all, wh?.id || null);
    const blocked = all.filter((s) => s.blockedReason).length;
    const sendable = all.length - blocked;
    const canSeeHistory = user && HISTORY_ROLES.includes(user.role);

    // ----- Cabecera: estado de la subida -----
    let statusBadge;
    if (!online) statusBadge = `<span class="badge badge-warning">${icon("wifiOff", 12)} Sin conexión</span>`;
    else if (syncing) statusBadge = `<span class="badge badge-accent">${icon("refresh", 12)} Subiendo…</span>`;
    else statusBadge = `<span class="badge badge-accent">${icon("wifi", 12)} En línea</span>`;

    const headline = !online
      ? "Sin conexión ahora"
      : syncing
        ? "Subiendo ventas a la nube…"
        : all.length > 0
          ? `Con conexión · ${plural(all.length, "venta en espera", "ventas en espera")}`
          : "Con conexión · todo al día";

    const lastOkLine = lastOk
      ? `Última subida correcta: <strong>${esc(formatWhen(lastOk))}</strong>`
      : "Este equipo todavía no ha subido ninguna venta";

    const lastErrHtml = lastErr ? `
      <div class="card" style="border-color:var(--danger,#B3261E);grid-column:1/-1">
        <div class="card-content" style="padding:0.75rem 0.875rem">
          <div class="flex items-center gap-2">
            ${icon("alertTriangle", 16)}
            <strong class="text-sm">Último error de subida</strong>
            <span class="badge badge-danger">${esc(lastErr.code || (lastErr.network ? "RED" : "ERROR"))}</span>
            <span class="text-xs text-muted" style="margin-left:auto">${esc(formatWhen(lastErr.at))}</span>
          </div>
          <p class="text-sm" style="margin:0.375rem 0 0">${esc(lastErr.message)}</p>
          <p class="text-xs text-muted" style="margin:0.375rem 0 0">
            Venta ${esc(lastErr.saleCode)}${lastErr.warehouseCode ? ` · almacén ${esc(lastErr.warehouseCode)}` : ""} ·
            ${lastErr.network ? "fue un problema de conexión: se reintenta sola." : "no fue de conexión: si vuelve a salir, toca «Ver detalle» y copia el reporte."}
          </p>
        </div>
      </div>
    ` : "";

    // ----- Ventas en espera, agrupadas por almacén -----
    const groupsHtml = all.length === 0 ? `
      <div class="card" style="grid-column:1/-1">
        <div class="card-content" style="padding:1.25rem;text-align:center">
          <div class="empty-state-icon">${online ? icon("cloud", 26) : icon("clock", 26)}</div>
          <p class="empty-state-title">${online ? "No hay ventas en espera" : "Sin conexión, pero sin ventas pendientes"}</p>
          <p class="empty-state-desc">${online ? "Todo lo registrado en este equipo está subido a la nube." : "Cuando vendas sin conexión, la venta se guarda aquí y se sube sola al volver internet."}</p>
        </div>
      </div>
    ` : `
      <div class="card" style="grid-column:1/-1">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">
          <h2 class="card-title flex items-center gap-1">${icon("clock", 15)} Ventas guardadas en este equipo (${all.length})</h2>
          <div class="flex items-center gap-2">
            ${sendable > 0 && online ? `<button class="btn btn-primary btn-sm" id="team-sync-now">${icon("refresh", 13)} Subir ahora</button>` : ""}
            <button class="btn btn-outline btn-sm" id="team-open-list">${icon("eye", 13)} Ver detalle</button>
          </div>
        </div>
        <div class="card-content" style="padding:0.625rem 0.75rem 0.75rem;display:flex;flex-direction:column;gap:0.5rem">
          ${blocked > 0 ? `<p class="text-xs" style="color:var(--danger,#B3261E);margin:0">${icon("alertTriangle", 12)} ${plural(blocked, "venta necesita revisión", "ventas necesitan revisión")} — no se suben solas; el motivo está junto a cada una.</p>` : ""}
          ${groups.map((g) => `
            <section style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
              <h4 style="display:flex;align-items:center;gap:0.375rem;margin:0;padding:0.5rem 0.625rem;background:var(--bg-soft);font-size:0.8125rem">
                ${icon("store", 13)} <strong>${esc(g.warehouseCode)}</strong>${g.warehouseName ? ` · ${esc(g.warehouseName)}` : ""}
                ${g.warehouseId === wh?.id ? `<span class="badge badge-accent" style="font-size:0.5rem">Este almacén</span>` : ""}
                <span class="text-xs text-muted" style="margin-left:auto">${plural(g.items.length, "venta", "ventas")}${g.blocked ? ` · ${g.blocked} para revisar` : ""}</span>
              </h4>
              <ul style="list-style:none;margin:0;padding:0">
                ${g.items.map((s) => `
                  <li style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.625rem;border-top:1px solid var(--border);flex-wrap:wrap">
                    <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.75rem;font-weight:700">${esc(s.code)}</span>
                    <span class="text-xs text-muted">${esc(formatWhen(s.createdAt || s.queuedAt))}</span>
                    <span class="text-xs text-muted">${plural((s.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0), "unidad", "unidades")}</span>
                    <strong class="text-xs" style="margin-left:auto">${formatMoney(s.totalUSD ?? s.totalAmount ?? 0, "USD")}</strong>
                    ${stateBadge(s)}
                  </li>
                  ${s.blockedReason ? `<li style="padding:0 0.625rem 0.5rem;border-top:0"><p class="text-xs text-muted" style="margin:0.25rem 0 0">${esc(BLOCK_REASONS[s.blockedReason] || s.blockedReason)}</p></li>` : ""}
                  ${!s.blockedReason && s.lastError && !s.lastError.network ? `<li style="padding:0 0.625rem 0.5rem"><p class="text-xs text-muted" style="margin:0.25rem 0 0">[${esc(s.lastError.code)}] ${esc(s.lastError.message)}</p></li>` : ""}
                `).join("")}
              </ul>
            </section>
          `).join("")}
          <p class="text-xs text-muted" style="margin:0">Cada venta se sube a SU almacén aunque el equipo se use en varios. Se suben solas al abrir la app, al volver la conexión y cada 30 s.</p>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.875rem">
        <div class="card" style="grid-column:1/-1">
          <div class="card-content" style="padding:0.875rem 1rem">
            <div class="flex items-center gap-2" style="flex-wrap:wrap">
              <strong class="text-base">${headline}</strong>
              ${statusBadge}
            </div>
            <p class="text-sm text-muted" style="margin:0.375rem 0 0">${lastOkLine}</p>
          </div>
        </div>
        ${lastErrHtml}
        ${groupsHtml}
        ${canSeeHistory ? `
          <button class="btn btn-ghost" id="team-goto-history" style="justify-content:center">${icon("receipt", 14)} Ver el Historial de ventas subidas</button>
        ` : ""}
      </div>
    `;

    container.querySelector("#team-sync-now")?.addEventListener("click", () => manualSync());
    container.querySelector("#team-open-list")?.addEventListener("click", () => openPendingList());
    container.querySelector("#team-goto-history")?.addEventListener("click", () => navigate("history"));
  }

  const unsub = subscribeSyncStatus(() => render());
  const onOnline = () => render();
  const onOffline = () => render();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  render();

  return () => {
    disposed = true;
    unsub();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
