// =====================================================
// Commissions view — comisiones de gestores con marcar pagado
// =====================================================

import { getStore } from "../store.js";
import { listManagerCommissions, markManagerCommissionPaid } from "../firestore.js";
import { formatMoney, formatPeriod } from "../currency.js";
import { toast, icon } from "../ui.js";

export function mountCommissionsView(container, navigate) {
  const store = getStore();
  const user = store.getState().currentUser;
  const isAdmin = user?.role === "admin";
  const now = new Date();
  let period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let records = [];
  let loading = true;

  async function load() {
    loading = true;
    render();
    const [y, m] = period.split("-").map(Number);
    records = await listManagerCommissions(y, m);
    loading = false;
    render();
  }

  function render() {
    const totalUSD = records.reduce((s, r) => s + r.amountUSD, 0);
    const totalMN = records.reduce((s, r) => s + r.amountMN, 0);
    const paidUSD = records.filter((r) => r.paid).reduce((s, r) => s + r.amountUSD, 0);
    const paidMN = records.filter((r) => r.paid).reduce((s, r) => s + r.amountMN, 0);
    const pendingUSD = totalUSD - paidUSD;
    const pendingMN = totalMN - paidMN;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("wallet", 24)} Comisiones</h1>
            <p class="text-sm text-muted">Comisiones mensuales de gestores · ${formatPeriod(period)}</p>
          </div>
          <div class="flex gap-2 items-center">
            <input class="input" type="month" id="period-input" value="${period}" style="width:10rem" />
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-3">
          <div class="stat-card">
            <div class="stat-label">${icon("wallet", 14)} Total comisiones</div>
            <div class="stat-value">${formatMoney(totalUSD, "USD")}</div>
            <div class="stat-sub">${formatMoney(totalMN, "MN")} · ${records.length} gestores</div>
          </div>
          <div class="stat-card">
            <div class="stat-label" style="color:var(--accent)">${icon("check", 14)} Pagadas</div>
            <div class="stat-value text-accent">${formatMoney(paidUSD, "USD")}</div>
            <div class="stat-sub">${formatMoney(paidMN, "MN")} · ${records.filter((r) => r.paid).length} gestores</div>
          </div>
          <div class="stat-card">
            <div class="stat-label" style="color:var(--warning)">${icon("clock", 14)} Pendientes</div>
            <div class="stat-value text-warning">${formatMoney(pendingUSD, "USD")}</div>
            <div class="stat-sub">${formatMoney(pendingMN, "MN")} · ${records.filter((r) => !r.paid).length} gestores</div>
          </div>
        </div>

        <div class="card">
          <div class="overflow-x-auto">
            ${loading ? `<div class="empty-state"><div class="spinner"></div></div>` :
              records.length === 0 ? `<div class="empty-state">No hay comisiones para este período</div>` :
              `<table class="table">
                <thead><tr><th>Gestor</th><th class="text-center">Ventas</th><th class="text-center">Unidades</th><th class="text-right">Total vendido</th><th class="text-right">Comisión USD</th><th class="text-right">Comisión MN</th><th class="text-center">Estado</th>${isAdmin ? '<th class="text-right">Acción</th>' : ''}</tr></thead>
                <tbody>
                  ${records.map((r) => `
                    <tr>
                      <td class="font-medium">
                        ${r.name}
                        <div class="text-xs text-muted">${r.code} · ${r.phone || ''}</div>
                      </td>
                      <td class="text-center">${r.salesCount}</td>
                      <td class="text-center">${r.totalUnits}</td>
                      <td class="text-right">${formatMoney(r.totalSales, "USD")}</td>
                      <td class="text-right font-bold">${formatMoney(r.amountUSD, "USD")}</td>
                      <td class="text-right font-bold">${formatMoney(r.amountMN, "MN")}</td>
                      <td class="text-center">
                        ${r.paid ? `<span class="badge badge-accent">${icon("check", 12)} Pagada</span>` : `<span class="badge badge-warning">${icon("clock", 12)} Pendiente</span>`}
                      </td>
                      ${isAdmin ? `<td class="text-right">
                        <button class="btn ${r.paid ? 'btn-outline' : 'btn-primary'} btn-sm" data-toggle-paid="${r.managerId}" data-paid="${!r.paid}">
                          ${r.paid ? 'Marcar pendiente' : 'Marcar pagada'}
                        </button>
                      </td>` : ''}
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr style="background:var(--bg-soft);font-weight:700">
                    <td colspan="4">Totales</td>
                    <td class="text-right">${formatMoney(totalUSD, "USD")}</td>
                    <td class="text-right">${formatMoney(totalMN, "MN")}</td>
                    <td colspan="${isAdmin ? '2' : '1'}"></td>
                  </tr>
                </tfoot>
              </table>`
            }
          </div>
        </div>
      </div>
    `;

    const periodInput = container.querySelector("#period-input");
    if (periodInput) {
      periodInput.addEventListener("change", (e) => {
        period = e.target.value;
        load();
      });
    }

    container.querySelectorAll("[data-toggle-paid]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const managerId = btn.dataset.togglePaid;
        const paid = btn.dataset.paid === "true";
        const [y, m] = period.split("-").map(Number);
        try {
          await markManagerCommissionPaid(managerId, y, m, paid, user?.id);
          toast(paid ? "Marcada como pagada" : "Marcada como pendiente", "success");
          records = records.map((r) => r.managerId === managerId ? { ...r, paid, paidAt: paid ? Date.now() : null } : r);
          render();
        } catch (err) {
          toast("Error al actualizar comisión", "error");
        }
      });
    });
  }

  load();
  return () => {};
}
