// =====================================================
// Warehouse Interior view — layout exacto del screenshot
// KPIs en tarjetas oscuras + detalle por moneda + FAB
// =====================================================

import { getStore } from "../store.js";
import { subscribeSales, subscribeStock, listProducts, listWarehouses, listAllStockAcrossWarehouses, listStockForProductInAllWarehouses, createTransferRequest, listTransferRequests, saveDailyClosure, listDailyClosures } from "../db.js";
import { computeClosureStats, closureDateKey, validateTransferRequest, buildClosureShareText } from "../sales-stats.js";
import { formatMoney, formatDate } from "../currency.js";
import { icon, esc, toast, showModal, closeModal, confirmDialog, copyText, openWhatsApp } from "../ui.js";

export function mountWarehouseInterior(container, navigate) {
  const store = getStore();
  const warehouse = store.getState().currentWarehouse;
  let sales = [];
  let stock = [];
  let products = [];
  let period = "today";
  let search = "";
  let stockFilter = "all"; // v5.4.0: "all" | "low" | "out" (badges clicables)
  // v5.5.0: solicitudes de traspaso + cierre de caja
  let myRequests = [];
  let recentClosures = [];
  let closuresOpen = false;
  let inventoryTab = "stock"; // "stock" | "others"  (sin "transfers" — solo admin transfiere)
  let otherWarehousesStock = []; // stock en otros almacenes
  let othersState = "idle"; // "idle" | "loading" | "ready" | "error"
  let allWarehouses = []; // lista de almacenes

  if (!warehouse) {
    container.innerHTML = `<div class="empty-state">Selecciona un almacén</div>`;
    return () => {};
  }

  listProducts().then((p) => { products = p; render(); }).catch(() => {});
  listWarehouses().then((ws) => {
    allWarehouses = ws.filter((w) => w.id !== warehouse.id && w.active !== false);
    render();
  }).catch(() => {});

  const unsubSales = subscribeSales((items) => {
    sales = items.filter((s) => s.warehouseId === warehouse.id);
    render();
  }, { warehouseId: warehouse.id });
  const unsubStock = subscribeStock(warehouse.id, (items) => { stock = items; render(); });

  // v5.5.0: solicitudes propias + cierres recientes
  listTransferRequests({ toWarehouseId: warehouse.id, limit: 5 }).then((r) => { myRequests = r; render(); }).catch(() => {});
  listDailyClosures({ warehouseId: warehouse.id, limit: 7 }).then((c) => { recentClosures = c; render(); }).catch(() => {});

  // Cargar stock de otros almacenes (para el tab "Otros almacenes")
  async function loadOtherStock() {
    othersState = "loading";
    render();
    try {
      const allStock = await listAllStockAcrossWarehouses();
      otherWarehousesStock = allStock.filter((s) => s.warehouseId !== warehouse.id);
      othersState = "ready";
    } catch (err) {
      console.error("loadOtherStock failed:", err);
      otherWarehousesStock = [];
      othersState = "error";
    }
    render();
  }

  // v5.5.0: diálogo para solicitar traspaso desde otro almacén
  function showRequestDialog(product) {
    const available = otherWarehousesStock
      .filter((s) => s.productId === product.id && (s.quantity || 0) > 0)
      .sort((a, b) => b.quantity - a.quantity);
    if (available.length === 0) {
      toast("No hay stock disponible en otros almacenes", "warning");
      return;
    }
    const whMap = new Map(allWarehouses.map((w) => [w.id, w]));
    const user = store.getState().currentUser;
    const close = showModal({
      title: `Solicitar traspaso · ${product.name}`,
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div>
            <label class="label label-xs">Desde qué almacén *</label>
            <select class="select" id="tr-from">
              ${available.map((s) => `<option value="${esc(s.warehouseId)}">${esc(s.warehouseName || whMap.get(s.warehouseId)?.name || s.warehouseId)} — ${s.quantity} disponibles</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="label label-xs">Cantidad (unidades) *</label>
            <input class="input" type="number" min="1" id="tr-qty" value="5" inputmode="numeric" />
          </div>
          <div>
            <label class="label label-xs">Nota (opcional)</label>
            <input class="input" id="tr-note" placeholder="Ej: para el fin de semana" />
          </div>
          <p class="text-xs text-muted" style="margin:0">Quedará como <strong>PENDIENTE</strong> hasta que el administrador la apruebe y mueva el stock.</p>
        </div>
      `,
      footer: `
        <button class="btn btn-ghost" id="tr-cancel">Cancelar</button>
        <button class="btn btn-primary" id="tr-submit">${icon("arrowLeftRight", 14)} Enviar solicitud</button>
      `,
    });
    document.querySelector("#tr-cancel").addEventListener("click", close);
    document.querySelector("#tr-submit").addEventListener("click", async () => {
      const fromId = document.querySelector("#tr-from")?.value;
      const qty = parseInt(document.querySelector("#tr-qty")?.value, 10);
      const note = document.querySelector("#tr-note")?.value?.trim() || null;
      const src = available.find((s) => s.warehouseId === fromId);
      const check = validateTransferRequest({
        fromWarehouseId: fromId,
        toWarehouseId: warehouse.id,
        productId: product.id,
        quantity: qty,
      });
      if (!check.ok) { toast(check.error, "warning"); return; }
      if (src && qty > src.quantity) {
        toast(`Solo hay ${src.quantity} disponibles en ${src.warehouseName || "ese almacén"}`, "warning");
        return;
      }
      try {
        const res = await createTransferRequest({
          fromWarehouseId: fromId,
          toWarehouseId: warehouse.id,
          productId: product.id,
          productName: product.name,
          quantity: qty,
          note,
        }, user);
        toast(`Solicitud ${res.code || ""} enviada al administrador`, "success");
        close();
        listTransferRequests({ toWarehouseId: warehouse.id, limit: 5 }).then((r) => { myRequests = r; render(); }).catch(() => {});
      } catch (err) {
        toast("No se pudo enviar: " + (err.message || "desconocido"), "error");
      }
    });
  }

  function getPeriodSales() {
    const now = new Date();
    let from;
    if (period === "today") from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    else if (period === "week") from = now.getTime() - 7 * 86400000;
    else from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return sales.filter((s) => s.createdAt >= from && s.status === "COMPLETADA");
  }

  function calculateStats(salesList) {
    const stats = {
      count: salesList.length,
      byCurrency: { USD: { count: 0, amount: 0 }, MN: { count: 0, amount: 0 }, EUR: { count: 0, amount: 0 }, TRANSFERENCIA: { count: 0, amount: 0 } },
      unitsSold: 0,
      totalUSD: 0,
    };
    for (const s of salesList) {
      if (s.paymentMode === "MULTI") {
        if (s.paidUSD > 0) { stats.byCurrency.USD.count++; stats.byCurrency.USD.amount += s.paidUSD; }
        if (s.paidMN > 0) { stats.byCurrency.MN.count++; stats.byCurrency.MN.amount += s.paidMN; }
        if (s.paidEUR > 0) { stats.byCurrency.EUR.count++; stats.byCurrency.EUR.amount += s.paidEUR; }
        if (s.paidTransfer > 0) { stats.byCurrency.TRANSFERENCIA.count++; stats.byCurrency.TRANSFERENCIA.amount += s.paidTransfer; }
        stats.totalUSD += s.totalAmount;
      } else {
        const curr = s.currency || "USD";
        if (stats.byCurrency[curr]) { stats.byCurrency[curr].count++; stats.byCurrency[curr].amount += s.totalAmount; }
        stats.totalUSD += s.totalAmount;
      }
      for (const item of s.items) stats.unitsSold += item.quantity;
    }
    return stats;
  }

  function render() {
    const periodSales = getPeriodSales();
    const stats = calculateStats(periodSales);
    const stockMap = {};
    stock.forEach((s) => (stockMap[s.productId] = s));
    const user = store.getState().currentUser;
    const isAdmin = user?.role === "admin";
    const filteredProducts = products.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.brand || "").toLowerCase().includes(q) && !(p.sku || "").toLowerCase().includes(q)) return false;
      }
      // v5.4.0: filtro por estado de stock (badges "bajo" / "agotado")
      if (stockFilter === "low" || stockFilter === "out") {
        const qty = stockMap[p.id]?.quantity ?? 0;
        const min = stockMap[p.id]?.minStock || p.minStock || 5;
        if (stockFilter === "low" && !(qty > 0 && qty <= min)) return false;
        if (stockFilter === "out" && qty !== 0) return false;
      }
      return true;
    });
    const lowStock = stock.filter((s) => s.quantity <= (s.minStock || 5) && s.quantity > 0).length;
    const outOfStock = stock.filter((s) => s.quantity === 0).length;

    // v5.4.0 → v5.7.0: monedas con movimiento como chips de color
    const CURR_COLOR = {
      USD: "var(--accent-usd)", MN: "var(--accent-mn)", EUR: "var(--accent-eur)", TRANSFERENCIA: "var(--accent-transfer)",
    };
    const CURR_FMT = { USD: "USD", MN: "MN", EUR: "EUR", TRANSFERENCIA: "USD" };
    const CURR_LABEL = { USD: "USD", MN: "MN", EUR: "EUR", TRANSFERENCIA: "Transf." };
    const activeCurrs = ["USD", "MN", "EUR", "TRANSFERENCIA"].filter((c) => stats.byCurrency[c].count > 0 || stats.byCurrency[c].amount > 0);
    const zeroCurrs = ["USD", "MN", "EUR", "TRANSFERENCIA"].filter((c) => !(stats.byCurrency[c].count > 0 || stats.byCurrency[c].amount > 0));

    // v5.5.0: cierre de caja — siempre del DÍA, independiente del período elegido
    const nowDate = new Date();
    const todayFrom = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
    const todayStats = computeClosureStats(sales, { fromMs: todayFrom, toMs: todayFrom + 86400000 });
    const todayKey = closureDateKey(Date.now());
    const todayClosed = recentClosures.find((c) => c.closureDate === todayKey);

    container.innerHTML = `
      <div class="wi-layout" style="display:flex;flex-direction:column;gap:0.875rem">
        <!-- Hero del almacén (v5.7.0) -->
        <div class="wh-hero wi-hero">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem">
            <div style="display:flex;align-items:center;gap:0.5rem;min-width:0">
              <span class="wh-chip">${icon("store", 11)} ${esc(warehouse.code)}</span>
              <h2 class="text-lg font-bold" style="margin:0">${esc(warehouse.name)}</h2>
            </div>
            <button class="btn btn-ghost btn-sm" data-nav-back style="flex-shrink:0">${icon("arrowLeft", 14)} Volver</button>
          </div>
          ${warehouse.address || warehouse.phone ? `
            <div class="wh-meta">
              ${warehouse.address ? `<span>${icon("mapPin", 11)} ${esc(warehouse.address)}</span>` : ''}
              ${warehouse.phone ? `<span>${icon("phone", 11)} ${esc(warehouse.phone)}</span>` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Resumen con período integrado (v5.7.0) -->
        <div class="card wi-resumen">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;padding:0.625rem 0.75rem">
            <h3 class="card-title flex items-center gap-1">${icon("activity", 14)} Resumen</h3>
            <div class="seg-group">
              ${[["today", "Hoy"], ["week", "Semana"], ["month", "Mes"]].map(([p, lbl]) => `
                <button class="seg ${period === p ? 'seg-on' : ''}" data-period="${p}">${lbl}</button>
              `).join("")}
            </div>
          </div>
          <div class="card-content" style="padding:0.625rem 0.75rem 0.75rem">
            <div class="kpi-grid">
              <div class="kpi-cell">
                <span class="kpi-label">Ventas</span>
                <span class="kpi-value">${stats.count}</span>
              </div>
              <div class="kpi-cell">
                <span class="kpi-label">Total (USD)</span>
                <span class="kpi-value" style="color:var(--accent-usd)">${formatMoney(stats.totalUSD, "USD")}</span>
              </div>
              <div class="kpi-cell">
                <span class="kpi-label">Unidades</span>
                <span class="kpi-value">${stats.unitsSold}</span>
              </div>
              <div class="kpi-cell">
                <span class="kpi-label">Ticket prom.</span>
                <span class="kpi-value">${formatMoney(stats.count > 0 ? stats.totalUSD / stats.count : 0, "USD")}</span>
              </div>
            </div>

            ${activeCurrs.length > 0 ? `
              <div style="display:flex;flex-wrap:wrap;gap:0.375rem;margin-top:0.5625rem">
                ${activeCurrs.map((c) => `
                  <span class="curr-chip">
                    <span class="curr-dot" style="background:${CURR_COLOR[c]}"></span>
                    <strong class="text-xs" style="color:${CURR_COLOR[c]}">${CURR_LABEL[c]}</strong>
                    <strong class="text-xs">${formatMoney(stats.byCurrency[c].amount, CURR_FMT[c])}</strong>
                    <span class="text-muted" style="font-size:0.625rem">· ${stats.byCurrency[c].count}</span>
                  </span>
                `).join("")}
              </div>
            ` : ''}
            ${zeroCurrs.length > 0 ? `
              <div class="text-xs text-muted" style="margin-top:0.4375rem">
                Sin movimiento: ${zeroCurrs.map((c) => CURR_LABEL[c]).join(" · ")}
              </div>
            ` : ''}

            ${stats.count === 0 ? `
              <div class="empty-state text-xs" style="padding:0.875rem 0 0.25rem">
                <div class="empty-state-icon">${icon("cart", 20)}</div>
                <p style="margin:0.25rem 0 0">Sin ventas en este período.</p>
                <p class="text-muted" style="font-size:0.6875rem;margin:0.125rem 0 0">Toca <strong>Registrar venta</strong> para empezar el día.</p>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Botón registrar venta (v5.7.0) -->
        <button class="btn cta-sale btn-block wi-cta" id="register-sale-btn">
          ${icon("cart", 20)} Registrar venta
        </button>

        <!-- Cierre de caja (v5.5.0) -->
        <div class="card wi-cierre">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3 class="card-title flex items-center gap-1">${icon("receipt", 14)} Cierre de caja</h3>
            ${todayClosed
              ? `<span class="badge badge-accent" style="font-size:0.625rem">Cerrado · ${esc(todayClosed.createdByName || '')}</span>`
              : `<span class="badge ${todayStats.salesCount > 0 ? 'badge-warning' : ''}" style="font-size:0.625rem">${todayStats.salesCount > 0 ? 'Pendiente de cerrar' : 'Sin ventas hoy'}</span>`}
          </div>
          <div class="card-content" style="padding:0.625rem 0.75rem">
            <div class="stat-row">
              <div class="stat-cell">
                <div class="text-lg font-bold">${todayStats.salesCount}</div>
                <div class="text-xs text-muted">Ventas hoy</div>
              </div>
              <div class="stat-cell">
                <div class="text-lg font-bold" style="color:var(--accent-usd)">${formatMoney(todayStats.totalUSD, "USD")}</div>
                <div class="text-xs text-muted">Total (USD)</div>
              </div>
              <div class="stat-cell">
                <div class="text-lg font-bold">${todayStats.unitsSold}</div>
                <div class="text-xs text-muted">Unidades</div>
              </div>
            </div>
            ${Object.entries(todayStats.byCurrency).filter(([_, v]) => v.count > 0).map(([curr, d]) => `
              <div style="display:flex;justify-content:space-between;padding:0.25rem 0.5rem;margin-top:0.375rem;background:var(--bg-soft);border-radius:var(--radius-sm);border:1px solid var(--border)" class="text-xs">
                <span class="text-muted">${esc(curr)} · ${d.count} venta(s)</span>
                <strong>${formatMoney(d.amount, curr)}</strong>
              </div>
            `).join("")}
            <button class="btn ${!todayClosed && todayStats.salesCount > 0 ? 'btn-primary' : 'btn-outline'} btn-sm btn-block" id="close-cash-btn" style="margin-top:0.5rem">
              ${icon("check", 14)} ${todayClosed ? 'Actualizar cierre de hoy' : 'Cerrar caja de hoy'}
            </button>
            ${todayStats.salesCount > 0 || todayClosed ? `
              <!-- v5.10.0: enviar el resumen del día por WhatsApp -->
              <div class="closure-share">
                <button class="btn btn-whatsapp btn-sm" id="share-closure-wa">${icon("whatsapp", 16)} Enviar por WhatsApp</button>
                <button class="btn btn-outline btn-sm" id="share-closure-copy" aria-label="Copiar el resumen del cierre" title="Copiar el resumen">${icon("copy", 14)} Copiar</button>
              </div>
            ` : ''}
            ${recentClosures.length > 0 ? `
              <button class="btn btn-ghost btn-sm btn-block" data-toggle-closures>
                Últimos cierres (${recentClosures.length}) ${closuresOpen ? '▲' : '▼'}
              </button>
              ${closuresOpen ? `
                <div style="display:flex;flex-direction:column;gap:0.25rem">
                  ${recentClosures.map((c) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius-sm)">
                      <div>
                        <div class="text-xs font-medium">${esc(c.closureDate)}${c.closureDate === todayKey ? ' · hoy' : ''}</div>
                        <div class="text-xs text-muted">${c.salesCount} ventas · ${c.unitsSold} u · por ${esc(c.createdByName || '—')}</div>
                      </div>
                      <strong class="text-sm" style="color:var(--accent-usd)">${formatMoney(c.totalUSD, "USD")}</strong>
                    </div>
                  `).join("")}
                </div>
              ` : ''}
            ` : ''}
          </div>
        </div>

        <!-- Inventario con tabs: Stock / Otros almacenes / Transferencias -->
        <div class="card wi-inv">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
            <h3 class="card-title flex items-center gap-1">${icon("boxes", 14)} Inventario</h3>
            <div style="display:flex;gap:0.25rem">
              ${lowStock > 0 ? `<button class="badge badge-warning" data-stock-filter="low" style="font-size:0.5625rem;cursor:pointer;border:none;font-weight:700" title="Ver solo productos con stock bajo">${lowStock} bajo${stockFilter === 'low' ? ' ✕' : ''}</button>` : ''}
              ${outOfStock > 0 ? `<button class="badge badge-danger" data-stock-filter="out" style="font-size:0.5625rem;cursor:pointer;border:none;font-weight:700" title="Ver solo productos agotados">${outOfStock} agotado${stockFilter === 'out' ? ' ✕' : ''}</button>` : ''}
            </div>
          </div>

          <!-- Tabs -->
          <div style="display:flex;gap:0.25rem;padding:0 0.5rem 0.5rem">
            <button class="btn ${inventoryTab === 'stock' ? 'btn-primary' : 'btn-outline'} btn-sm" data-inv-tab="stock" style="flex:1;font-size:0.75rem">${icon("boxes", 12)} Stock</button>
            <button class="btn ${inventoryTab === 'others' ? 'btn-primary' : 'btn-outline'} btn-sm" data-inv-tab="others" style="flex:1;font-size:0.75rem">${icon("mapPin", 12)} Otros almacenes</button>
          </div>

          <div class="card-content" style="padding:0.5rem">
            ${inventoryTab === 'stock' ? `
              <!-- Tab: Stock de este almacén -->
              <div style="position:relative;margin-bottom:0.5rem">
                <span style="position:absolute;left:0.625rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 14)}</span>
                <input class="input" id="stock-search" placeholder="Buscar..." value="${search}" style="padding-left:2rem;font-size:0.8125rem;height:2.25rem" />
              </div>
              <div style="max-height:22rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.25rem">
                ${filteredProducts.map((p) => {
                  const s = stockMap[p.id];
                  const qty = s?.quantity ?? 0;
                  const min = s?.minStock || p.minStock || 5;
                  const isLow = qty > 0 && qty <= min;
                  const isOut = qty === 0;
                  // v5.7.0: marca solo si NO es MANNOL (evita ruido repetido) + precio para admin + mínimo de referencia
                  const brandTxt = (p.brand && p.brand !== "MANNOL") ? esc(p.brand) + ' · ' : '';
                  const adminPrice = isAdmin && (s?.localPrice || p.salePrice) ? formatMoney(s?.localPrice || p.salePrice, "USD") + ' · ' : '';
                  return `
                    <div class="stock-row ${isOut ? 'out' : isLow ? 'low' : ''}">
                      <div style="flex:1;min-width:0">
                        <div class="text-xs font-semibold truncate" ${isOut ? 'style="color:var(--text-muted)"' : ''}>${esc(p.name)}</div>
                        <div class="text-xs text-muted truncate">${brandTxt}${adminPrice}<span style="opacity:0.8">mín ${min}</span></div>
                      </div>
                      <span class="qty-pill ${isOut ? 'out' : isLow ? 'low' : ''}">${qty}</span>
                      ${isOut ? '<span class="badge badge-danger" style="font-size:0.5rem;flex-shrink:0">Agotado</span>' : isLow ? '<span class="badge badge-warning" style="font-size:0.5rem;flex-shrink:0">Bajo</span>' : ''}
                      <button class="btn btn-ghost btn-sm" data-view-others="${esc(p.id)}" title="Ver en otros almacenes" style="padding:0.25rem 0.5rem">${icon("mapPin", 12)}</button>
                    </div>
                  `;
                }).join("")}
                ${filteredProducts.length === 0 ? `
                  <div class="empty-state text-xs">
                    <div class="empty-state-icon">${icon("boxes", 20)}</div>
                    ${search || stockFilter !== "all"
                      ? `<p style="margin:0.25rem 0 0.5rem">Sin resultados para los filtros aplicados.</p><button class="btn btn-outline btn-sm" data-clear-stock-filters style="margin:0 auto">Limpiar filtros</button>`
                      : `<p style="margin:0.25rem 0 0.5rem">No hay productos en este almacén todavía.</p><p class="text-muted" style="font-size:0.6875rem">El administrador puede crearlos y cargarles stock.</p>`}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            ${inventoryTab === 'others' ? `
              <!-- Tab: Disponibilidad en otros almacenes -->
              <div style="margin-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem">
                <span style="position:relative;flex:1">
                  <span style="position:absolute;left:0.625rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 14)}</span>
                  <input class="input" id="others-search" placeholder="Buscar producto en otros almacenes..." style="padding-left:2rem;font-size:0.8125rem;height:2.25rem;width:100%" />
                </span>
              </div>
              ${otherWarehousesStock.length === 0 ? (() => {
                if (othersState === "loading") {
                  return `
                    <div class="empty-state text-xs">
                      <div class="spinner spinner-lg"></div>
                      Cargando stock de otros almacenes...
                    </div>
                  `;
                }
                if (othersState === "error") {
                  return `
                    <div class="empty-state text-xs">
                      <div class="empty-state-icon">${icon("alertTriangle", 24)}</div>
                      No se pudo cargar el stock de otros almacenes.
                      <button class="btn btn-outline btn-sm" data-others-retry style="margin:0.5rem auto 0">Reintentar</button>
                    </div>
                  `;
                }
                return `
                  <div class="empty-state text-xs">
                    <div class="empty-state-icon">${icon("mapPin", 24)}</div>
                    <div class="font-medium" style="margin-bottom:0.25rem">Sin stock visible en otros almacenes</div>
                    <div class="text-muted" style="font-size:0.6875rem;line-height:1.4">O no hay mercancía fuera de este local, o tu usuario no tiene acceso a esos almacenes (permisos por almacén). Contacta al administrador si te falta stock.</div>
                    <button class="btn btn-outline btn-sm" data-others-retry style="margin:0.5rem auto 0">Reintentar</button>
                  </div>
                `;
              })() : (() => {
                // Agrupar por producto
                const byProduct = new Map();
                otherWarehousesStock.forEach((s) => {
                  if (!byProduct.has(s.productId)) byProduct.set(s.productId, []);
                  byProduct.get(s.productId).push(s);
                });
                const productMap = new Map(products.map((p) => [p.id, p]));
                const rows = Array.from(byProduct.entries())
                  .map(([productId, items]) => {
                    const product = productMap.get(productId);
                    if (!product) return null;
                    const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
                    return { product, items, totalQty };
                  })
                  .filter(Boolean)
                  .sort((a, b) => b.totalQty - a.totalQty);
                return `
                  <div style="max-height:20rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.5rem">
                    ${rows.map(({ product, items, totalQty }) => `
                      <div style="padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius)">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
                          <div style="flex:1;min-width:0">
                            <div class="text-xs font-medium truncate">${esc(product.name)}</div>
                            <div class="text-xs text-muted">${esc(product.brand)} · Total otros: <strong>${totalQty}</strong></div>
                          </div>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:0.25rem">
                          ${items.sort((a, b) => b.quantity - a.quantity).map((i) => `
                            <span class="badge ${i.quantity > 0 ? 'badge-accent' : 'badge-outline'}" style="font-size:0.625rem">
                              ${esc(i.warehouseCode || i.warehouseName)}: <strong>${i.quantity}</strong>
                            </span>
                          `).join('')}
                        </div>
                        <div style="margin-top:0.375rem">
                          <button class="btn btn-outline btn-sm" data-request-product="${esc(product.id)}" ${totalQty <= 0 ? 'disabled title="Sin stock en otros almacenes"' : ''} style="font-size:0.75rem">
                            ${icon("arrowLeftRight", 12)} Solicitar traspaso
                          </button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `;
              })()}
            ` : ''}
          </div>

          <!-- Mis solicitudes de traspaso (v5.5.0) -->
          ${myRequests.length > 0 ? `
            <div style="border-top:1px solid var(--border);padding:0.5rem 0.75rem 0.75rem">
              <div class="text-xs font-semibold text-muted" style="margin-bottom:0.375rem">Mis solicitudes de traspaso</div>
              <div style="display:flex;flex-direction:column;gap:0.25rem">
                ${myRequests.slice(0, 5).map((r) => `
                  <div class="tile" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.375rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius-sm)">
                    <div style="min-width:0">
                      <div class="text-xs font-medium truncate">${esc(r.productName || '—')} · <strong>${r.quantity}</strong> u</div>
                      <div class="text-xs text-muted">Desde ${esc(r.fromWarehouseName || r.fromWarehouseId || '—')} · ${formatDate(r.createdAt)}</div>
                    </div>
                    <span class="badge ${r.status === 'PENDIENTE' ? 'badge-warning' : r.status === 'APROBADA' ? 'badge-accent' : 'badge-danger'}" style="font-size:0.5625rem">${esc(r.status)}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Ventas recientes -->
        ${periodSales.length > 0 ? `
          <div class="card wi-recientes">
            <div class="card-header"><h3 class="card-title">Ventas recientes</h3></div>
            <div class="card-content" style="padding:0.5rem">
              <div style="max-height:14rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.25rem">
                ${periodSales.slice(0, 10).map((s) => `
                  <div class="tile" style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius);border-left:3px solid ${CURR_COLOR[s.currency] || 'var(--accent)'}">
                    <div>
                      <div class="text-xs font-medium">${esc(s.code)} · ${esc(s.managerName || s.userName || '—')}</div>
                      <div class="text-xs text-muted">${s.items.length} items · ${formatDate(s.createdAt)}</div>
                    </div>
                    <div style="text-align:right">
                      <div class="text-sm font-bold">${formatMoney(s.totalAmount, "USD")}</div>
                      <span class="badge ${s.currency === 'TRANSFERENCIA' ? 'badge-warning' : 'badge-accent'}" style="font-size:0.5rem">${esc(s.currency || 'USD')}</span>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    container.querySelectorAll("[data-period]").forEach((btn) => {
      btn.addEventListener("click", () => { period = btn.dataset.period; render(); });
    });

    // Tabs del inventario (Stock / Otros almacenes — solo 2 tabs, transferencias solo en admin)
    container.querySelectorAll("[data-inv-tab]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        inventoryTab = btn.dataset.invTab;
        render(); // pinta el tab ya (con su estado de carga)
        if (inventoryTab === "others" && otherWarehousesStock.length === 0 && othersState !== "loading") {
          await loadOtherStock();
        }
      });
    });

    // v5.4.0: filtro por estado de stock (badges clicables) + limpiar filtros
    container.querySelectorAll("[data-stock-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        stockFilter = stockFilter === btn.dataset.stockFilter ? "all" : btn.dataset.stockFilter;
        render();
      });
    });
    const clearFiltersBtn = container.querySelector("[data-clear-stock-filters]");
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener("click", () => {
        search = "";
        stockFilter = "all";
        render();
      });
    }

    // v5.5.0: solicitar traspaso a otro almacén
    container.querySelectorAll("[data-request-product]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = products.find((x) => x.id === btn.dataset.requestProduct);
        if (p) showRequestDialog(p);
      });
    });

    // v5.5.0: cierre de caja
    const closeCashBtn = container.querySelector("#close-cash-btn");
    if (closeCashBtn) {
      closeCashBtn.addEventListener("click", () => {
        const user = store.getState().currentUser;
        confirmDialog(
          todayClosed
            ? "Ya hay un cierre de hoy. ¿Actualizarlo con las ventas actuales?"
            : `¿Cerrar la caja de hoy? ${todayStats.salesCount} venta(s) · ${formatMoney(todayStats.totalUSD, "USD")}`,
          async () => {
            try {
              const res = await saveDailyClosure({
                warehouseId: warehouse.id,
                warehouseCode: warehouse.code,
                warehouseName: warehouse.name,
                dateKey: todayKey,
                stats: todayStats,
                user,
              });
              toast(res.updated ? "Cierre de hoy actualizado" : "Cierre de caja guardado", "success");
              listDailyClosures({ warehouseId: warehouse.id, limit: 7 }).then((c) => { recentClosures = c; closuresOpen = true; render(); }).catch(() => {});
            } catch (err) {
              toast("Error al guardar el cierre: " + (err.message || "desconocido"), "error");
            }
          }
        );
      });
    }
    // v5.10.0: compartir el cierre del día (WhatsApp o portapapeles)
    const closureText = () => buildClosureShareText({
      warehouseName: warehouse.name,
      warehouseCode: warehouse.code,
      dateMs: Date.now(),
      stats: todayStats,
      closedBy: todayClosed ? (todayClosed.createdByName || "—") : null,
      fmt: formatMoney,
    });
    container.querySelector("#share-closure-wa")?.addEventListener("click", () => openWhatsApp(closureText()));
    container.querySelector("#share-closure-copy")?.addEventListener("click", async () => {
      const ok = await copyText(closureText());
      toast(ok ? "Resumen del cierre copiado" : "No se pudo copiar el resumen", ok ? "success" : "warning");
    });

    const toggleClosuresBtn = container.querySelector("[data-toggle-closures]");
    if (toggleClosuresBtn) {
      toggleClosuresBtn.addEventListener("click", () => { closuresOpen = !closuresOpen; render(); });
    }

    // Botón "Ver en otros almacenes" (en cada producto del tab Stock)
    container.querySelectorAll("[data-view-others]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const productId = btn.dataset.viewOthers;
        const product = products.find((p) => p.id === productId);
        if (!product) return;
        // Cambiar al tab "otros" y mostrar el modal con detalle
        inventoryTab = "others";
        render();
        if (otherWarehousesStock.length === 0 && othersState !== "loading") {
          await loadOtherStock();
        }
        showProductAvailabilityModal(product);
      });
    });

    // Búsqueda en tab "otros"
    const othersSearch = container.querySelector("#others-search");
    if (othersSearch) {
      othersSearch.addEventListener("input", () => {
        const term = othersSearch.value.toLowerCase().trim();
        render();
        const newInput = container.querySelector("#others-search");
        if (newInput) { newInput.focus(); newInput.setSelectionRange(term.length, term.length); }
      });
    }

    // Reintentar carga de otros almacenes
    container.querySelectorAll("[data-others-retry]").forEach((btn) => {
      btn.addEventListener("click", () => loadOtherStock());
    });

    const registerBtn = container.querySelector("#register-sale-btn");
    if (registerBtn) {
      registerBtn.addEventListener("click", () => {
        const url = new URL(window.location.href);
        url.searchParams.set("view", "dashboard");
        url.searchParams.set("tab", "sales");
        window.location.href = url.toString();
      });
    }

    const backBtn = container.querySelector("[data-nav-back]");
    if (backBtn) backBtn.addEventListener("click", () => navigate("home"));

    const searchInput = container.querySelector("#stock-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        search = e.target.value;
        render();
        const newInput = container.querySelector("#stock-search");
        if (newInput) { newInput.focus(); newInput.setSelectionRange(search.length, search.length); }
      });
    }
  }

  // ====== Modales auxiliares para transferencias ======

  // Modal: ver disponibilidad de un producto en todos los almacenes
  function showProductAvailabilityModal(product) {
    const close = showModal({
      title: `${esc(product.name)} — Disponibilidad`,
      body: `
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          <div class="text-xs text-muted">${esc(product.brand || '')}</div>
          <div id="modal-availability-list" style="display:flex;flex-direction:column;gap:0.375rem">
            <div class="empty-state text-xs"><div class="spinner spinner-sm"></div> Cargando...</div>
          </div>
        </div>
      `,
      footer: `<button class="btn btn-primary" id="modal-transfer-btn">${icon("arrowLeftRight", 12)} Pedir desde otro almacén</button><button class="btn btn-outline" id="modal-close-btn">Cerrar</button>`,
    });

    document.querySelector("#modal-close-btn").addEventListener("click", close);
    document.querySelector("#modal-transfer-btn").addEventListener("click", () => {
      close();
      showCreateTransferModal(product);
    });

    // Cargar disponibilidad
    listStockForProductInAllWarehouses(product.id).then((avail) => {
      const listEl = document.querySelector("#modal-availability-list");
      if (!listEl) return;
      if (avail.length === 0) {
        listEl.innerHTML = '<div class="empty-state text-xs">Sin stock en ningún almacén.</div>';
        return;
      }
      listEl.innerHTML = avail.map((a) => {
        const isOwn = a.warehouseId === warehouse.id;
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius);${isOwn ? 'background:var(--primary-tint);border-color:color-mix(in oklab, var(--primary) 40%, transparent)' : ''}">
            <div>
              <div class="text-sm font-medium">${esc(a.warehouseName)} ${isOwn ? '<span class="badge badge-accent" style="font-size:0.5625rem">Este almacén</span>' : ''}</div>
              <div class="text-xs text-muted">${esc(a.warehouseCode)}${a.localPrice ? ' · ' + formatMoney(a.localPrice, "USD") : ''}</div>
            </div>
            <div class="text-lg font-bold ${a.quantity === 0 ? 'text-danger' : 'text-primary'}">${a.quantity}</div>
          </div>
        `;
      }).join('');
    }).catch(() => {
      const listEl = document.querySelector("#modal-availability-list");
      if (listEl) listEl.innerHTML = '<div class="empty-state text-xs">Error al cargar disponibilidad.</div>';
    });
  }

  render();
  return () => { unsubSales(); unsubStock(); };
}
