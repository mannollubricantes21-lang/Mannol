// =====================================================
// Managers view — vista pública de gestores con stats
// =====================================================

import { listManagers, listSales } from "../firestore.js";
import { formatMoney, formatDate } from "../currency.js";
import { icon } from "../ui.js";

export function mountManagersView(container, navigate) {
  let managers = [];
  let expandedManager = null;
  let managerSales = [];
  let loadingSales = false;

  async function load() {
    managers = await listManagers();
    render();
  }

  function render() {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div>
          <h1 class="text-2xl font-bold flex items-center gap-2">${icon("users", 24)} Gestores</h1>
          <p class="text-sm text-muted">Estadísticas acumuladas por gestor</p>
        </div>

        <div style="display:flex;flex-direction:column;gap:0.75rem">
          ${managers.length === 0 ? `<div class="card empty-state">No hay gestores registrados</div>` :
            managers.map((m) => {
              const conversion = m.completadas && m.totalReferidos ? Math.round(m.completadas / m.totalReferidos * 100) : 0;
              const isExpanded = expandedManager === m.id;
              return `
                <div class="card">
                  <div class="card-header flex justify-between">
                    <div class="flex items-center gap-2 min-w-0">
                      <div class="brand-logo" style="background: var(--primary-tint); color: var(--primary); width: 2.5rem; height: 2.5rem">
                        ${icon("users", 16)}
                      </div>
                      <div class="min-w-0">
                        <h3 class="font-semibold">${m.name}</h3>
                        <p class="text-xs text-muted">${m.code} · ${m.phone || m.email || ''}</p>
                      </div>
                    </div>
                    <button class="btn btn-outline btn-sm" data-expand="${m.id}">
                      ${isExpanded ? 'Contraer' : 'Ver ventas'}
                      ${icon(isExpanded ? "chevronUp" : "chevronDown", 12)}
                    </button>
                  </div>
                  <div class="card-content">
                    <div class="grid grid-cols-4 gap-2">
                      <div class="text-center">
                        <div class="text-xs text-muted">Referidos</div>
                        <div class="text-lg font-bold">${m.totalReferidos || 0}</div>
                      </div>
                      <div class="text-center">
                        <div class="text-xs text-muted">Completadas</div>
                        <div class="text-lg font-bold text-accent">${m.completadas || 0}</div>
                      </div>
                      <div class="text-center">
                        <div class="text-xs text-muted">Pendientes</div>
                        <div class="text-lg font-bold text-warning">${m.pendientes || 0}</div>
                      </div>
                      <div class="text-center">
                        <div class="text-xs text-muted">Canceladas</div>
                        <div class="text-lg font-bold text-danger">${m.canceladas || 0}</div>
                      </div>
                    </div>
                    <div class="separator"></div>
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <div class="text-xs text-muted">Tasa conversión</div>
                        <div class="text-lg font-bold">${conversion}%</div>
                      </div>
                      <div>
                        <div class="text-xs text-muted">Monto total vendido</div>
                        <div class="text-lg font-bold">${formatMoney(m.montoTotal || 0, "USD")}</div>
                      </div>
                    </div>
                    <div class="mt-3 p-2 rounded" style="background: var(--primary-tint)">
                      <div class="text-xs text-muted">Comisión estimada (${m.commission}% informativo)</div>
                      <div class="text-xl font-bold" style="color: var(--primary)">${formatMoney(m.comisionEstimada || 0, "USD")}</div>
                    </div>

                    ${isExpanded ? `
                      <div class="separator"></div>
                      <div>
                        <div class="text-xs font-medium mb-2">Ventas del gestor:</div>
                        ${loadingSales ? `<div class="empty-state"><div class="spinner"></div></div>` :
                          managerSales.length === 0 ? `<div class="empty-state text-xs">Sin ventas</div>` :
                          `<div style="display:flex;flex-direction:column;gap:0.5rem;max-height:20rem;overflow-y:auto">
                            ${managerSales.slice(0, 20).map((s) => `
                              <div class="border rounded p-2 text-xs" style="border-color:var(--border)">
                                <div class="flex justify-between">
                                  <span class="font-medium">${s.code}</span>
                                  <span class="badge ${s.status === 'COMPLETADA' ? 'badge-accent' : s.status === 'CANCELADA' ? 'badge-danger' : 'badge-warning'}" style="font-size:0.5625rem">${s.status}</span>
                                </div>
                                <div class="text-muted">${s.warehouseName} · ${formatDate(s.createdAt)}</div>
                                <div class="flex justify-between mt-1">
                                  <span>${s.items.length} items</span>
                                  <span class="font-bold">${formatMoney(s.totalAmount, "USD")}</span>
                                </div>
                              </div>
                            `).join('')}
                          </div>`
                        }
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')
          }
        </div>
      </div>
    `;

    container.querySelectorAll("[data-expand]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.expand;
        if (expandedManager === id) {
          expandedManager = null;
          render();
        } else {
          expandedManager = id;
          loadingSales = true;
          render();
          managerSales = await listSales({ managerId: id });
          loadingSales = false;
          render();
        }
      });
    });
  }

  load();
  return () => {};
}
