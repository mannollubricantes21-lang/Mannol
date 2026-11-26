// =====================================================
// Admin → Configuración → Copia de seguridad (v5.34.0)
// Descarga todo en un Excel (.xlsx): ventas del período, detalle, productos,
// stock, almacenes, gestores y cierres de caja.
// =====================================================
import { listWarehouses, listProducts, listAllStockAcrossWarehouses, listManagers, listSalesInRange, listDailyClosures } from "../db.js";
import { buildBackupSheets } from "../backup.js";
import { downloadXlsx } from "../xlsx-lite.js";
import { toast, icon } from "../ui.js";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function mountBackupPanel(content) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 2, 1); // este mes y los 2 anteriores
  content.innerHTML = `
    <div class="card bk">
      <div class="card-header"><h3 class="card-title">${icon("download", 16)} Copia de seguridad</h3></div>
      <div class="card-content" style="display:flex;flex-direction:column;gap:0.875rem">
        <p class="text-sm" style="margin:0;max-width:60ch">Descarga un Excel con todo: <strong>ventas</strong> (y el detalle de cada una), <strong>productos</strong>, <strong>stock</strong> de cada almacén, <strong>almacenes</strong>, <strong>gestores</strong> y <strong>cierres de caja</strong>. Guárdalo en otro sitio (correo, Drive, memoria) una vez al mes.</p>
        <div class="bk-range">
          <div><label class="label label-xs" for="bk-from">Ventas desde</label><input class="input" type="date" id="bk-from" value="${ymd(start)}" /></div>
          <div><label class="label label-xs" for="bk-to">hasta</label><input class="input" type="date" id="bk-to" value="${ymd(today)}" /></div>
          <button type="button" class="btn btn-secondary btn-sm" id="bk-all">Desde el principio</button>
        </div>
        <div><button type="button" class="btn btn-primary" id="bk-go">${icon("download", 16)} Descargar Excel</button></div>
        <p class="text-xs text-muted" id="bk-status" aria-live="polite" style="margin:0"></p>
      </div>
    </div>`;
  const $ = (s) => content.querySelector(s);
  $("#bk-all").addEventListener("click", () => { $("#bk-from").value = "2024-01-01"; });
  $("#bk-go").addEventListener("click", async () => {
    const f = $("#bk-from").value, t = $("#bk-to").value;
    if (!f || !t || f > t) { toast("Revisa las fechas", "error"); return; }
    const from = new Date(`${f}T00:00:00`).getTime();
    const to = new Date(`${t}T00:00:00`).getTime() + 86400000;
    const btn = $("#bk-go");
    const status = $("#bk-status");
    btn.disabled = true;
    status.textContent = "Reuniendo los datos…";
    try {
      const [warehouses, products, stock, managers, sales, closures] = await Promise.all([
        listWarehouses(), listProducts(), listAllStockAcrossWarehouses(), listManagers(),
        listSalesInRange({ from, to }), listDailyClosures({ limit: 5000 }),
      ]);
      if (sales === null) throw new Error("No se pudieron leer las ventas (¿sin conexión?)");
      const sheets = buildBackupSheets({ warehouses, products, stock, managers, sales, closures, from, to, now: Date.now() });
      downloadXlsx(`mannol-copia-${f}-a-${t}.xlsx`, sheets);
      status.textContent = `Listo: ${sales.length} ventas, ${products.length} productos, ${(stock || []).length} filas de stock.`;
      toast("Copia descargada", "success");
    } catch (err) {
      status.textContent = "";
      toast("No se pudo hacer la copia: " + (err?.message || "error"), "error", 7000);
    } finally {
      btn.disabled = false;
    }
  });
}
