// =====================================================
// Sales History view — con estados PENDIENTE/COMPLETADA/CANCELADA
// =====================================================

import { getStore } from "../store.js";
import { subscribeSales, updateSaleStatus } from "../firestore.js";
import { formatMoney, formatDate, CURRENCY_LABELS, STATUS_LABELS } from "../currency.js";
import { toast, icon, showModal, closeModal } from "../ui.js";

export function mountSalesHistoryView(container, navigate) {
  const store = getStore();
  const user = store.getState().currentUser;
  const warehouse = store.getState().currentWarehouse;
  let sales = [];
  let search = "";
  let statusFilter = "all";

  function render() {
    const filtered = sales.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.code.toLowerCase().includes(q) &&
            !(s.userName || "").toLowerCase().includes(q) &&
            !(s.managerName || "").toLowerCase().includes(q) &&
            !(s.customerName || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const totalCompleted = filtered.filter((s) => s.status === "COMPLETADA").reduce((sum, s) => sum + s.totalAmount, 0);
    const totalCancelled = filtered.filter((s) => s.status === "CANCELADA").reduce((sum, s) => sum + s.totalAmount, 0);
    const totalPending = filtered.filter((s) => s.status === "PENDIENTE").reduce((sum, s) => sum + s.totalAmount, 0);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div>
          <h1 class="text-2xl font-bold flex items-center gap-2">${icon("receipt", 24)} Historial de ventas</h1>
          <p class="text-sm text-muted">${warehouse ? `Almacén: ${warehouse.name}` : 'Todos los almacenes'} · ${filtered.length} ventas</p>
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
            <div class="flex gap-2">
              <div style="position:relative;flex:1">
                <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 16)}</span>
                <input class="input" placeholder="Buscar por código, vendedor, gestor..." id="search-input" value="${search}" style="padding-left:2.25rem" />
              </div>
              <select class="select" id="status-filter" style="width:10rem">
                <option value="all" ${statusFilter === "all" ? "selected" : ""}>Todos</option>
                <option value="COMPLETADA" ${statusFilter === "COMPLETADA" ? "selected" : ""}>Completadas</option>
                <option value="PENDIENTE" ${statusFilter === "PENDIENTE" ? "selected" : ""}>Pendientes</option>
                <option value="CANCELADA" ${statusFilter === "CANCELADA" ? "selected" : ""}>Canceladas</option>
              </select>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Código</th><th>Fecha</th><th>Vendedor</th><th>Gestor</th><th class="text-center">Items</th><th class="text-center">Pago</th><th class="text-right">Total</th><th class="text-center">Estado</th><th class="text-right">Acciones</th></tr></thead>
              <tbody>
                ${filtered.length === 0 ? `<tr><td colspan="9" class="empty-state">No hay ventas que coincidan</td></tr>` :
                  filtered.slice(0, 100).map((s) => `
                    <tr>
                      <td class="text-xs font-mono">${s.code}</td>
                      <td class="text-xs">${formatDate(s.createdAt)}</td>
                      <td class="text-sm">${s.userName || 'Empleado PIN'}</td>
                      <td class="text-sm">${s.managerName || '—'}</td>
                      <td class="text-center">${s.items.length}</td>
                      <td class="text-center"><span class="badge badge-outline">${s.paymentMode === 'MULTI' ? 'Multi' : (s.currency || '—')}</span></td>
                      <td class="text-right font-bold">${formatMoney(s.totalAmount, "USD")}</td>
                      <td class="text-center">
                        <span class="badge ${s.status === 'COMPLETADA' ? 'badge-accent' : s.status === 'CANCELADA' ? 'badge-danger' : 'badge-warning'}" style="font-size:0.5625rem">
                          ${STATUS_LABELS[s.status] || s.status}
                        </span>
                      </td>
                      <td class="text-right">
                        <button class="btn btn-ghost btn-icon btn-sm" data-view-sale="${s.id}" title="Ver detalle">${icon("eye", 14)}</button>
                        ${s.status === 'PENDIENTE' ? `<button class="btn btn-ghost btn-icon btn-sm text-accent" data-complete="${s.id}" title="Completar">${icon("check", 14)}</button>` : ''}
                        ${s.status === 'COMPLETADA' ? `<button class="btn btn-ghost btn-icon btn-sm text-danger" data-cancel="${s.id}" title="Cancelar">${icon("ban", 14)}</button>` : ''}
                        ${s.status === 'CANCELADA' ? `<button class="btn btn-ghost btn-icon btn-sm text-warning" data-reopen="${s.id}" title="Reabrir">${icon("refresh", 14)}</button>` : ''}
                      </td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const searchInput = container.querySelector("#search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        search = e.target.value;
        render();
        const newInput = container.querySelector("#search-input");
        if (newInput) { newInput.focus(); newInput.setSelectionRange(search.length, search.length); }
      });
    }
    const statusSelect = container.querySelector("#status-filter");
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => { statusFilter = e.target.value; render(); });
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
  }

  function showSaleDetail(sale) {
    showModal({
      title: `Detalle de venta · ${sale.code}`,
      size: "lg",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.875rem">
          <div class="grid grid-cols-2 gap-2">
            <div><div class="label label-xs">Código</div><div class="font-mono text-xs">${sale.code}</div></div>
            <div><div class="label label-xs">Fecha</div><div class="text-xs">${formatDate(sale.createdAt)}</div></div>
            <div><div class="label label-xs">Vendedor</div><div>${sale.userName || 'Empleado PIN'}</div></div>
            <div><div class="label label-xs">Gestor</div><div>${sale.managerName || '—'} ${sale.managerCode ? `(${sale.managerCode})` : ''}</div></div>
            <div><div class="label label-xs">Almacén</div><div>${sale.warehouseName || '—'}</div></div>
            <div><div class="label label-xs">Cliente</div><div>${sale.customerName || '—'}</div></div>
            <div><div class="label label-xs">Estado</div><span class="badge ${sale.status === 'COMPLETADA' ? 'badge-accent' : sale.status === 'CANCELADA' ? 'badge-danger' : 'badge-warning'}">${STATUS_LABELS[sale.status]}</span></div>
            <div><div class="label label-xs">Modo de pago</div><div>${sale.paymentMode} · ${sale.currency}</div></div>
          </div>
          ${sale.cancelReason ? `<div class="text-xs text-danger" style="background: color-mix(in oklab, var(--danger) 10%, transparent); padding: 0.5rem; border-radius: var(--radius); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent)"><strong>Motivo de cancelación:</strong> ${sale.cancelReason}</div>` : ''}
          <hr class="separator" />
          <div><div class="label label-xs">Productos (${sale.items.length})</div>
            <div style="display:flex;flex-direction:column;gap:0.25rem;margin-top:0.25rem">
              ${sale.items.map((i) => `
                <div class="flex justify-between text-xs">
                  <span>${i.quantity}x ${i.productName}<span class="text-muted"> · ${i.brand || ''}</span></span>
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
                ${sale.paidTransfer > 0 ? `<div class="flex justify-between text-xs"><span>Transferencia ${sale.cardName || ''}:</span><span>${formatMoney(sale.paidTransfer, "USD")}</span></div>` : ''}
              </div>
            </div>
          ` : `
            <div><div class="label label-xs">Pago</div>
              <div class="text-xs">
                ${CURRENCY_LABELS[sale.currency] || sale.currency}: ${formatMoney(sale.totalAmount, sale.currency)}
                ${sale.cardName ? `<br>Tarjeta: ${sale.cardName} (${sale.cardNumber})` : ''}
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

  function showStatusDialog(sale, newStatus) {
    const isCancel = newStatus === "CANCELADA";
    const close = showModal({
      title: isCancel ? "Cancelar venta" : "Completar venta",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <p class="text-sm">
            ${isCancel
              ? `Esta acción <strong>${sale.status === "COMPLETADA" ? "devolverá el stock" : "cambiará el estado"}</strong> de la venta <code>${sale.code}</code>.`
              : `Esta acción <strong>descontará el stock</strong> y marcará la venta <code>${sale.code}</code> como completada.`
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
    render();
  }, warehouse ? { warehouseId: warehouse.id } : {});

  render();
  return unsub;
}
