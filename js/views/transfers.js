// =====================================================
// Transfers view — ventas pagadas por transferencia
// =====================================================

import { getStore } from "../store.js";
import { listTransfers, listCards } from "../firestore.js";
import { formatMoney, formatDate, maskCard, CARD_BRANDS } from "../currency.js";
import { icon } from "../ui.js";

export function mountTransfersView(container, navigate) {
  const store = getStore();
  const user = store.getState().currentUser;
  const warehouse = store.getState().currentWarehouse;
  let transfers = [];
  let cards = [];
  let filterCard = "all";
  let filterWarehouse = warehouse?.id || "all";
  let loading = true;

  async function load() {
    loading = true;
    render();
    const filters = {};
    if (filterWarehouse !== "all") filters.warehouseId = filterWarehouse;
    [transfers, cards] = await Promise.all([
      listTransfers(filters),
      listCards(),
    ]);
    loading = false;
    render();
  }

  function render() {
    const filtered = filterCard === "all" ? transfers : transfers.filter((t) => (t.cardId || `free-${t.cardNumber}`) === filterCard);

    // Stats by card
    const byCard = {};
    for (const t of transfers) {
      if (t.status !== "COMPLETADA") continue;
      const key = t.cardId || `free-${t.cardNumber}`;
      if (!byCard[key]) byCard[key] = { name: t.cardName, number: t.cardNumber, count: 0, total: 0 };
      byCard[key].count++;
      byCard[key].total += t.transferAmount || t.totalAmount;
    }

    const totalAmount = filtered.filter((t) => t.status === "COMPLETADA").reduce((s, t) => s + (t.transferAmount || t.totalAmount), 0);

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div>
          <h1 class="text-2xl font-bold flex items-center gap-2">${icon("creditCard", 24)} Transferencias</h1>
          <p class="text-sm text-muted">Ventas pagadas con tarjeta (BPA, BANDEC, BANMET)</p>
        </div>

        <div class="flex gap-2 flex-wrap">
          <select class="select" id="filter-card" style="width:14rem">
            <option value="all">Todas las tarjetas</option>
            ${Object.entries(byCard).map(([key, c]) => `<option value="${key}" ${filterCard === key ? 'selected' : ''}>${c.name} (${c.count})</option>`).join('')}
          </select>
          ${user?.role === "admin" ? `
            <select class="select" id="filter-warehouse" style="width:12rem">
              <option value="all">Todos los almacenes</option>
              ${(store.getState()._warehouses || []).map((w) => `<option value="${w.id}" ${filterWarehouse === w.id ? 'selected' : ''}>${w.name}</option>`).join('')}
            </select>
          ` : ''}
        </div>

        <div class="grid md:grid-cols-2 gap-3">
          <div class="stat-card">
            <div class="stat-label">${icon("creditCard", 14)} Total transferencias</div>
            <div class="stat-value">${formatMoney(totalAmount, "USD")}</div>
            <div class="stat-sub">${filtered.filter((t) => t.status === "COMPLETADA").length} ventas</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${icon("creditCard", 14)} Tarjetas activas</div>
            <div class="stat-value">${Object.keys(byCard).length}</div>
            <div class="stat-sub">${cards.length} tarjetas registradas</div>
          </div>
        </div>

        ${Object.keys(byCard).length > 0 ? `
          <div class="card">
            <div class="card-header"><h3 class="card-title">Resumen por tarjeta</h3></div>
            <div class="card-content">
              <div class="grid grid-cols-2 gap-2">
                ${Object.entries(byCard).map(([key, c]) => `
                  <div class="border rounded p-2" style="border-color:var(--border)">
                    <div class="text-xs text-muted">${c.name}</div>
                    <div class="text-xs font-mono">${maskCard(c.number)}</div>
                    <div class="flex justify-between mt-1">
                      <span class="text-xs">${c.count} ventas</span>
                      <span class="font-bold text-sm">${formatMoney(c.total, "USD")}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <div class="card">
          <div class="card-header"><h3 class="card-title">Transferencias (${filtered.length})</h3></div>
          <div class="overflow-x-auto">
            ${loading ? `<div class="empty-state"><div class="spinner"></div></div>` :
              filtered.length === 0 ? `<div class="empty-state">No hay transferencias</div>` :
              `<table class="table">
                <thead><tr><th>Código</th><th>Fecha</th><th>Tarjeta</th><th>Almacén</th><th>Gestor</th><th>Productos</th><th class="text-right">Monto</th><th class="text-center">Estado</th></tr></thead>
                <tbody>
                  ${filtered.slice(0, 100).map((t) => `
                    <tr>
                      <td class="text-xs font-mono">${t.code}</td>
                      <td class="text-xs">${formatDate(t.createdAt)}</td>
                      <td class="text-xs">
                        <div>${t.cardName}</div>
                        <div class="font-mono text-muted">${maskCard(t.cardNumber)}</div>
                      </td>
                      <td class="text-xs">${t.warehouseName || '—'}</td>
                      <td class="text-xs">${t.managerName || '—'}</td>
                      <td class="text-xs text-muted truncate" style="max-width:200px">${t.productsSummary || ''}</td>
                      <td class="text-right font-bold">${formatMoney(t.transferAmount || t.totalAmount, "USD")}</td>
                      <td class="text-center"><span class="badge ${t.status === 'COMPLETADA' ? 'badge-accent' : t.status === 'CANCELADA' ? 'badge-danger' : 'badge-warning'}" style="font-size:0.5625rem">${t.status}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`
            }
          </div>
        </div>
      </div>
    `;

    const filterCardSelect = container.querySelector("#filter-card");
    if (filterCardSelect) {
      filterCardSelect.addEventListener("change", (e) => { filterCard = e.target.value; render(); });
    }
    const filterWhSelect = container.querySelector("#filter-warehouse");
    if (filterWhSelect) {
      filterWhSelect.addEventListener("change", (e) => { filterWarehouse = e.target.value; load(); });
    }
  }

  load();
  return () => {};
}
