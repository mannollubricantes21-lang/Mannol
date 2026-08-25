// =====================================================
// Sales History view — con estados PENDIENTE/COMPLETADA/CANCELADA
// =====================================================

import { getStore } from "../store.js";
import { subscribeSales, updateSaleStatus } from "../db.js";
import { formatMoney, formatDate, formatDateShort, CURRENCY_LABELS, STATUS_LABELS, skeletonStatCard, skeletonRow } from "../currency.js";
import { toast, icon, showModal, closeModal, esc } from "../ui.js";
import { exportToCSV } from "../csv-export.js";
import { notifySaleCompleted } from "../push-notify.js";

export function mountSalesHistoryView(container, navigate) {
  const store = getStore();
  const user = store.getState().currentUser;
  const warehouse = store.getState().currentWarehouse;
  let sales = [];
  let search = "";
  let statusFilter = "all";
  let dateFrom = "";
  let dateTo = "";
  let isLoading = true;
  // Paginación
  const PAGE_SIZE = 50;
  let currentPage = 1;

  function render() {
    if (isLoading) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("receipt", 24)} Historial de ventas</h1>
            <p class="text-sm text-muted">Cargando ventas…</p>
          </div>
          <div class="grid md:grid-cols-3 gap-3">${skeletonStatCard(3)}</div>
          <div class="card">
            <div class="overflow-x-auto">
              <table class="table"><thead><tr><th>Código</th><th>Fecha</th><th>Vendedor</th><th class="text-right">Total</th><th class="text-center">Estado</th></tr></thead>
              <tbody>${skeletonRow(8, 5)}</tbody></table>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const filtered = sales.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (s.createdAt < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo).getTime() + 86400000; // include full day
        if (s.createdAt >= to) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!s.code.toLowerCase().includes(q) &&
            !(s.userName || "").toLowerCase().includes(q) &&
            !(s.managerName || "").toLowerCase().includes(q) &&
            !(s.customerName || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Paginación: resetear a página 1 si los filtros cambian
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const pageEnd = pageStart + PAGE_SIZE;
    const pagedSales = filtered.slice(pageStart, pageEnd);

    const totalCompleted = filtered.filter((s) => s.status === "COMPLETADA").reduce((sum, s) => sum + s.totalAmount, 0);
    const totalCancelled = filtered.filter((s) => s.status === "CANCELADA").reduce((sum, s) => sum + s.totalAmount, 0);
    const totalPending = filtered.filter((s) => s.status === "PENDIENTE").reduce((sum, s) => sum + s.totalAmount, 0);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("receipt", 24)} Historial de ventas</h1>
            <p class="text-sm text-muted">${warehouse ? `Almacén: ${esc(warehouse.name)}` : 'Todos los almacenes'} · ${filtered.length} ventas${filtered.length > PAGE_SIZE ? ` (página ${currentPage} de ${totalPages})` : ''}</p>
          </div>

        <div class="grid md:grid-cols-3 gap-3">
          <div class="stat-card">
            <div class="stat-label" style="color:var(--accent)">${icon("check", 14)} Completadas</div>
            <div class="stat-value text-accent">${formatMoney(totalCompleted, "USD")}</div>
            <div class="stat-sub">${filtered.filter((s) => s.status === "COMPLETADA").length} ventas</div>
          </div>
          <div class="stat-card">
            <div class="stat-label" style="color:var(--warning)">${icon("clock", 14)} Pendientes</div>
            <div class="stat-value text-warning">${formatMoney(totalPending, "USD")}</div>
            <div class="stat-sub">${filtered.filter((s) => s.status === "PENDIENTE").length} ventas</div>
          </div>
          <div class="stat-card">
            <div class="stat-label" style="color:var(--danger)">${icon("ban", 14)} Canceladas</div>
            <div class="stat-value text-danger">${formatMoney(totalCancelled, "USD")}</div>
            <div class="stat-sub">${filtered.filter((s) => s.status === "CANCELADA").length} ventas</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="flex gap-2 flex-wrap" style="gap:0.5rem">
              <div style="position:relative;flex:1;min-width:12rem">
                <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)" aria-hidden="true">${icon("search", 16)}</span>
                <input class="input" placeholder="Buscar por código, vendedor, gestor, cliente..." id="search-input" value="${search}" style="padding-left:2.25rem" aria-label="Buscar ventas" />
              </div>
              <select class="select" id="status-filter" style="width:9rem" aria-label="Filtrar por estado">
                <option value="all" ${statusFilter === "all" ? "selected" : ""}>Todos</option>
                <option value="COMPLETADA" ${statusFilter === "COMPLETADA" ? "selected" : ""}>Completadas</option>
                <option value="PENDIENTE" ${statusFilter === "PENDIENTE" ? "selected" : ""}>Pendientes</option>
                <option value="CANCELADA" ${statusFilter === "CANCELADA" ? "selected" : ""}>Canceladas</option>
              </select>
              <input type="date" class="input" id="date-from" value="${dateFrom}" aria-label="Fecha desde" style="width:9rem" />
              <input type="date" class="input" id="date-to" value="${dateTo}" aria-label="Fecha hasta" style="width:9rem" />
              <button class="btn btn-outline btn-sm" id="export-csv-btn" title="Exportar ventas filtradas a CSV" aria-label="Exportar a CSV">${icon("download", 14)} CSV</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Código</th><th>Fecha</th><th>Vendedor</th><th>Gestor</th><th class="text-center">Items</th><th class="text-center">Pago</th><th class="text-right">Total</th><th class="text-center">Estado</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${pagedSales.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">${icon("receipt", 24)}</div><p class="empty-state-title">Sin ventas</p><p class="empty-state-desc">No hay ventas que coincidan con los filtros seleccionados.</p></div></td></tr>` :
                  pagedSales.map((s) => `
                    <tr>
                      <td class="text-xs font-mono">${esc(s.code)}${s.saleType === "WHOLESALE" ? ` <span class="badge badge-accent" style="font-size:0.5625rem">MAY</span>` : ''}</td>
                      <td class="text-xs">${formatDate(s.createdAt)}</td>
                      <td class="text-sm">${esc(s.userName || 'Empleado PIN')}</td>
                      <td class="text-sm">${esc(s.managerName || '—')}</td>
                      <td class="text-center">${s.items.length}</td>
                      <td class="text-center"><span class="badge badge-outline">${s.paymentMode === 'MULTI' ? 'Multi' : esc(s.currency || '—')}</span></td>
                      <td class="text-right font-bold">${formatMoney(s.totalAmount, "USD")}</td>
                      <td class="text-center">
                        <span class="badge ${s.status === 'COMPLETADA' ? 'badge-accent' : s.status === 'CANCELADA' ? 'badge-danger' : 'badge-warning'}" style="font-size:0.5625rem">
                          ${STATUS_LABELS[s.status] || esc(s.status)}
                        </span>
                      </td>
                      <td class="text-right">
                        <button class="btn btn-ghost btn-icon btn-sm" data-view-sale="${esc(s.id)}" title="Ver detalle">${icon("eye", 14)}</button>
                        ${s.status === 'PENDIENTE' ? `<button class="btn btn-ghost btn-icon btn-sm text-accent" data-complete="${esc(s.id)}" title="Completar">${icon("check", 14)}</button>` : ''}
                        ${s.status === 'COMPLETADA' ? `<button class="btn btn-ghost btn-icon btn-sm text-danger" data-cancel="${esc(s.id)}" title="Cancelar">${icon("ban", 14)}</button>` : ''}
                        ${s.status === 'CANCELADA' ? `<button class="btn btn-ghost btn-icon btn-sm text-warning" data-reopen="${esc(s.id)}" title="Reabrir">${icon("refresh", 14)}</button>` : ''}
                      </td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
          ${totalPages > 1 ? renderPagination(filtered.length, totalPages) : ''}
        </div>
      </div>
    `;

    const searchInput = container.querySelector("#search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        search = e.target.value;
        currentPage = 1;
        render();
        const newInput = container.querySelector("#search-input");
        if (newInput) { newInput.focus(); newInput.setSelectionRange(search.length, search.length); }
      });
    }
    const statusSelect = container.querySelector("#status-filter");
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => { statusFilter = e.target.value; currentPage = 1; render(); });
    }
    const dateFromInput = container.querySelector("#date-from");
    if (dateFromInput) {
      dateFromInput.addEventListener("change", (e) => { dateFrom = e.target.value; currentPage = 1; render(); });
    }
    const dateToInput = container.querySelector("#date-to");
    if (dateToInput) {
      dateToInput.addEventListener("change", (e) => { dateTo = e.target.value; currentPage = 1; render(); });
    }
    const exportBtn = container.querySelector("#export-csv-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const rows = filtered.map((s) => ({
          codigo: s.code,
          fecha: formatDate(s.createdAt),
          vendedor: s.userName || 'Empleado PIN',
          gestor: s.managerName || '',
          cliente: s.customerName || '',
          almacen: s.warehouseName || '',
          items: s.items.length,
          moneda: s.currency,
          total_usd: s.totalAmount,
          estado: STATUS_LABELS[s.status] || s.status,
          metodo_pago: s.paymentMethod || '',
          tarjeta: s.cardName || '',
        }));
        exportToCSV(`ventas-${warehouse?.code || 'todos'}`, rows);
        toast(`${rows.length} ventas exportadas`, "success");
      });
    }

    container.querySelectorAll("[data-view-sale]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sale = sales.find((s) => s.id === btn.dataset.viewSale);
        if (sale) showSaleDetail(sale);
      });
    });
    container.querySelectorAll("[data-complete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sale = sales.find((s) => s.id === btn.dataset.complete);
        if (sale) showStatusDialog(sale, "COMPLETADA");
      });
    });
    container.querySelectorAll("[data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sale = sales.find((s) => s.id === btn.dataset.cancel);
        if (sale) showStatusDialog(sale, "CANCELADA");
      });
    });
    container.querySelectorAll("[data-reopen]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sale = sales.find((s) => s.id === btn.dataset.reopen);
        if (sale) {
          try {
            await updateSaleStatus(sale.id, "PENDIENTE", null, user?.id, user?.displayName);
            toast("Venta reabierta", "success");
          } catch (err) {
            toast("Error al reabrir venta", "error");
          }
        }
      });
    });

    // Paginación
    container.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.page;
        if (p === "first") currentPage = 1;
        else if (p === "prev") currentPage = Math.max(1, currentPage - 1);
        else if (p === "next") currentPage = Math.min(totalPages, currentPage + 1);
        else if (p === "last") currentPage = totalPages;
        else currentPage = parseInt(p) || 1;
        render();
        // Scroll a la tabla
        const card = container.querySelector(".card");
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function showSaleDetail(sale) {
    showModal({
      title: `Detalle de venta · ${esc(sale.code)}`,
      size: "lg",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.875rem">
          <div class="grid grid-cols-2 gap-2">
            <div><div class="label label-xs">Código</div><div class="font-mono text-xs">${esc(sale.code)}</div></div>
            <div><div class="label label-xs">Fecha</div><div class="text-xs">${formatDate(sale.createdAt)}</div></div>
            <div><div class="label label-xs">Vendedor</div><div>${esc(sale.userName || 'Empleado PIN')}</div></div>
            <div><div class="label label-xs">Gestor</div><div>${esc(sale.managerName || '—')} ${sale.managerCode ? `(${esc(sale.managerCode)})` : ''}</div></div>
            <div><div class="label label-xs">Almacén</div><div>${esc(sale.warehouseName || '—')}</div></div>
            <div><div class="label label-xs">Cliente</div><div>${esc(sale.customerName || '—')}</div></div>
            <div><div class="label label-xs">Estado</div><span class="badge ${sale.status === 'COMPLETADA' ? 'badge-accent' : sale.status === 'CANCELADA' ? 'badge-danger' : 'badge-warning'}">${STATUS_LABELS[sale.status] || esc(sale.status)}</span></div>
            <div><div class="label label-xs">Modo de pago</div><div>${esc(sale.paymentMode || '')} · ${esc(sale.currency || '')}</div></div>
          </div>
          ${sale.note ? `<div class="text-xs" style="background: var(--bg-soft); padding: 0.5rem; border-radius: var(--radius); border: 1px solid var(--border)"><strong>Nota:</strong> ${esc(sale.note)}</div>` : ''}
          ${sale.cancelReason ? `<div class="text-xs text-danger" style="background: color-mix(in oklab, var(--danger) 10%, transparent); padding: 0.5rem; border-radius: var(--radius); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent)"><strong>Motivo de cancelación:</strong> ${esc(sale.cancelReason)}</div>` : ''}
          <hr class="separator" />
          <div><div class="label label-xs">Productos (${sale.items.length})</div>
            <div style="display:flex;flex-direction:column;gap:0.25rem;margin-top:0.25rem">
              ${sale.items.map((i) => `
                <div class="flex justify-between text-xs">
                  <span>${esc(i.quantity)}x ${esc(i.name || i.productName)}<span class="text-muted"> · ${esc(i.brand || '')}</span></span>
                  <span>${formatMoney(i.subtotal, "USD")}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <hr class="separator" />
          ${sale.paymentMode === "MULTI" ? `
            <div><div class="label label-xs">Pagos (multi-moneda)</div>
              <div style="display:flex;flex-direction:column;gap:0.25rem;margin-top:0.25rem">
                ${sale.paidUSD > 0 ? `<div class="flex justify-between text-xs"><span>USD:</span><span>${formatMoney(sale.paidUSD, "USD")}</span></div>` : ''}
                ${sale.paidMN > 0 ? `<div class="flex justify-between text-xs"><span>MN:</span><span>${formatMoney(sale.paidMN, "MN")}</span></div>` : ''}
                ${sale.paidEUR > 0 ? `<div class="flex justify-between text-xs"><span>EUR:</span><span>${formatMoney(sale.paidEUR, "EUR")}</span></div>` : ''}
                ${sale.paidTransfer > 0 ? `<div class="flex justify-between text-xs"><span>Transferencia ${esc(sale.cardName || '')}:</span><span>${formatMoney(sale.paidTransfer, "USD")}</span></div>` : ''}
              </div>
            </div>
          ` : `
            <div><div class="label label-xs">Pago</div>
              <div class="text-xs">
                ${CURRENCY_LABELS[sale.currency] || esc(sale.currency)}: ${formatMoney(sale.totalAmount, sale.currency)}
                ${sale.cardName ? `<br>Tarjeta: ${esc(sale.cardName)} (${esc(sale.cardNumber || '')})` : ''}
                ${sale.transferAmount ? `<br>Monto transferido: ${formatMoney(sale.transferAmount, "USD")}` : ''}
              </div>
            </div>
          `}
          <hr class="separator" />
          <div class="flex justify-between font-bold text-base">
            <span>Total</span>
            <span>${formatMoney(sale.totalAmount, "USD")}</span>
          </div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="close-detail">Cerrar</button>`,
    });
    document.querySelector("#close-detail").addEventListener("click", closeModal);
  }

  // ===== Paginación =====
  function renderPagination(total, totalPages) {
    const pages = [];
    // Mostrar máx 5 botones de página alrededor de la actual
    const windowSize = 5;
    let startPage = Math.max(1, currentPage - Math.floor(windowSize / 2));
    let endPage = Math.min(totalPages, startPage + windowSize - 1);
    startPage = Math.max(1, endPage - windowSize + 1);

    for (let i = startPage; i <= endPage; i++) pages.push(i);

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1rem;border-top:1px solid var(--border);flex-wrap:wrap;gap:0.5rem">
        <span class="text-xs text-muted">Mostrando ${pageStart + 1}-${Math.min(pageEnd, total)} de ${total}</span>
        <div style="display:flex;gap:0.25rem;align-items:center">
          <button class="btn btn-ghost btn-sm" data-page="first" ${currentPage === 1 ? 'disabled' : ''} aria-label="Primera página">«</button>
          <button class="btn btn-ghost btn-sm" data-page="prev" ${currentPage === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
          ${pages.map((p) => `<button class="btn ${p === currentPage ? 'btn-primary' : 'btn-ghost'} btn-sm" data-page="${p}" aria-label="Página ${p}" aria-current="${p === currentPage ? 'page' : 'false'}">${p}</button>`).join('')}
          <button class="btn btn-ghost btn-sm" data-page="next" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Página siguiente">›</button>
          <button class="btn btn-ghost btn-sm" data-page="last" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Última página">»</button>
        </div>
      </div>
    `;
  }

  function showStatusDialog(sale, newStatus) {
    const isCancel = newStatus === "CANCELADA";
    const close = showModal({
      title: isCancel ? "Cancelar venta" : "Completar venta",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <p class="text-sm">
            ${isCancel
              ? `Esta acción <strong>${sale.status === "COMPLETADA" ? "devolverá el stock" : "cambiará el estado"}</strong> de la venta <code>${esc(sale.code)}</code>.`
              : `Esta acción <strong>descontará el stock</strong> y marcará la venta <code>${esc(sale.code)}</code> como completada.`
            }
          </p>
          ${isCancel ? `
            <div>
              <label class="label">Motivo de cancelación *</label>
              <input class="input" id="cancel-reason" placeholder="Ej: Error de cobro, devolución..." />
            </div>
          ` : ''}
        </div>
      `,
      footer: `
        <button class="btn btn-outline" id="status-cancel">Cerrar</button>
        <button class="btn ${isCancel ? 'btn-danger' : 'btn-accent'}" id="status-confirm">
          ${isCancel ? icon("ban", 14) : icon("check", 14)}
          Confirmar
        </button>
      `,
    });
    document.querySelector("#status-cancel").addEventListener("click", close);
    document.querySelector("#status-confirm").addEventListener("click", async () => {
      const reason = isCancel ? document.querySelector("#cancel-reason").value.trim() : null;
      if (isCancel && !reason) {
        toast("Indica el motivo de cancelación", "error");
        return;
      }
      try {
        await updateSaleStatus(sale.id, newStatus, reason, user?.id, user?.displayName);
        toast(`Venta ${newStatus === "COMPLETADA" ? "completada" : "cancelada"}`, "success");
        if (newStatus === "COMPLETADA") {
          notifySaleCompleted({
            id: sale.id,
            code: sale.code,
            totalAmount: sale.totalAmount,
            currency: sale.currency,
            items: sale.items,
            warehouseName: sale.warehouseName,
          });
        }
        close();
      } catch (err) {
        toast(err.message || "Error al cambiar estado", "error");
      }
    });
  }

  const unsub = subscribeSales((items) => {
    if (user?.role === "vendedor" || user?.role === "warehouse") {
      sales = items.filter((s) => s.userId === user.id || s.warehouseId === user.warehouseId);
    } else {
      sales = items;
    }
    isLoading = false;
    render();
  }, warehouse ? { warehouseId: warehouse.id } : {});

  render();
  return unsub;
}
