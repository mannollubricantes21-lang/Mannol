// =====================================================
// Warehouse Interior view — layout exacto del screenshot
// KPIs en tarjetas oscuras + detalle por moneda + FAB
// =====================================================

import { getStore } from "../store.js";
import { hasPersistedSupabaseSession } from "../supabase.js";
import { subscribeSales, subscribeStock, listProducts, listWarehouses, listAllStockAcrossWarehouses, listStockForProductInAllWarehouses, createTransferRequest, listTransferRequests, saveDailyClosure, listDailyClosures, listSalesInRange } from "../db.js";
import { computeSellerEarnings, renderSellerEarningsCard, monthRange } from "../seller-earnings.js";
import { vendorRuleLabel } from "../vendor-rule.js";
import { wholesaleShortages } from "../wholesale-config.js";
import { computeClosureStats, closureDateKey, validateTransferRequest, buildClosureShareText, suggestRestock, buildRestockText, computeCashCount, cashDiffLabel, CASH_CURRENCIES } from "../sales-stats.js";
import { getPendingCount } from "../offline-sync.js";
import { formatMoney, formatDate } from "../currency.js";
import { sortOutOfStockLast } from "../catalog-facets.js";
import { icon, esc, toast, showModal, closeModal, confirmDialog, copyText, openWhatsApp, warehouseColor } from "../ui.js";

/**
 * v5.20.0: salir del almacén (fin de la sesión PIN) y volver al inicio.
 * Las ventas pendientes de subir NO se pierden: la cola es del equipo.
 */
export function exitWarehouse(store, warehouse, navigate) {
  confirmDialog(`¿Salir de ${esc(warehouse?.name || "este almacén")}? Para volver a entrar se pedirá el PIN.`, () => {
    const hadAccount = hasPersistedSupabaseSession();
    store.logout();
    store.setWarehouse(null);
    try { localStorage.setItem("mannol-last-view", "home"); } catch {}
    if (hadAccount) {
      // El dueño (admin) entró por PIN: recargar recupera su sesión normal
      window.location.href = window.location.pathname;
      return;
    }
    navigate("home");
  });
}

// v5.24.0: «Sobran / Faltan / Cuadra» con color
function diffHtml(row) {
  if (!row || !row.hasCount) return "";
  const txt = cashDiffLabel(row, formatMoney);
  const color = Math.abs(row.diff) < 0.01 ? "var(--primary)" : row.diff > 0 ? "var(--info, #2777a8)" : "var(--danger)";
  return `<strong style="color:${color}">${esc(txt)}</strong>`;
}

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
  // v5.14.0: lo que lleva ganado el vendedor (comisión fija por producto)
  let sellerWh = warehouse;     // config de vendedores del almacén (se refresca abajo)
  let prevSales = null;         // ventas del mes pasado (consulta propia, por páginas)
  let prevLoading = false;
  let prevFrom = null;          // mes cargado (si la app queda abierta al cambiar de mes)
  let earnOpen = false;         // «Ver detalle por producto» abierto
  let restockOpen = false;      // v5.21.0: «Pedido sugerido» desplegado
  // v5.24.0: caja del día (fondo inicial + arqueo). Lo escrito se conserva
  // entre repintados; el fondo también se guarda en este equipo por si no hay red.
  let cashCount = { USD: "", MN: "", EUR: "" };
  let cashNote = "";
  let cashLoadedFor = null;     // id del cierre del que se cargó lo contado
  let editFloat = false;
  const floatKey = (k) => `mannol-fondo-${warehouse?.id}-${k}`;
  const readLocalFloat = (k) => { try { return JSON.parse(localStorage.getItem(floatKey(k)) || "null"); } catch { return null; } };
  // v5.22.0: sección visible en el teléfono (Hoy / Inventario / Caja)
  let section = "hoy";
  try { section = sessionStorage.getItem("mannol-wi-section") || "hoy"; } catch {}
  if (!["hoy", "inv", "caja"].includes(section)) section = "hoy";

  if (!warehouse) {
    container.innerHTML = `<div class="empty-state">Selecciona un almacén</div>`;
    return () => {};
  }

  listProducts().then((p) => { products = p; render(); }).catch(() => {});
  listWarehouses().then((ws) => {
    allWarehouses = ws.filter((w) => w.id !== warehouse.id && w.active !== false);
    // Config de vendedores al día (el admin pudo cambiarla después de entrar con el PIN)
    const me = ws.find((w) => w.id === warehouse.id);
    if (me) sellerWh = { ...warehouse, ...me };
    render();
  }).catch(() => {});

  function loadPrevMonth() {
    const r = monthRange(Date.now(), -1);
    prevFrom = r.from;
    prevLoading = true;
    listSalesInRange({ warehouseId: warehouse.id, from: r.from, to: r.to })
      .then((list) => { if (prevFrom === r.from) { prevSales = list; prevLoading = false; render(); } })
      .catch(() => { prevLoading = false; render(); });
  }
  loadPrevMonth();

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
  function showRequestDialog(product, defaultQty = 5) {
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
            <input class="input" type="number" min="1" id="tr-qty" value="${Math.max(1, Math.min(defaultQty, available[0]?.quantity || defaultQty))}" inputmode="numeric" />
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
    const filteredProducts = sortOutOfStockLast(products.filter((p) => {
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
    }), (p) => stockMap[p.id]?.quantity ?? 0); // v5.20.0: agotados al final
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
    // v5.24.0: un registro del día puede ser solo la APERTURA (closed = false)
    const todayRow = recentClosures.find((c) => c.closureDate === todayKey) || null;
    const todayClosed = todayRow && todayRow.closed !== false ? todayRow : null;
    const openingFloat = (todayRow && todayRow.openingFloat) || readLocalFloat(todayKey) || null;
    if (todayRow && todayRow.id !== cashLoadedFor) {
      cashLoadedFor = todayRow.id;
      if (todayRow.countedCash) cashCount = { USD: "", MN: "", EUR: "", ...Object.fromEntries(Object.entries(todayRow.countedCash).map(([k, v]) => [k, String(v)])) };
      if (todayRow.cashNote) cashNote = todayRow.cashNote;
    }
    const cash = computeCashCount({ stats: todayStats, opening: openingFloat || {}, counted: cashCount });
    const cashRows = ["USD", "MN", ...CASH_CURRENCIES.filter((c) => c === "EUR" && cash.rows.some((r) => r.currency === "EUR"))]
      .map((c) => cash.rows.find((r) => r.currency === c) || { currency: c, opening: 0, sales: 0, expected: 0, counted: null, diff: null, hasCount: false });
    const pendingHere = (() => { try { return getPendingCount(warehouse.id); } catch { return 0; } })();
    const floatText = openingFloat
      ? CASH_CURRENCIES.filter((c) => Number(openingFloat[c]) > 0).map((c) => formatMoney(Number(openingFloat[c]), c)).join(" · ") || "sin fondo"
      : "";

    // v5.14.0: si la app quedó abierta al cambiar de mes, recargar el «mes pasado»
    if (prevFrom !== monthRange(Date.now(), -1).from && !prevLoading) loadPrevMonth();
    let earnCur = computeSellerEarnings(sales, { warehouse: sellerWh });
    let earnPrev = prevSales ? computeSellerEarnings(prevSales, { warehouse: sellerWh, offset: -1 }) : null;
    // v5.26.0: dos vendedores con PIN propio → cada uno ve solo lo suyo
    const mySlot = Number(user?.sellerSlot) || null;
    if (earnCur.mode === "pin" && mySlot && user?.role === "empleado_pin") {
      const mine = (r) => r && ({ ...r, split: false, shifts: r.shifts.filter((x) => x.key === `seller${mySlot}`) });
      earnCur = mine(earnCur);
      earnPrev = mine(earnPrev);
    }
    const ruleNote = `${vendorRuleLabel(store.getState().settings?.vendorSaleRule)}. Cargadores y similares: su comisión aparte. Por caja: lo del producto.`;
    const earningsHtml = renderSellerEarningsCard(earnCur, earnPrev, { open: earnOpen, prevLoading, ruleNote, mySlot });

    // v5.21.0: pedido sugerido (ventas de 30 días: este mes + el pasado)
    const salesById = new Map();
    [...(prevSales || []), ...sales].forEach((x) => salesById.set(x.id, x));
    const restock = products.length && stock.length
      ? suggestRestock({ products, stock, sales: [...salesById.values()] })
      : [];

    // v5.32.0: venta por caja que no llega al mínimo en este almacén
    const qtyById = {};
    stock.forEach((x) => { qtyById[x.productId] = x.quantity; });
    const boxShort = products.length ? wholesaleShortages(products, qtyById, warehouse.id) : [];

    container.innerHTML = `
      <div class="wi-layout wi-v2" data-sec-active="${section}" style="display:flex;flex-direction:column;gap:0.875rem">
        <!-- v5.27.0: sin cabecera propia ni pestañas: el nombre va en la barra
             de arriba y las secciones en la barra de abajo (Hoy · Inventario ·
             Vender · Caja · Más). Apariencia y «Salir» están en «Más». -->
        <!-- v5.27.0: resumen — el total grande, el resto al lado, barra por moneda -->
        <div class="card wi-resumen wi2-sum" data-sec="hoy">
          <div class="seg-group wi2-seg">
            ${[["today", "Hoy"], ["week", "Semana"], ["month", "Mes"]].map(([p, lbl]) => `
              <button class="seg ${period === p ? 'seg-on' : ''}" data-period="${p}">${lbl}</button>
            `).join("")}
          </div>
          <div class="wi2-sum-main">
            <div style="min-width:0">
              <div class="wi2-sum-label">${period === "today" ? "Vendido hoy" : period === "week" ? "Vendido esta semana" : "Vendido este mes"}</div>
              <div class="wi2-big">${formatMoney(stats.totalUSD, "USD")}</div>
            </div>
            <div class="wi2-sum-side">
              <span><strong>${stats.count}</strong> venta${stats.count === 1 ? "" : "s"}</span>
              <span><strong>${stats.unitsSold}</strong> unidades</span>
              <span>ticket <strong>${formatMoney(stats.count > 0 ? stats.totalUSD / stats.count : 0, "USD")}</strong></span>
            </div>
          </div>
          ${activeCurrs.length > 0 ? `
            <div class="wi2-bar" aria-hidden="true">
              ${activeCurrs.map((c) => `<span style="flex:${Math.max(stats.byCurrency[c].amount, 0.01)};background:${CURR_COLOR[c]}"></span>`).join("")}
            </div>
            <div class="wi2-currs">
              ${activeCurrs.map((c) => `
                <span><i style="background:${CURR_COLOR[c]}"></i>${CURR_LABEL[c]} <strong>${formatMoney(stats.byCurrency[c].amount, CURR_FMT[c])}</strong> <em>${stats.byCurrency[c].count}</em></span>
              `).join("")}
            </div>
          ` : ''}
          ${zeroCurrs.length > 0 && activeCurrs.length > 0 ? `
            <div class="wi2-zero">Sin movimiento: ${zeroCurrs.map((c) => CURR_LABEL[c]).join(", ")}</div>
          ` : ''}
          ${stats.count === 0 ? `
            <div class="wi2-empty">Sin ventas en este período. Toca «Vender» abajo para registrar una.</div>
          ` : ''}
        </div>

        ${restock.length || outOfStock ? `
          <button class="wi2-alert" data-sec="hoy" data-go="wi-inv">
            ${icon("alertTriangle", 18)}
            <span>${restock.length ? `${restock.length} producto${restock.length === 1 ? "" : "s"} por pedir` : ""}${restock.length && outOfStock ? " · " : ""}${outOfStock ? `${outOfStock} agotado${outOfStock === 1 ? "" : "s"}` : ""}</span>
            <span class="wi2-alert-go">Ver ${icon("chevronRight", 16)}</span>
          </button>` : ""}

        <!-- v5.20.0: se quitó el botón grande «Registrar venta» del centro —
             el botón 🛒 de la barra de abajo está siempre disponible. -->

        <!-- v5.14.0: lo que lleva ganado (comisión fija por producto) -->
        <div class="wi-ganado" data-sec="caja">${earningsHtml}</div>

        <!-- Caja del día (v5.5.0 → v5.24.0: fondo inicial + arqueo + marcas) -->
        <div class="card wi-cierre" data-sec="caja">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3 class="card-title flex items-center gap-1">${icon("receipt", 14)} Caja de hoy</h3>
            ${todayClosed
              ? `<span class="badge badge-accent" style="font-size:0.625rem">Cerrada · ${esc(todayClosed.createdByName || '')}</span>`
              : openingFloat
                ? `<span class="badge badge-warning" style="font-size:0.625rem">Abierta · falta cerrar</span>`
                : `<span class="badge" style="font-size:0.625rem">Sin abrir</span>`}
          </div>
          <div class="card-content cash-card" style="padding:0.625rem 0.75rem;display:flex;flex-direction:column;gap:0.75rem">

            <!-- 1 · Fondo inicial -->
            <div class="cash-block">
              <div class="cash-title"><span class="sale-step-n">1</span> Fondo con el que empieza el día</div>
              ${openingFloat && !editFloat ? `
                <div class="cash-float">
                  <strong>${esc(floatText)}</strong>
                  <span class="text-xs text-muted">${todayRow?.openedByName ? `por ${esc(todayRow.openedByName)}` : ""}${todayRow?.openedAt ? ` · ${new Date(todayRow.openedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                  ${!todayClosed ? `<button class="btn btn-ghost btn-sm" data-cash-edit-float>Cambiar</button>` : ""}
                </div>
              ` : todayClosed ? `<p class="text-xs text-muted" style="margin:0">No se anotó fondo.</p>` : `
                <div class="cash-inputs">
                  ${CASH_CURRENCIES.map((c) => `
                    <label class="cash-in"><span>${c}</span>
                      <input class="input" type="number" min="0" step="0.01" inputmode="decimal" data-float="${c}" value="${openingFloat && Number(openingFloat[c]) > 0 ? Number(openingFloat[c]) : ""}" placeholder="0" aria-label="Fondo inicial en ${c}" />
                    </label>`).join("")}
                </div>
                <button class="btn btn-primary btn-sm btn-block" id="cash-open-btn">${icon("check", 14)} ${openingFloat ? "Guardar fondo" : "Abrir caja con este fondo"}</button>
              `}
            </div>

            <!-- 2 · Ventas del día -->
            <div class="cash-block">
              <div class="cash-title"><span class="sale-step-n">2</span> Ventas de hoy</div>
              <div class="cash-total"><span>${todayStats.salesCount} venta${todayStats.salesCount === 1 ? "" : "s"} · ${todayStats.unitsSold} u</span><strong>${formatMoney(todayStats.totalUSD, "USD")}</strong></div>
              ${Object.entries(todayStats.byCurrency).filter(([_, v]) => v.count > 0).map(([curr, d]) => `
                <div class="cash-line"><span class="text-muted">${curr === "TRANSFERENCIA" ? "Transferencia (a tarjeta)" : esc(curr)} · ${d.count} venta(s)</span><strong>${formatMoney(d.amount, curr === "TRANSFERENCIA" ? "USD" : curr)}</strong></div>
              `).join("")}
              ${todayStats.byBrand && todayStats.byBrand.length ? `
                <div class="text-xs font-semibold text-muted" style="margin:0.5rem 0 0.25rem">Por marca</div>
                <div class="cash-brands">
                  ${todayStats.byBrand.map((b) => `<span class="cash-brand"><strong>${esc(b.brand)}</strong> ${b.units} u · ${formatMoney(b.total, "USD")}</span>`).join("")}
                </div>` : ""}
            </div>

            <!-- 3 · Contar el efectivo -->
            <div class="cash-block">
              <div class="cash-title"><span class="sale-step-n">3</span> Contar el efectivo</div>
              ${pendingHere > 0 ? `<div class="cash-warn">${icon("alertTriangle", 14)} Hay <strong>${pendingHere}</strong> venta(s) en este equipo sin subir. Se suben solas con internet; súbelas antes de cerrar para que cuadre.</div>` : ""}
              <div class="cash-table">
                <div class="cash-row cash-head"><span>Moneda</span><span>Debería haber</span><span>Hay</span><span></span></div>
                ${cashRows.map((r) => `
                  <div class="cash-row">
                    <span class="font-semibold">${r.currency}</span>
                    <span title="Fondo ${formatMoney(r.opening, r.currency)} + ventas ${formatMoney(r.sales, r.currency)}">${formatMoney(r.expected, r.currency)}</span>
                    <input class="input" type="number" min="0" step="0.01" inputmode="decimal" data-count="${r.currency}" value="${esc(cashCount[r.currency] ?? "")}" placeholder="0" aria-label="Efectivo contado en ${r.currency}" />
                    <span class="cash-diff" data-diff="${r.currency}">${diffHtml(r)}</span>
                  </div>`).join("")}
              </div>
              <label class="label label-xs" for="cash-note" style="margin-top:0.5rem">Nota (si sobra o falta, explica por qué)</label>
              <textarea class="textarea" id="cash-note" maxlength="300" style="min-height:3rem" placeholder="Ej.: sobran $5 de una venta que no se registró · falta cambio de 200 MN">${esc(cashNote)}</textarea>
            </div>

            <!-- v5.27.0: UNA acción principal. Cerrada → compartir pasa a ser lo principal -->
            ${todayClosed ? `
              <button class="btn btn-primary btn-lg btn-block" id="share-closure-wa">${icon("whatsapp", 18)} Enviar cierre por WhatsApp</button>
              <div class="closure-share">
                <button class="btn btn-secondary btn-sm" id="close-cash-btn">${icon("check", 14)} Corregir cierre</button>
                <button class="btn btn-secondary btn-sm" id="share-closure-copy" aria-label="Copiar el resumen del cierre">${icon("copy", 14)} Copiar texto</button>
              </div>
            ` : `
              <button class="btn btn-primary btn-lg btn-block" id="close-cash-btn">${icon("check", 16)} Cerrar caja de hoy</button>
            `}
            ${recentClosures.filter((c) => c.closed !== false).length > 0 ? `
              <button class="btn btn-ghost btn-sm btn-block" data-toggle-closures>
                Últimos cierres (${recentClosures.filter((c) => c.closed !== false).length}) ${closuresOpen ? '▲' : '▼'}
              </button>
              ${closuresOpen ? `
                <div style="display:flex;flex-direction:column;gap:0.25rem">
                  ${recentClosures.filter((c) => c.closed !== false).map((c) => {
                    const d = c.cashDifference || {};
                    const diffs = Object.entries(d).filter(([_, v]) => Math.abs(Number(v) || 0) >= 0.01)
                      .map(([cur, v]) => `<span style="color:${v > 0 ? "var(--primary)" : "var(--danger)"}">${v > 0 ? "+" : "−"}${formatMoney(Math.abs(v), cur)}</span>`).join(" ");
                    return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius-sm)">
                      <div>
                        <div class="text-xs font-medium">${esc(c.closureDate)}${c.closureDate === todayKey ? ' · hoy' : ''}</div>
                        <div class="text-xs text-muted">${c.salesCount} ventas · ${c.unitsSold} u · por ${esc(c.createdByName || '—')}${diffs ? ` · ${diffs}` : (c.countedCash ? " · cuadró" : "")}</div>
                      </div>
                      <strong class="text-sm" style="color:var(--accent-usd)">${formatMoney(c.totalUSD, "USD")}</strong>
                    </div>`;
                  }).join("")}
                </div>
              ` : ''}
            ` : ''}
          </div>
        </div>

        <!-- Inventario con tabs: Stock / Otros almacenes / Transferencias -->
        <div class="card wi-inv" data-sec="inv">
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

        <!-- v5.32.0: venta por caja sin cajas suficientes -->
        ${boxShort.length ? `
          <div class="card wi-boxshort" data-sec="inv">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
              <h3 class="card-title flex items-center gap-1">${icon("boxes", 14)} No alcanza para venta por caja</h3>
              <span class="badge badge-warning" style="font-size:0.625rem">${boxShort.length}</span>
            </div>
            <div class="card-content" style="padding:0.5rem 0.75rem 0.75rem;display:flex;flex-direction:column;gap:0.375rem">
              ${boxShort.map((r) => `
                <div class="restock-row">
                  <div style="flex:1;min-width:0">
                    <div class="text-xs font-semibold truncate">${esc(r.name)}</div>
                    <div class="text-xs text-muted">Hay ${r.boxes} caja${r.boxes === 1 ? "" : "s"} · mínimo ${r.minBoxes} · faltan ${r.missingUnits} pomos</div>
                  </div>
                  <span class="restock-qty" title="Cajas que faltan">+${r.minBoxes - r.boxes}</span>
                </div>`).join("")}
            </div>
          </div>
        ` : ""}

        <!-- v5.21.0: Pedido sugerido -->
        ${restock.length ? `
          <div class="card wi-pedido" data-sec="inv">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
              <h3 class="card-title flex items-center gap-1">${icon("listTree", 14)} Pedido sugerido</h3>
              <span class="badge badge-warning" style="font-size:0.625rem">${restock.length} producto${restock.length === 1 ? "" : "s"}</span>
            </div>
            <div class="card-content" style="padding:0.5rem 0.75rem 0.75rem;display:flex;flex-direction:column;gap:0.375rem">
              <p class="text-xs text-muted" style="margin:0">Para cubrir ~2 semanas al ritmo de venta de los últimos 30 días.</p>
              ${(restockOpen ? restock : restock.slice(0, 4)).map((r) => `
                <div class="restock-row">
                  <div style="flex:1;min-width:0">
                    <div class="text-xs font-semibold truncate">${esc(r.name)}</div>
                    <div class="text-xs text-muted">Hay ${r.qty} · ${esc(r.reason)}${r.perDay > 0 ? ` · ${r.perDay.toLocaleString("es-ES")}/día` : ""}</div>
                  </div>
                  <span class="restock-qty" title="Unidades sugeridas">+${r.suggested}</span>
                  <button class="btn btn-ghost btn-sm" data-restock-request="${esc(r.productId)}" data-restock-qty="${r.suggested}" title="Pedir a otro almacén">${icon("arrowLeftRight", 12)}</button>
                </div>
              `).join("")}
              ${restock.length > 4 ? `<button class="btn btn-ghost btn-sm btn-block" data-restock-toggle>${restockOpen ? "Ver menos ▲" : `Ver los ${restock.length} ▼`}</button>` : ""}
              <button class="btn btn-whatsapp btn-sm" id="restock-share">${icon("whatsapp", 14)} Enviar pedido por WhatsApp</button>
            </div>
          </div>
        ` : ""}

        <!-- Ventas recientes -->
        ${periodSales.length > 0 ? `
          <div class="card wi-recientes wi2-recent" data-sec="hoy">
            <div class="wi2-h-row"><h3 class="wi2-h">Ventas ${period === "today" ? "de hoy" : "recientes"}</h3><button class="btn btn-text btn-sm" data-go="history">Ver historial</button></div>
            <div class="wi2-recent-list">
              ${periodSales.slice(0, 10).map((s) => {
                const n = (s.items || []).reduce((a, it) => a + (Number(it.quantity) || 0), 0) || s.items.length;
                return `
                <div class="wi2-sale">
                  <span class="wi2-sale-mark" style="background:${CURR_COLOR[s.currency] || 'var(--primary)'}"></span>
                  <div class="wi2-sale-txt">
                    <div><strong>${esc(s.code)}</strong> ${esc(s.managerName || s.userName || '')}</div>
                    <div class="wi2-sale-sub">${n} producto${n === 1 ? "" : "s"} · ${formatDate(s.createdAt)} · ${CURR_LABEL[s.currency] || esc(s.currency || 'USD')}</div>
                  </div>
                  <span class="wi2-sale-amt">${formatMoney(s.totalAmount, "USD")}</span>
                </div>`;
              }).join("")}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    container.querySelectorAll("[data-period]").forEach((btn) => {
      btn.addEventListener("click", () => { period = btn.dataset.period; render(); });
    });
    container.querySelector("[data-earn-details]")?.addEventListener("toggle", (e) => { earnOpen = e.currentTarget.open; });

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

    // v5.24.0: caja del día — fondo, conteo y cierre
    const saveClosure = async (extra) => {
      const user = store.getState().currentUser;
      const res = await saveDailyClosure({
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        dateKey: todayKey,
        stats: todayStats,
        user,
        ...extra,
      });
      if (res && res.missingColumns) {
        toast("Guardado sin el fondo/arqueo: el administrador debe ejecutar el SQL de caja v5.24 en Supabase", "warning", 7000);
      }
      recentClosures = await listDailyClosures({ warehouseId: warehouse.id, limit: 7 }).catch(() => recentClosures);
      return res;
    };
    container.querySelector("[data-cash-edit-float]")?.addEventListener("click", () => { editFloat = true; render(); });
    container.querySelector("#cash-open-btn")?.addEventListener("click", async () => {
      const float = {};
      container.querySelectorAll("[data-float]").forEach((inp) => {
        const v = parseFloat(inp.value);
        if (v > 0) float[inp.dataset.float] = Math.round(v * 100) / 100;
      });
      try { localStorage.setItem(floatKey(todayKey), JSON.stringify(float)); } catch {}
      const user = store.getState().currentUser;
      try {
        await saveClosure({ openingFloat: float, openedAt: Date.now(), openedByName: user?.displayName || null, closed: false });
        toast(Object.keys(float).length ? "Caja abierta con su fondo" : "Caja abierta sin fondo", "success");
      } catch (err) {
        toast("Fondo guardado en este equipo (sin conexión con la nube)", "info", 4000);
      }
      editFloat = false;
      render();
    });
    container.querySelectorAll("[data-count]").forEach((inp) => {
      inp.addEventListener("input", () => {
        cashCount[inp.dataset.count] = inp.value;
        // repinta solo la diferencia (no se pierde el foco)
        const live = computeCashCount({ stats: todayStats, opening: openingFloat || {}, counted: cashCount });
        CASH_CURRENCIES.forEach((c) => {
          const el = container.querySelector(`[data-diff="${c}"]`);
          if (!el) return;
          const row = live.rows.find((r) => r.currency === c) || { currency: c, hasCount: false };
          el.innerHTML = diffHtml(row);
        });
      });
    });
    container.querySelector("#cash-note")?.addEventListener("input", (e) => { cashNote = e.target.value; });

    const closeCashBtn = container.querySelector("#close-cash-btn");
    if (closeCashBtn) {
      closeCashBtn.addEventListener("click", () => {
        const live = computeCashCount({ stats: todayStats, opening: openingFloat || {}, counted: cashCount });
        const counted = {}; const diff = {};
        live.rows.filter((r) => r.hasCount).forEach((r) => { counted[r.currency] = r.counted; diff[r.currency] = r.diff; });
        const resumen = live.rows.filter((r) => r.hasCount).map((r) => `${r.currency}: ${cashDiffLabel(r, formatMoney)}`).join(" · ");
        const msg = (todayClosed ? "¿Actualizar el cierre de hoy?" : "¿Cerrar la caja de hoy?") +
          ` ${todayStats.salesCount} venta(s) · ${formatMoney(todayStats.totalUSD, "USD")}` +
          (resumen ? `<br><strong>${esc(resumen)}</strong>` : "<br>No contaste el efectivo (puedes cerrar igual).") +
          (live.anyDiff && !cashNote.trim() ? "<br><span style=\"color:var(--warning)\">Hay diferencia: conviene anotar el motivo.</span>" : "");
        confirmDialog(msg, async () => {
          try {
            const res = await saveClosure({
              openingFloat: openingFloat || null,
              countedCash: Object.keys(counted).length ? counted : null,
              cashDifference: Object.keys(diff).length ? diff : null,
              cashNote: cashNote.trim() || null,
              closed: true,
            });
            toast(res && res.updated ? "Cierre de hoy actualizado" : "Caja cerrada", "success");
            closuresOpen = true;
            render();
          } catch (err) {
            toast("Error al guardar el cierre: " + (err.message || "desconocido"), "error");
          }
        });
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
      cash: computeCashCount({ stats: todayStats, opening: openingFloat || {}, counted: cashCount }),
      note: cashNote.trim(),
    });
    container.querySelector("#share-closure-wa")?.addEventListener("click", () => openWhatsApp(closureText()));
    container.querySelector("#share-closure-copy")?.addEventListener("click", async () => {
      const ok = await copyText(closureText());
      toast(ok ? "Resumen del cierre copiado" : "No se pudo copiar el resumen", ok ? "success" : "warning");
    });

    // v5.22.0: pestañas de sección
    container.querySelectorAll("[data-sec-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        section = btn.dataset.secTab;
        try { sessionStorage.setItem("mannol-wi-section", section); } catch {}
        render();
        try { container.querySelector(".wi-tabs")?.scrollIntoView({ block: "nearest" }); } catch {}
      });
    });

    // v5.21.0: pedido sugerido
    container.querySelector("[data-restock-toggle]")?.addEventListener("click", () => { restockOpen = !restockOpen; render(); });
    container.querySelector("#restock-share")?.addEventListener("click", () => openWhatsApp(buildRestockText({ warehouseName: warehouse.name, items: restock })));
    container.querySelectorAll("[data-restock-request]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const p = products.find((x) => x.id === btn.dataset.restockRequest);
        if (!p) return;
        if (otherWarehousesStock.length === 0 && othersState !== "loading") await loadOtherStock();
        showRequestDialog(p, Number(btn.dataset.restockQty) || 5);
      });
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

    // v5.20.0: «Volver» no hacía nada — navigate("home") rebotaba de nuevo
    // al dashboard porque la sesión PIN seguía activa. Ahora sale del almacén
    // (pide confirmación) y vuelve a la lista de almacenes.
    // v5.25.0: apariencia del almacén
    container.querySelector("[data-appearance]")?.addEventListener("click", () => {
      import("./appearance-dialog.js").then((m) => m.openAppearanceDialog(warehouse, () => render()));
    });
    // v5.27.0: atajos «Ver» → otra sección/vista (por la barra de abajo)
    container.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", () => window.dispatchEvent(new CustomEvent("mannol:nav", { detail: { view: el.dataset.go } })));
    });
    // Avisos en la barra de abajo: productos bajos/agotados y caja sin cerrar
    try {
      const invBtn = document.querySelector('.nav-btn[data-nav="wi-inv"]');
      if (invBtn) {
        invBtn.querySelector(".nav-badge")?.remove();
        const n = lowStock + outOfStock;
        if (n > 0) invBtn.insertAdjacentHTML("beforeend", `<span class="nav-badge" aria-label="${n} con poco stock">${n}</span>`);
      }
      const cajaBtn = document.querySelector('.nav-btn[data-nav="wi-caja"]');
      if (cajaBtn) {
        cajaBtn.querySelector(".nav-badge")?.remove();
        if (!todayClosed && (todayStats.salesCount > 0 || openingFloat)) cajaBtn.insertAdjacentHTML("beforeend", `<span class="nav-badge nav-badge--dot" aria-label="Caja sin cerrar"></span>`);
      }
    } catch {}

    const backBtn = container.querySelector("[data-nav-back]");
    if (backBtn) backBtn.addEventListener("click", () => exitWarehouse(store, warehouse, navigate));

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
    document.querySelector("#modal-transfer-btn").addEventListener("click", async () => {
      close();
      // v5.20.0: antes llamaba a showCreateTransferModal (no existía → error)
      if (otherWarehousesStock.length === 0 && othersState !== "loading") await loadOtherStock();
      showRequestDialog(product);
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
  // v5.27.0: la barra de abajo cambia de sección sin volver a cargar datos
  const onSection = (e) => {
    const sec = e.detail?.section;
    if (!["hoy", "inv", "caja"].includes(sec) || sec === section) return;
    section = sec;
    render();
  };
  window.addEventListener("mannol:wi-section", onSection);

  return () => { unsubSales(); unsubStock(); window.removeEventListener("mannol:wi-section", onSection); };
}
