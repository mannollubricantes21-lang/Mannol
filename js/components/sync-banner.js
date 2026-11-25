// =====================================================
// Sync banner — estado de la cola de ventas sin conexión
// =====================================================
// v5.13.0:
//  · Cuenta las ventas pendientes DE ESTE ALMACÉN y, aparte, las de otros
//    almacenes hechas en este equipo (cada una se sube a su almacén).
//  · "Ver" abre la lista de ventas en espera (código, hora, total, estado).
//  · Ventas "para revisar" (hechas con datos de prueba en versiones
//    anteriores): se muestran aparte, con copiar detalle / descartar.
// =====================================================

import {
  subscribeSyncStatus,
  manualSync,
  getLastSyncError,
  getQueueSummary,
  getPendingSales,
  getLastSyncOkAt,
  discardBlockedSale,
  BLOCK_REASONS,
} from "../offline-sync.js";
import { getStore } from "../store.js";
import { icon, escapeHtml, showModal, toast, copyText, confirmDialog } from "../ui.js";
import { formatMoney, formatWhen } from "../currency.js";
import { getDataAgeMs, formatDataAge } from "../data-freshness.js"; // v5.17
import { groupPendingByWarehouse } from "../offline-queue.js"; // v5.18.0: misma agrupación que «Estado del equipo»

const esc = (v) => escapeHtml(String(v ?? ""));

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function othersLine(summary) {
  if (!summary.othersCount) return "";
  const parts = summary.others.map((g) => `${esc(g.warehouseCode)} ${g.count}`).join(" · ");
  return `<div class="sync-banner-others">${icon("store", 12)} +${plural(summary.othersCount, "venta", "ventas")} de otro almacén (${parts}) · cada una sube a su almacén</div>`;
}

export function createSyncBanner(container) {
  let unsub = null;
  let status = { syncing: false, pending: 0 };

  function currentWarehouse() {
    return getStore().getState().currentWarehouse || null;
  }

  function render() {
    const isOnline = navigator.onLine !== false;
    const { syncing } = status;
    const wh = currentWarehouse();
    const summary = getQueueSummary(wh?.id || null);
    const mine = summary.mine;
    const total = summary.total;
    const blocked = summary.blocked;
    const whCode = wh?.code ? esc(wh.code) : "";

    // Nada que mostrar: online, sin pendientes y sin subir
    if (total === 0 && isOnline && !syncing) {
      container.innerHTML = "";
      return;
    }

    const viewBtn = total > 0
      ? `<button class="btn btn-outline btn-sm sync-banner-btn" data-sync-view type="button">${icon("eye", 14)} Ver</button>`
      : "";

    // ----- Sin conexión -----
    if (!isOnline) {
      // v5.17: decir HACE CUÁNTO son los datos que se ven (el service worker
      // sirve la última copia guardada; antes parecía stock en vivo)
      const stockAge = wh?.id ? getDataAgeMs(`stock:${wh.id}`) : null;
      const ageTxt = stockAge != null ? `Stock guardado de hace ${formatDataAge(stockAge)}` : "";
      const sub = [
        mine > 0
          ? `${plural(mine, "venta", "ventas")}${whCode ? ` de ${whCode}` : ""} esperando conexión · se subirán solas`
          : total > 0 && wh
            ? "Ninguna venta de este almacén en espera"
            : "Puedes seguir vendiendo: las ventas se guardan en este equipo",
        ageTxt,
      ].filter(Boolean).join(" · ");
      container.innerHTML = `
        <div class="sync-banner sync-banner-offline" role="status">
          <div class="sync-banner-icon">${icon("wifiOff", 18)}</div>
          <div class="sync-banner-content">
            <div class="sync-banner-title">Sin conexión${mine > 0 ? ` · ${plural(mine, "venta", "ventas")} en espera` : ""}</div>
            <div class="sync-banner-sub">${sub}</div>
            ${othersLine(summary)}
          </div>
          ${viewBtn}
        </div>
      `;
      wire();
      return;
    }

    // ----- Subiendo -----
    if (syncing) {
      container.innerHTML = `
        <div class="sync-banner sync-banner-syncing" role="status">
          <div class="sync-banner-icon">
            <div class="spinner" style="width:1.25rem;height:1.25rem;border-width:2px"></div>
          </div>
          <div class="sync-banner-content">
            <div class="sync-banner-title">Subiendo ventas a la nube…</div>
            <div class="sync-banner-sub">${plural(total - blocked, "venta pendiente", "ventas pendientes")}${summary.groups.length > 1 ? ` (${summary.groups.map((g) => `${esc(g.warehouseCode)} ${g.count}`).join(" · ")})` : ""}</div>
          </div>
          ${viewBtn}
        </div>
      `;
      wire();
      return;
    }

    // ----- Solo ventas para revisar -----
    const lastErr = getLastSyncError();
    if (total > 0 && blocked === total) {
      container.innerHTML = `
        <div class="sync-banner sync-banner-review" role="status">
          <div class="sync-banner-icon">${icon("alertTriangle", 18)}</div>
          <div class="sync-banner-content">
            <div class="sync-banner-title">${plural(blocked, "venta para revisar", "ventas para revisar")}</div>
            <div class="sync-banner-sub">No se suben solas para no mezclarlas con otro almacén. Toca «Revisar» para ver el motivo.</div>
          </div>
          <button class="btn btn-primary btn-sm sync-banner-btn" data-sync-view type="button">${icon("eye", 14)} Revisar</button>
        </div>
      `;
      wire();
      return;
    }

    // ----- Pendientes con conexión (esperando reintento) -----
    const errHtml = lastErr
      ? `<div class="sync-banner-error">
          ${icon("alertTriangle", 12)} ${lastErr.network
            ? `La conexión falló al subir ${esc(lastErr.saleCode)} · se reintenta sola`
            : `No se pudo subir la venta ${esc(lastErr.saleCode)}: <span style="opacity:0.9">[${esc(lastErr.code)}] ${esc(lastErr.message)}</span>`}
        </div>
        ${/^(PGRST|42501|42P01)/.test(String(lastErr.code))
          ? `<div class="sync-banner-hint">Actualiza esta página 2 veces para cargar la versión nueva de la app.</div>`
          : ""}`
      : "";
    const pendingToSend = total - blocked;
    container.innerHTML = `
      <div class="sync-banner sync-banner-pending" role="status">
        <div class="sync-banner-icon">${icon("clock", 18)}</div>
        <div class="sync-banner-content">
          <div class="sync-banner-title">${mine > 0 || !wh ? plural(wh ? mine : pendingToSend, "venta por subir", "ventas por subir") : "Ventas de otro almacén por subir"}</div>
          <div class="sync-banner-sub">${blocked > 0 ? `${plural(blocked, "para revisar", "para revisar")} · ` : ""}Se suben solas; puedes forzarlo con «Subir ahora»</div>
          ${wh ? othersLine(summary) : ""}
          ${errHtml}
        </div>
        <div class="sync-banner-actions">
          ${pendingToSend > 0 ? `<button class="btn btn-primary btn-sm sync-banner-btn" id="sync-now-btn" type="button">${icon("refresh", 14)} Subir ahora</button>` : ""}
          ${viewBtn}
        </div>
      </div>
    `;
    wire();
  }

  function wire() {
    const btn = container.querySelector("#sync-now-btn");
    if (btn) btn.addEventListener("click", () => manualSync());
    container.querySelectorAll("[data-sync-view]").forEach((b) => b.addEventListener("click", () => openPendingList()));
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

// =====================================================
// Lista de ventas en espera (modal)
// =====================================================

function saleDetailText(s) {
  const lines = [
    `Venta ${s.code} · ${s.warehouseName || ""} (${s.warehouseCode || "?"})`,
    `Fecha: ${new Date(s.createdAt || s.queuedAt || Date.now()).toLocaleString("es-ES")}`,
    `Vendedor: ${s.userName || "—"}`,
    ...(Array.isArray(s.items) ? s.items : []).map((i) => `· ${i.quantity} × ${i.name || i.productId} = ${formatMoney(i.subtotalUSD ?? i.subtotal ?? 0, "USD")}`),
    `Total: ${formatMoney(s.totalUSD ?? s.totalAmount ?? 0, "USD")} · Pago: ${s.currency || ""}`,
  ];
  if (s.note) lines.push(`Nota: ${s.note}`);
  return lines.join("\n");
}

function stateBadge(s) {
  if (s.blockedReason) return `<span class="badge badge-danger">Para revisar</span>`;
  if (s.uploading) return `<span class="badge badge-accent">Subiendo…</span>`;
  if (s.lastError && !s.lastError.network) return `<span class="badge badge-danger" title="${esc(s.lastError.message)}">Error · reintenta</span>`;
  return `<span class="badge badge-warning">${navigator.onLine === false ? "Sin conexión" : "En espera"}</span>`;
}

export function openPendingList() {
  const wh = getStore().getState().currentWarehouse || null;
  const all = getPendingSales();
  const lastOk = getLastSyncOkAt();
  // v5.18.0: agrupación compartida con la vista «Estado del equipo»
  const ordered = groupPendingByWarehouse(all, wh?.id || null)
    .map((g) => [g.warehouseId || "?", { code: g.warehouseCode, name: g.warehouseName, items: g.items }]);

  const body = all.length === 0
    ? `<div class="empty-state" style="padding:1.5rem 0">${icon("cloud", 28)}<p class="mt-2">No hay ventas en espera. Todo está subido.</p></div>`
    : `
      <p class="text-xs text-muted pending-intro">
        Estas ventas están guardadas en <strong>este equipo</strong>. Cada una se sube a <strong>su propio almacén</strong>
        (por eso llevan el código del almacén delante) y nunca se mezclan con las de otros.
        ${lastOk ? `Última subida correcta: ${esc(formatWhen(lastOk))}.` : ""}
      </p>
      ${ordered.map(([id, g]) => `
        <section class="pending-group">
          <h4 class="pending-group-title">
            ${icon("store", 14)} ${esc(g.code)}${g.name ? ` · ${esc(g.name)}` : ""}
            ${id === wh?.id ? `<span class="badge badge-accent">Este almacén</span>` : ""}
            <span class="pending-group-count">${plural(g.items.length, "venta", "ventas")}</span>
          </h4>
          <ul class="pending-list">
            ${g.items.map((s) => `
              <li class="pending-item ${s.blockedReason ? "is-blocked" : ""}">
                <div class="pending-item-main">
                  <span class="pending-code">${esc(s.code)}</span>
                  <span class="pending-total">${formatMoney(s.totalUSD ?? s.totalAmount ?? 0, "USD")}</span>
                </div>
                <div class="pending-item-meta">
                  <span>${esc(formatWhen(s.createdAt || s.queuedAt))}</span>
                  <span>${plural((s.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0), "unidad", "unidades")}</span>
                  ${stateBadge(s)}
                </div>
                ${s.blockedReason ? `
                  <p class="pending-reason">${esc(BLOCK_REASONS[s.blockedReason] || s.blockedReason)}</p>
                  <div class="pending-item-actions">
                    <button class="btn btn-outline btn-sm" type="button" data-copy-sale="${esc(s.id)}">${icon("copy", 14)} Copiar detalle</button>
                    <button class="btn btn-ghost btn-sm text-danger" type="button" data-discard-sale="${esc(s.id)}">${icon("trash", 14)} Descartar</button>
                  </div>` : ""}
                ${!s.blockedReason && s.lastError && !s.lastError.network ? `<p class="pending-reason">[${esc(s.lastError.code)}] ${esc(s.lastError.message)}</p>` : ""}
              </li>`).join("")}
          </ul>
        </section>`).join("")}
    `;

  const sendable = all.filter((s) => !s.blockedReason).length;
  const close = showModal({
    title: `${icon("clock", 18)} Ventas en espera`,
    body: `<div class="pending-modal">${body}</div>`,
    footer: `
      ${sendable > 0 && navigator.onLine !== false ? `<button class="btn btn-primary" type="button" data-pending-sync>${icon("refresh", 14)} Subir ahora</button>` : ""}
      <button class="btn btn-ghost" type="button" data-pending-close>Cerrar</button>
    `,
  });
  const root = document.querySelector("#modal-container .modal-overlay:last-child") || document;
  root.querySelector("[data-pending-close]")?.addEventListener("click", () => close());
  root.querySelector("[data-pending-sync]")?.addEventListener("click", () => { close(); manualSync(); });
  root.querySelectorAll("[data-copy-sale]").forEach((b) => b.addEventListener("click", async () => {
    const s = all.find((x) => x.id === b.dataset.copySale);
    if (!s) return;
    const ok = await copyText(saleDetailText(s));
    toast(ok === false ? "No se pudo copiar" : "Detalle copiado: pásalo al administrador", ok === false ? "warning" : "success");
  }));
  root.querySelectorAll("[data-discard-sale]").forEach((b) => b.addEventListener("click", () => {
    const s = all.find((x) => x.id === b.dataset.discardSale);
    if (!s) return;
    confirmDialog(
      `¿Descartar la venta ${esc(s.code)} de este equipo? Copia antes el detalle si necesitas registrarla a mano. Esta acción no se puede deshacer.`,
      () => {
        if (discardBlockedSale(s.id)) {
          toast(`Venta ${s.code} descartada de este equipo`, "info");
          close();
          openPendingList();
        }
      },
    );
  }));
}
