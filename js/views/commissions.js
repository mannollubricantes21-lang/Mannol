// =====================================================
// Commissions view — comisiones de gestores con marcar pagado
// =====================================================

import { getStore } from "../store.js";
import { listManagerCommissions, markManagerCommissionPaid } from "../db.js";
import { formatMoney, formatPeriod, formatDate, skeletonStatCard, skeletonRow } from "../currency.js";
import { toast, icon, esc } from "../ui.js";
import { exportToCSV } from "../csv-export.js";

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
            <input class="input" type="month" id="period-input" value="${period}" style="width:10rem" aria-label="Seleccionar mes" />
            <button class="btn btn-outline btn-sm" id="export-csv-btn" title="Exportar comisiones a CSV" aria-label="Exportar a CSV">${icon("download", 14)} CSV</button>
          </div>
        </div>

        ${loading ? `<div class="grid md:grid-cols-3 gap-3">${skeletonStatCard(3)}</div>` : `
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
        `}

        <div class="card">
          <div class="overflow-x-auto">
            ${loading ? `<table class="table"><thead><tr><th>Gestor</th><th class="text-center">Ventas</th><th class="text-right">Comisión USD</th><th class="text-center">Estado</th></tr></thead><tbody>${skeletonRow(4, 4)}</tbody></table>` :
              records.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">${icon("wallet", 24)}</div><p class="empty-state-title">Sin comisiones</p><p class="empty-state-desc">No hay comisiones para este período.</p></div>` :
              `<table class="table">
                <thead><tr><th>Gestor</th><th>Tipo</th><th class="text-center">Ventas</th><th class="text-center">Unidades</th><th class="text-right">Total vendido</th><th class="text-right">Comisión</th><th class="text-center">Estado</th>${isAdmin ? '<th class="text-right">Acción</th>' : ''}</tr></thead>
                <tbody>
                  ${records.map((r) => {
                    const typeLabel = r.managerType === "LOCAL" ? `Local · ${esc(r.warehouseName || '—')}` : "Referidor";
                    const commTypeLabel = (r.commissionType || "PERCENT") === "PERCENT"
                      ? `${r.commission}% del total`
                      : `${formatMoney(r.commission, r.commissionCurrency || "USD")} por venta`;
                    const commissionAmountLabel = r.commissionCurrency === "MN"
                      ? formatMoney(r.amountMN, "MN") + " (MN)"
                      : formatMoney(r.amountUSD, "USD") + " (USD)";
                    return `
                    <tr>
                      <td class="font-medium">
                        ${esc(r.name)}
                        <div class="text-xs text-muted">${esc(r.code)} · ${esc(r.phone || '')}</div>
                      </td>
                      <td class="text-xs">
                        <div>${typeLabel}</div>
                        <div class="text-muted">${commTypeLabel}</div>
                      </td>
                      <td class="text-center">${r.salesCount}</td>
                      <td class="text-center">${r.totalUnits}</td>
                      <td class="text-right">${formatMoney(r.totalSales, "USD")}</td>
                      <td class="text-right font-bold">${commissionAmountLabel}</td>
                      <td class="text-center">
                        ${r.paid ? `<span class="badge badge-accent">${icon("check", 12)} Pagada</span>` : `<span class="badge badge-warning">${icon("clock", 12)} Pendiente</span>`}
                      </td>
                      ${isAdmin ? `<td class="text-right">
                        <button class="btn ${r.paid ? 'btn-outline' : 'btn-primary'} btn-sm" data-toggle-paid="${esc(r.managerId)}" data-paid="${!r.paid}">
                          ${r.paid ? 'Marcar pendiente' : 'Marcar pagada'}
                        </button>
                      </td>` : ''}
                    </tr>
                  `}).join('')}
                </tbody>
                <tfoot>
                  <tr style="background:var(--bg-soft);font-weight:700">
                    <td colspan="5">Totales</td>
                    <td class="text-right">
                      ${formatMoney(totalUSD, "USD")} + ${formatMoney(totalMN, "MN")}
                    </td>
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

    const exportBtn = container.querySelector("#export-csv-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const [y, m] = period.split("-").map(Number);
        const rows = records.map((r) => ({
          gestor: r.name,
          codigo: r.code,
          telefono: r.phone || '',
          tipo: r.managerType === "LOCAL" ? "Local" : "Referidor",
          almacen: r.warehouseName || '',
          tipo_comision: (r.commissionType || "PERCENT") === "PERCENT" ? "Porcentaje" : "Fijo",
          comision_valor: r.commission,
          moneda_comision: r.commissionCurrency || "USD",
          ventas: r.salesCount,
          unidades: r.totalUnits,
          total_vendido_usd: r.totalSales,
          comision_usd: r.amountUSD,
          comision_mn: r.amountMN,
          estado: r.paid ? 'Pagada' : 'Pendiente',
          pagada_en: r.paidAt ? formatDate(r.paidAt) : '',
        }));
        exportToCSV(`comisiones-${y}-${String(m).padStart(2, '0')}`, rows);
        toast(`${rows.length} comisiones exportadas`, "success");
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
