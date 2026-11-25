// =====================================================
// Sales view (POS) — rediseñado según screenshot
// Flujo: Gestor → Productos → Nota → Pago → Registrar
// =====================================================

import { getStore } from "../store.js";
import { subscribeProducts, subscribeStock, subscribeCategories, subscribeBrands, listCards, listManagers, listSales, isUuid, getWholesaleTier, getSuggestedPricePerBox, getSuggestedVendorCommissionPerBox, getSuggestedGestorCommissionPerBox, isWholesaleProduct, listWarehouses, resolveEffectiveWarehouse, sumCartCommissions } from "../db.js";
import { formatMoney, generateSaleId, generateSaleCode, CURRENCIES, CURRENCY_LABELS, CARD_BRANDS, getRate } from "../currency.js";
import { enqueueSale, generateClientRef, requestSync, getPendingCount, getPendingSales, discardQueuedSale } from "../offline-sync.js";
import { isSupabaseConfiguredAsync } from "../supabase.js";
import { toast, icon, showModal, closeModal, esc, confirmDialog } from "../ui.js";
import { computeTopSellers, findProductByCode } from "../sales-stats.js";
import { openScanner, canUseCamera } from "../barcode-scanner.js";
import { buildCatalogFacets, filterCatalog, NO_CATEGORY } from "../catalog-facets.js";
import { roundCents, rateUSD, usdToNative, summarizeMultiPayment, billPresetsFor, normalizePaymentPreference } from "../payment-utils.js";
import { getDataAgeMs, formatDataAge } from "../data-freshness.js"; // v5.17: «stock de hace X min»

const CURRENCY_META = {
  USD: { icon: "$", label: "Efectivo", sublabel: "Dólar", color: "var(--accent-usd)" },
  MN: { icon: "₱", label: "Peso cubano", sublabel: "MN", color: "var(--accent-mn)" },
  EUR: { icon: "€", label: "Euro", sublabel: "EUR", color: "var(--accent-eur)" },
  TRANSFERENCIA: { icon: "💳", label: "A una tarjeta", sublabel: "Transf.", color: "var(--accent-transfer)" },
};

export function mountSalesView(container, navigate) {
  const store = getStore();
  let products = [];
  let stock = [];
  let cards = [];
  let managers = [];
  let cart = [];
  let search = "";
  let isOnline = navigator.onLine;
  let selectedManagerCode = "";
  let selectedManager = null;
  let note = "";
  let paymentMode = "SINGLE"; // SINGLE | MULTI
  let selectedCurrency = "USD";
  let multiPayments = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
  let selectedCardId = "";
  let transferAmount = 0;
  let catalogOpen = false;
  // v5.12.0: filtros del catálogo por tipo y marca (se recuerdan mientras dure la venta)
  let catalogCategories = [];
  let catalogBrands = [];
  let catFilter = "";   // "" = todos · id de la categoría principal · NO_CATEGORY
  let brandFilter = ""; // "" = todas · nombre de la marca normalizado
  let catalogListRenderer = null; // vuelve a dibujar el catálogo abierto (datos en vivo)
  // v5.4.0: búsqueda rápida inline + calculadora de vuelto
  let quickSearch = "";
  let paidWith = 0;
  // Mayorista
  let saleType = "RETAIL"; // RETAIL | WHOLESALE
  let wholesaleProduct = null; // producto seleccionado para venta mayorista
  let wholesaleBoxes = 1; // cantidad de cajas
  let wholesalePricePerBox = 0; // precio por caja (editable)
  let wholesaleVendorCommissionPerBox = 0; // comisión vendedor por caja (editable)
  let wholesaleGestorCommissionPerBox = 0; // comisión gestor por caja (editable)
  // v5.8 (móvil): observer de la barra de cobro (declarado arriba: las
  // suscripciones pueden llamar a render() antes de llegar más abajo)
  let checkoutObserver = null;
  // v5.10.0: más vendidos del almacén (ids, de mayor a menor)
  let topSellerIds = [];

  // v5.16: borrador del carrito. Sobrevive a recargas y a actualizaciones de
  // la app (antes una venta a medias se perdía). Solo menudeo, 12 h de vida.
  const DRAFT_TTL_MS = 12 * 3600 * 1000;
  const draftWh = store.getState().currentWarehouse;
  const draftKey = draftWh ? `mannol-cart-draft-${draftWh.id}` : null;
  function saveDraft() {
    if (!draftKey) return;
    try {
      if (saleType !== "RETAIL" || (cart.length === 0 && !note)) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey, JSON.stringify({ ts: Date.now(), cart, note }));
    } catch {}
  }
  if (draftKey) {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || "null");
      const valid = d && Array.isArray(d.cart) && Date.now() - (d.ts || 0) < DRAFT_TTL_MS &&
        d.cart.every((i) => i && i.productId && Number(i.quantity) > 0 && Number.isFinite(Number(i.unitPrice)));
      if (valid && d.cart.length > 0) {
        cart = d.cart.map((i) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), subtotal: Number(i.quantity) * Number(i.unitPrice) }));
        note = typeof d.note === "string" ? d.note : "";
        setTimeout(() => toast("Se recuperó la venta que tenías a medias", "info", 3500), 400);
      } else if (d) localStorage.removeItem(draftKey);
    } catch {}
  }

  // v5.16: estado del pago en varias monedas (falta / sobra) en vivo
  const payRates = () => store.getState().rates || {};

  // v5.18.0: recordar la moneda de cobro que se usó la última vez en ESTE
  // almacén y preseleccionarla (en el mostrador casi siempre se cobra igual).
  // Va en su propia clave de localStorage, no en el borrador del carrito.
  const payPrefKey = draftWh ? `mannol-pay-pref-${draftWh.id}` : null;
  if (payPrefKey) {
    try {
      const pref = normalizePaymentPreference(localStorage.getItem(payPrefKey));
      if (pref) {
        paymentMode = pref.mode;
        if (pref.currency) selectedCurrency = pref.currency;
      }
    } catch {}
  }
  function savePayPreference() {
    if (!payPrefKey) return;
    try {
      localStorage.setItem(payPrefKey, JSON.stringify({ mode: paymentMode, currency: selectedCurrency }));
    } catch {}
  }
  function multiSummary() {
    return summarizeMultiPayment(multiPayments, roundCents(cartTotal()), payRates());
  }
  function multiStatusHtml() {
    const s = multiSummary();
    let color = "var(--text-muted)", text;
    if (s.missingRates.length) { color = "var(--danger, #B3261E)"; text = `Sin tasa de cambio para ${s.missingRates.join(", ")}`; }
    else if (s.lines.length === 0) text = `Ingresa los montos · Total ${formatMoney(cartTotal(), "USD")}`;
    else if (s.missingUSD > 0) { color = "#7A4E00"; text = `Falta ${formatMoney(s.missingUSD, "USD")} (equivalente en USD)`; }
    else if (s.overUSD > 0) { color = "var(--danger, #B3261E)"; text = `Sobra ${formatMoney(s.overUSD, "USD")}: ajusta los montos`; }
    else { color = "var(--primary)"; text = "Pago completo"; }
    return `<span style="color:${color};font-weight:600">${text}</span>`;
  }
  function registerBtnState() {
    if (paymentMode !== "MULTI") return { disabled: false, label: "Registrar venta" };
    const s = multiSummary();
    if (s.ok) return { disabled: false, label: "Registrar venta" };
    if (s.missingRates.length) return { disabled: true, label: "Falta la tasa de cambio" };
    if (s.lines.length === 0) return { disabled: true, label: "Ingresa los pagos" };
    if (s.missingUSD > 0) return { disabled: true, label: `Falta ${formatMoney(s.missingUSD, "USD")}` };
    return { disabled: true, label: `Sobra ${formatMoney(s.overUSD, "USD")}` };
  }
  function refreshRegisterBtn() {
    const b = container.querySelector("#register-sale-btn");
    if (!b || registering) return;
    const st = registerBtnState();
    b.disabled = st.disabled;
    b.innerHTML = `${icon("check", 20)} ${st.label}`;
  }
  function refreshMultiStatus() {
    const el = container.querySelector("#multi-status");
    if (el) el.innerHTML = multiStatusHtml();
    // v5.18.0: el error junto al campo — en rojo el input concreto (la moneda
    // sin tasa, o los montos que se pasan del total)
    const s = multiSummary();
    container.querySelectorAll("[data-multi-currency]").forEach((inp) => {
      const c = inp.dataset.multiCurrency;
      const bad = s.missingRates.includes(c) || (s.overUSD > 0 && (multiPayments[c] || 0) > 0);
      inp.classList.toggle("field-error", bad);
    });
    refreshRegisterBtn();
  }
  // Total expresado en la moneda elegida (para el vuelto)
  function changeTotal() {
    const t = roundCents(cartTotal());
    const n = usdToNative(t, selectedCurrency, payRates());
    return n == null ? t : n;
  }

  // v5.18.0: pintar la línea de vuelto sin re-render (lo usan el teclado de
  // billetes y el input manual)
  function updateChangeDue() {
    const el = container.querySelector("#change-due");
    if (!el) return;
    const t = changeTotal();
    el.textContent = paidWith > 0
      ? (paidWith >= t ? `Vuelto: ${formatMoney(paidWith - t, selectedCurrency)}` : `Faltan ${formatMoney(t - paidWith, selectedCurrency)}`)
      : `Total: ${formatMoney(t, selectedCurrency)}`;
    el.style.color = paidWith >= t && paidWith > 0 ? "var(--primary)" : "var(--text-muted)";
  }
  function setPaidWith(v, { focusInput = false } = {}) {
    paidWith = Number(v) || 0;
    const inp = container.querySelector("#paid-with");
    if (inp) inp.value = paidWith > 0 ? String(paidWith) : "";
    updateChangeDue();
    if (focusInput && inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
  }

  // v5.18.0: marcar el campo concreto que falta (borde rojo + foco) —
  // el motivo ya lo decía el botón; ahora también se VE dónde.
  function flagField(selector, focus = true) {
    const el = container.querySelector(selector);
    if (!el) return;
    el.classList.add("field-error");
    if (focus) {
      el.focus?.();
      try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
    }
  }

  // Cargar datos
  // Flag para evitar re-fetch si la vista se monta varias veces
  let catalogsLoaded = false;
  let catalogsLoading = false;
  let catalogsDisposed = false;
  function loadCatalogs(attempt = 1) {
    if (catalogsDisposed || catalogsLoaded || catalogsLoading) return;
    catalogsLoading = true;
    Promise.all([listCards(), listManagers()]).then(([c, m]) => {
      cards = c;
      managers = m;
      catalogsLoaded = true;
      catalogsLoading = false;
      // v5.19.0: solo los desplegables afectados (puede llegar tarde, con la
      // venta ya a medias: no se redibuja todo)
      paintManagerSelect();
      paintCardSelect();
    }).catch((err) => {
      catalogsLoading = false;
      console.warn(`[Ventas] gestores/tarjetas no cargaron (intento ${attempt}):`, err);
      // v5.16: antes se quedaban vacíos para siempre; ahora se reintenta
      if (attempt < 4) setTimeout(() => loadCatalogs(attempt + 1), 3000 * attempt);
      else toast("No se pudieron cargar gestores y tarjetas. Revisa la conexión y vuelve a entrar a Ventas.", "warning", 6000);
    });
  }
  loadCatalogs();

  // v5.19.0: los datos que llegan solos (productos, stock) NO redibujan el
  // formulario — repintan solo los fragmentos afectados. Antes un render
  // completo recreaba los campos y cortaba lo que se estaba escribiendo
  // (nota, vuelto, montos del pago mixto).
  const unsubProducts = subscribeProducts((items) => {
    products = items.filter((p) => p.active !== false);
    refreshLiveData();
    catalogListRenderer?.();
  });
  const warehouse = store.getState().currentWarehouse;
  const unsubStock = warehouse ? subscribeStock(warehouse.id, (items) => {
    stock = items;
    refreshLiveData();
    catalogListRenderer?.();
  }) : () => {};
  // v5.12.0: tipos y marcas en vivo — lo que el admin crea u ordena aparece aquí al instante
  const unsubCategories = subscribeCategories((items) => { catalogCategories = items || []; catalogListRenderer?.(); });
  const unsubBrands = subscribeBrands((items) => { catalogBrands = items || []; catalogListRenderer?.(); });

  // v5.10.0: más vendidos de los últimos 30 días (una consulta; caché local 30 min)
  const TOP_TTL_MS = 30 * 60 * 1000;
  const topKey = warehouse ? `mannol_top_sellers_${warehouse.id}` : null;
  if (topKey) {
    let fresh = false;
    try {
      const cached = JSON.parse(localStorage.getItem(topKey) || "null");
      if (cached && Array.isArray(cached.ids)) {
        topSellerIds = cached.ids;
        fresh = Date.now() - (cached.ts || 0) < TOP_TTL_MS;
      }
    } catch {}
    if (!fresh) {
      listSales({ warehouseId: warehouse.id, from: Date.now() - 30 * 86400000, status: "COMPLETADA" })
        .then((list) => {
          const top = computeTopSellers(list, { limit: 10 });
          if (!top.length) return;
          topSellerIds = top.map((t) => t.productId);
          try { localStorage.setItem(topKey, JSON.stringify({ ts: Date.now(), ids: topSellerIds })); } catch {}
          paintTopSellers(); // v5.19.0: solo los chips, sin redibujar todo
        })
        .catch(() => {});
    }
  }

  const onOnline = () => { isOnline = true; render(); };
  const onOffline = () => { isOnline = false; render(); };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // Subscribe to sync status for pending count
  let unsubSync = () => {};
  import("../offline-sync.js").then(({ subscribeSyncStatus }) => {
    // v5.19.0: la cola de subida solo afecta a las insignias del encabezado
    unsubSync = subscribeSyncStatus(() => paintHeaderBadges());
  }).catch(() => {});

  function getStockQty(productId) {
    return stock.find((s) => s.productId === productId)?.quantity ?? 0;
  }

  // v5.17: el service worker sirve la copia guardada cuando no hay red.
  // Mostrar hace cuánto: «stock de hace 12 min» (antes era invisible y se
  // podía vender con un stock desactualizado).
  function stockAgeText() {
    const whNow = store.getState().currentWarehouse;
    const age = getDataAgeMs(`stock:${whNow?.id || ""}`);
    if (age == null) return "";
    return `stock de hace ${formatDataAge(age)}`;
  }

  function cartTotal() {
    if (saleType === "WHOLESALE") {
      return wholesaleBoxes * wholesalePricePerBox;
    }
    return cart.reduce((sum, i) => sum + i.subtotal, 0);
  }

  function render() {
    const user = store.getState().currentUser;
    const wh = store.getState().currentWarehouse;
    // v5.13.0: solo las ventas en cola de ESTE almacén
    const pendingHere = wh ? getPendingCount(wh.id) : 0;

    if (!user || !wh) {
      container.innerHTML = `<div class="empty-state">Selecciona un almacén en el menú lateral</div>`;
      return;
    }

    saveDraft();
    container.innerHTML = `
      <div class="sale-form-panel" style="display:flex;flex-direction:column;gap:1rem">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold flex items-center gap-2">${icon("cart", 20)} Venta en ${esc(wh.name)} (${esc(wh.code)})</h1>
            <p class="text-xs text-muted">Solo productos, gestor y pago.</p>
          </div>
          <div class="flex items-center gap-2" data-header-badges></div>
        </div>

        ${!isOnline ? `
          <div class="sync-banner sync-banner-offline">
            <div class="sync-banner-icon">${icon("wifiOff", 18)}</div>
            <div class="sync-banner-content">
              <div class="sync-banner-title">Sin conexión</div>
              <div class="sync-banner-sub">${pendingHere > 0 ? `${pendingHere} venta(s) de ${esc(wh.code)} esperando conexión · se subirán solas` : "Puedes seguir vendiendo: las ventas se guardan en este equipo y se suben solas"}${stockAgeText() ? ` · ${stockAgeText()}` : ""}</div>
            </div>
          </div>
        ` : ''}

        <!-- Toggle Retail / Mayorista -->
        <div class="tabs-list" style="grid-template-columns: 1fr 1fr;margin-bottom:0">
          <button class="tabs-trigger ${saleType === 'RETAIL' ? 'active' : ''}" data-sale-type="RETAIL">
            ${icon("cart", 14)} Por unidad
          </button>
          <button class="tabs-trigger ${saleType === 'WHOLESALE' ? 'active' : ''}" data-sale-type="WHOLESALE">
            ${icon("boxes", 14)} Mayorista · caja
          </button>
        </div>

        ${saleType === "WHOLESALE" ? renderWholesaleSection() : `
        <div>
          <label class="label">Gestor que refirió (opcional)</label>
          <select class="select" id="manager-code">${managerOptionsHtml()}</select>
          ${selectedManager ? `<p class="text-xs text-muted mt-1">${esc(selectedManager.name)}${selectedManager.code ? ` · Código: ${esc(selectedManager.code)}` : ''}${selectedManager.phone ? ` · ${esc(selectedManager.phone)}` : ''}</p>` : ''}
        </div>
        <div>
          <label class="label flex items-center gap-1">${icon("boxes", 14)} Productos de la venta</label>
          <!-- v5.4.0: búsqueda rápida — filtra al escribir y añade con un toque (Enter = primer resultado) -->
          <div class="${canUseCamera() ? "input-scan" : ""}" style="position:relative;margin-top:0.375rem">
            <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 14)}</span>
            <input class="input" id="quick-search" placeholder="Buscar y añadir rápido (ej: 5W-30)…" value="${esc(quickSearch)}" style="padding-left:2.1rem" autocomplete="off" />
            ${canUseCamera() ? `<button type="button" class="scan-btn" id="scan-sale-btn" aria-label="Escanear código de barras" title="Escanear código de barras">${icon("scan", 18)}</button>` : ""}
            <!-- v5.19.0: contenedor fijo — los resultados los pinta paintQuickResults()
                 (antes cada tecla re-renderizaba TODO y había que devolver el foco a mano) -->
            <div id="quick-results" style="position:absolute;left:0;right:0;top:calc(100% + 0.25rem);z-index:30;display:none;flex-direction:column;gap:0.25rem;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-lg);padding:0.375rem;box-shadow:var(--shadow-md);max-height:16rem;overflow-y:auto"></div>
          </div>
          <div data-top-sellers-zone></div>
          ${cart.length === 0 ? `
            <button class="btn btn-primary btn-block btn-lg" id="open-catalog-btn" style="justify-content:space-between">
              <span class="flex items-center gap-2">${icon("boxes", 18)} Abrir catálogo</span>
              <span class="badge" data-catalog-badge>${products.filter(p => getStockQty(p.id) > 0).length} disponibles</span>
            </button>
          ` : `
            <div style="display:flex;flex-direction:column;gap:0.5rem">
              ${cart.map((item, i) => {
                const p = products.find((x) => x.id === item.productId);
                const stockQty = getStockQty(item.productId);
                return `
                  <div class="cart-item" style="display:flex;align-items:center;gap:0.5rem;padding:0.625rem">
                    <div style="flex:1 1 100%;min-width:0">
                      <div class="text-sm font-medium truncate">${esc(item.name)}</div>
                      <div class="text-xs text-muted">${formatMoney(item.unitPrice, "USD")} c/u · Stock: <span data-cart-stock="${esc(item.productId)}">${stockQty + item.quantity}</span></div>
                      ${user?.role === "admin" ? `<div class="text-xs text-muted">Comisión gestor: ${p?.gestorCommission ?? p?.commission ?? 0} ${p?.gestorCommissionCurrency ?? p?.commissionCurrency ?? "USD"} · Comisión vendedor: ${p?.vendorCommission ?? 0} ${p?.vendorCommissionCurrency ?? "MN"}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-1">
                      <button class="btn btn-outline btn-icon btn-sm" data-action="dec" data-idx="${i}" aria-label="Quitar una unidad de ${esc(item.name)}">${icon("minus", 12)}</button>
                      <!-- v5.17: cantidad editable — se toca el número y se escribe, en vez de dar «+» diez veces -->
                      <input class="input" type="number" min="1" max="${Math.max(stockQty + item.quantity, item.quantity)}" value="${item.quantity}" data-qty-edit="${i}" inputmode="numeric" aria-label="Cantidad de ${esc(item.name)}" style="width:3.25rem;text-align:center;padding:0.25rem 0.25rem;min-height:2.25rem" />
                      <button class="btn btn-outline btn-icon btn-sm" data-action="inc" data-idx="${i}" aria-label="Añadir una unidad de ${esc(item.name)}">${icon("plus", 12)}</button>
                    </div>
                    <div class="text-sm font-bold" style="width:5rem;text-align:right">${formatMoney(item.subtotal, "USD")}</div>
                    <button class="btn btn-ghost btn-icon btn-sm text-danger" data-action="remove" data-idx="${i}" aria-label="Quitar ${esc(item.name)} de la venta">${icon("trash", 12)}</button>
                  </div>
                `;
              }).join("")}
              <button class="btn btn-outline btn-sm" id="add-more-btn">${icon("plus", 14)} Agregar más productos</button>
            </div>
          `}
        </div>
        `}

        <!-- Nota / Observaciones (común para retail y mayorista) -->
        <div>
          <label class="label flex items-center gap-1">${icon("receipt", 14)} Nota / Observaciones (opcional)</label>
          <textarea class="textarea" id="note-input" placeholder="Ej: cliente frecuente, datos de envío, acuerdo de pago, descripción del vehículo..." maxlength="500" style="min-height:4rem">${note}</textarea>
          <div class="text-xs text-muted text-right mt-1" id="note-counter">${note.length}/500</div>
        </div>

        ${(saleType === "WHOLESALE" ? wholesaleProduct : cart.length > 0) ? `
          <!-- Selector de modo de pago -->
          <div id="payment-section">
            <label class="label">Moneda / Método de pago</label>
            <div class="tabs-list" style="grid-template-columns: 1fr 1fr;margin-bottom:0.75rem">
              <button class="tabs-trigger ${paymentMode === 'SINGLE' ? 'active' : ''}" data-mode="SINGLE">Una moneda</button>
              <button class="tabs-trigger ${paymentMode === 'MULTI' ? 'active' : ''}" data-mode="MULTI">Pago mixto</button>
            </div>

            ${paymentMode === 'SINGLE' ? `
              <div class="grid grid-cols-2 gap-2">
                ${CURRENCIES.map((curr) => `
                  <button class="payment-card ${selectedCurrency === curr ? 'selected' : ''}" data-currency="${curr}" style="display:flex;align-items:center;gap:0.75rem;padding:1rem;border:2px solid ${selectedCurrency === curr ? 'var(--primary)' : 'var(--border)'};border-radius:var(--radius-lg);background:${selectedCurrency === curr ? 'var(--primary-tint)' : 'var(--bg-elevated)'};cursor:pointer;text-align:left">
                    <span style="font-size:1.5rem;font-weight:700;color:${CURRENCY_META[curr].color}">${CURRENCY_META[curr].icon}</span>
                    <div>
                      <div class="font-semibold text-sm">${curr === "TRANSFERENCIA" ? "TRANSF." : curr}</div>
                      <div class="text-xs text-muted">${CURRENCY_META[curr].label}</div>
                    </div>
                  </button>
                `).join("")}
              </div>
            ` : `
              <div class="grid grid-cols-2 gap-2">
                ${CURRENCIES.map((curr) => `
                  <div style="padding:0.75rem;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-elevated)">
                    <div class="flex items-center gap-2 mb-1">
                      <span style="font-size:1.25rem;font-weight:700;color:${CURRENCY_META[curr].color}">${CURRENCY_META[curr].icon}</span>
                      <span class="font-semibold text-sm">${curr}</span>
                    </div>
                    <div style="display:flex;gap:0.375rem;align-items:center">
                      <input class="input" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" data-multi-currency="${curr}" value="${multiPayments[curr] || ''}" aria-label="Monto en ${curr}" />
                      <button type="button" class="btn btn-outline btn-sm" data-multi-rest="${curr}" style="min-height:2.75rem" aria-label="Completar con ${curr}">Resto</button>
                    </div>
                  </div>
                `).join("")}
              </div>
              <div id="multi-status" class="text-sm" style="margin-top:0.5rem" aria-live="polite">${multiStatusHtml()}</div>
            `}

            ${selectedCurrency === 'TRANSFERENCIA' || (paymentMode === 'MULTI' && multiPayments.TRANSFERENCIA > 0) ? `
              <div class="card mt-3" style="padding:0.75rem">
                <label class="label label-xs">Tarjeta de transferencia</label>
                <select class="select" id="card-select">${cardOptionsHtml()}</select>
                <label class="label label-xs mt-2">Monto transferido (USD)</label>
                <input class="input" type="number" step="0.01" id="transfer-amount" value="${transferAmount || ''}" placeholder="0.00" />
              </div>
            ` : ''}
          </div>

          <!-- Total -->
          <div class="card" style="padding:1rem;display:flex;justify-content:space-between;align-items:center">
            <span class="flex items-center gap-2 font-semibold">${icon("dollar", 18)} Total a cobrar</span>
            <span class="text-2xl font-bold" style="color:var(--primary)">${formatMoney(cartTotal(), "USD")}</span>
          </div>

          <!-- v5.4.0: calculadora de vuelto (efectivo en una sola moneda) -->
          ${paymentMode === "SINGLE" && selectedCurrency !== "TRANSFERENCIA" ? `
            <div class="card" style="padding:0.875rem 1rem">
              <label class="label label-xs flex items-center gap-1">${icon("receipt", 12)} Vuelto · ¿Con cuánto paga el cliente? (${selectedCurrency})</label>
              <input class="input" type="number" step="0.01" min="0" id="paid-with" value="${paidWith || ''}" placeholder="0.00" style="max-width:12rem" inputmode="decimal" />
              <!-- v5.18.0: teclado rápido de billetes — un toque = monto completo -->
              <div class="pay-bills" id="pay-bills" role="group" aria-label="Montos rápidos de billetes">
                ${billPresetsFor(selectedCurrency, cartTotal(), payRates()).map((b) => `
                  <button type="button" class="pay-bill-chip" data-bill="${b.value}" aria-label="Poner ${esc(b.label)} en el pago">${esc(b.label)}</button>
                `).join("")}
              </div>
              <div class="text-sm font-semibold" id="change-due" style="margin-top:0.375rem;color:${paidWith > 0 && paidWith >= changeTotal() ? 'var(--primary)' : 'var(--text-muted)'}">
                ${paidWith > 0 ? (paidWith >= changeTotal() ? `Vuelto: ${formatMoney(paidWith - changeTotal(), selectedCurrency)}` : `Faltan ${formatMoney(changeTotal() - paidWith, selectedCurrency)}`) : `Total: ${formatMoney(changeTotal(), selectedCurrency)}`}
              </div>
            </div>
          ` : ''}

          <!-- Botones -->
          <div style="display:flex;flex-direction:column;gap:0.5rem">
            <button class="btn btn-primary btn-block btn-lg" id="register-sale-btn" style="font-size:1.125rem;font-weight:700" ${registerBtnState().disabled ? "disabled" : ""}>
              ${icon("check", 20)} ${registerBtnState().label}
            </button>
            <button class="btn btn-ghost btn-block" id="cancel-sale-btn">Cancelar</button>
          </div>
        ` : ''}
      </div>
      ${hasCheckoutItems() ? `
        <!-- v5.8 (móvil): total + "Cobrar" siempre a mano mientras se arma la venta -->
        <div class="checkout-bar" id="checkout-bar" role="region" aria-label="Resumen de la venta">
          <div class="checkout-bar-info">
            <span class="checkout-bar-count">${checkoutCountLabel()}</span>
            <span class="checkout-bar-total">${formatMoney(cartTotal(), "USD")}</span>
          </div>
          <button type="button" class="checkout-bar-btn" id="checkout-bar-btn">
            Cobrar ${icon("arrowDown", 16)}
          </button>
        </div>
      ` : ''}
    `;

    wireEvents();
    paintHeaderBadges();
    paintQuickResults();
    paintTopSellers();
    setupCheckoutBar();
  }

  // ===== v5.19.0: pintores parciales =====
  // Los datos que cambian solos (stock, productos, gestores/tarjetas, cola de
  // subida) repintan SOLO estos fragmentos. Nunca tocan el formulario: lo que
  // se está escribiendo (nota, vuelto, montos del pago mixto) no se recrea y
  // no pierde el foco. render() sigue completo para cambios estructurales
  // (carrito, modo de pago, cambio de pestaña).

  function managerOptionsHtml() {
    return `<option value="">— Sin gestor —</option>` +
      managers.filter((m) => m.active !== false).sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((m) => `<option value="${esc(m.id)}" ${selectedManager?.id === m.id ? 'selected' : ''}>${esc(m.name)}${m.code ? ` (${esc(m.code)})` : ''}</option>`).join("");
  }

  function cardOptionsHtml() {
    return `<option value="">— Selecciona tarjeta —</option>` +
      cards.map((c) => `<option value="${esc(c.id)}" ${selectedCardId === c.id ? 'selected' : ''}>${esc(c.name)} · ${esc(c.bank || '')} · ${esc(c.last4 || String(c.number || '').slice(-4))}</option>`).join("");
  }

  function paintManagerSelect() {
    const sel = container.querySelector("#manager-code");
    if (sel) sel.innerHTML = managerOptionsHtml(); // el nodo se conserva: el listener sigue
  }

  function paintCardSelect() {
    const sel = container.querySelector("#card-select");
    if (sel) sel.innerHTML = cardOptionsHtml();
  }

  function paintHeaderBadges() {
    const el = container.querySelector("[data-header-badges]");
    if (!el) return;
    const wh = store.getState().currentWarehouse;
    const pendingHere = wh ? getPendingCount(wh.id) : 0;
    el.innerHTML = `
      <span class="badge ${isOnline ? "badge-accent" : "badge-warning"}">${isOnline ? "En línea" : "Offline"}</span>
      ${pendingHere > 0 ? `<span class="badge badge-warning">${icon("clock", 12)} ${pendingHere} por subir</span>` : ""}
    `;
  }

  // Resultados de la búsqueda rápida: contenedor fijo, se repinta por tecla
  // sin tocar el input (el foco y el cursor quedan donde estaban).
  function paintQuickResults() {
    const el = container.querySelector("#quick-results");
    if (!el) return;
    if (!quickSearch.trim()) {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }
    el.style.display = "flex";
    const matches = quickMatches();
    el.innerHTML = matches.length === 0
      ? `<div class="text-xs text-muted" style="padding:0.5rem">Sin resultados para “${esc(quickSearch)}”</div>`
      : matches.map((p) => {
          const qty = getStockQty(p.id);
          const isOut = qty <= 0;
          return `
            <button class="btn btn-ghost btn-sm" data-quick-add="${esc(p.id)}" ${isOut ? 'disabled' : ''} style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;width:100%">
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left">${esc(p.name)}</span>
              <span style="flex-shrink:0;font-size:0.75rem;color:var(--text-muted)">${formatMoney(p.salePrice, "USD")} · ${isOut ? 'agotado' : `stock ${qty}`}</span>
            </button>
          `;
        }).join("");
    el.querySelectorAll("[data-quick-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        quickSearch = "";
        addProduct(btn.dataset.quickAdd); // render() completo: el carrito cambió
        const re = container.querySelector("#quick-search");
        if (re) re.focus();
      });
    });
  }

  function paintTopSellers() {
    const zone = container.querySelector("[data-top-sellers-zone]");
    if (!zone) return;
    zone.innerHTML = renderTopSellers();
    zone.querySelectorAll("[data-top-add]").forEach((btn) => {
      btn.addEventListener("click", () => addProduct(btn.dataset.topAdd));
    });
  }

  // Textos de stock de las líneas del carrito (el precio es el fijado al añadir)
  function paintCartStock() {
    container.querySelectorAll("[data-cart-stock]").forEach((el) => {
      const item = cart.find((i) => i.productId === el.dataset.cartStock);
      if (item) el.textContent = String(getStockQty(item.productId) + item.quantity);
    });
  }

  function paintCatalogBadge() {
    const el = container.querySelector("[data-catalog-badge]");
    if (el) el.textContent = `${products.filter((p) => getStockQty(p.id) > 0).length} disponibles`;
  }

  function paintWholesaleStock() {
    const sel = container.querySelector("#wholesale-product-select");
    if (sel) {
      sel.querySelectorAll("option").forEach((opt) => {
        const p = products.find((x) => x.id === opt.value);
        if (!p || !p.unitsPerBox) return;
        const qty = getStockQty(p.id);
        opt.textContent = `${p.name} · ${p.unitsPerBox} pomos/caja · Stock: ${qty} (${Math.floor(qty / p.unitsPerBox)} cajas)`;
      });
    }
    const stockEl = container.querySelector("[data-ws-stock]");
    if (stockEl && wholesaleProduct) {
      const qty = getStockQty(wholesaleProduct.id);
      const maxBoxes = wholesaleProduct.unitsPerBox ? Math.floor(qty / wholesaleProduct.unitsPerBox) : 0;
      stockEl.textContent = `${qty} pomos · ${maxBoxes} cajas`;
      const boxesInput = container.querySelector("#wholesale-boxes");
      if (boxesInput) boxesInput.max = String(maxBoxes);
    }
  }

  // Una sola puerta para las suscripciones: repinta lo que depende de datos.
  function refreshLiveData() {
    paintHeaderBadges();
    paintQuickResults();
    paintTopSellers();
    paintCartStock();
    paintCatalogBadge();
    paintWholesaleStock();
  }

  // ===== v5.8 (móvil): barra de cobro pegajosa =====
  // Antes el total y "Registrar venta" quedaban al final de un formulario
  // largo (gestor, carrito, nota, moneda, vuelto): había que hacer scroll a
  // ciegas para cobrar. La barra muestra el total siempre y se oculta sola
  // cuando el botón real de registrar ya está a la vista.
  function hasCheckoutItems() {
    return saleType === "WHOLESALE" ? !!wholesaleProduct : cart.length > 0;
  }

  function checkoutCountLabel() {
    if (saleType === "WHOLESALE") {
      return `${wholesaleBoxes} caja${wholesaleBoxes === 1 ? "" : "s"} · mayorista`;
    }
    const units = cart.reduce((sum, i) => sum + i.quantity, 0);
    return `${units} producto${units === 1 ? "" : "s"} · ${cart.length} línea${cart.length === 1 ? "" : "s"}`;
  }

  function teardownCheckoutBar() {
    if (checkoutObserver) { try { checkoutObserver.disconnect(); } catch {} checkoutObserver = null; }
    document.body.classList.remove("has-checkout-bar");
  }

  function setupCheckoutBar() {
    teardownCheckoutBar();
    const bar = container.querySelector("#checkout-bar");
    if (!bar) return;
    const target = container.querySelector("#register-sale-btn");
    const setVisible = (visible) => {
      bar.classList.toggle("is-hidden", !visible);
      document.body.classList.toggle("has-checkout-bar", visible);
    };
    // Estado inicial síncrono (evita parpadeo en cada re-render)
    const targetInView = () => {
      if (!target) return false;
      const r = target.getBoundingClientRect();
      return r.top < window.innerHeight - 72 && r.bottom > 0;
    };
    setVisible(!targetInView());
    if (target && "IntersectionObserver" in window) {
      checkoutObserver = new IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        setVisible(!e.isIntersecting);
      }, { rootMargin: "0px 0px -72px 0px" });
      checkoutObserver.observe(target);
    }
    bar.querySelector("#checkout-bar-btn")?.addEventListener("click", () => {
      const section = container.querySelector("#payment-section");
      if (!section) return;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.classList.remove("flash");
      void section.offsetWidth; // reinicia la animación
      section.classList.add("flash");
    });
  }

  // ===== Sección Mayorista =====
  function renderWholesaleSection() {
    const wholesaleProducts = products.filter(isWholesaleProduct);
    if (wholesaleProducts.length === 0) {
      return `
        <div class="card">
          <div class="card-content text-center" style="padding:2rem">
            <p class="text-muted">No hay productos configurados para venta mayorista.</p>
            <p class="text-xs text-muted mt-2">El admin debe configurar "pomos por caja" y "tiers de precio" en el panel de productos.</p>
          </div>
        </div>
      `;
    }
    // Recalcular sugerencias si cambió el producto o las cajas
    if (wholesaleProduct) {
      const suggestedPrice = getSuggestedPricePerBox(wholesaleProduct, wholesaleBoxes);
      const suggestedVendor = getSuggestedVendorCommissionPerBox(wholesaleProduct, wholesaleBoxes);
      const suggestedGestor = getSuggestedGestorCommissionPerBox(wholesaleProduct, wholesaleBoxes);
      // Auto-actualizar si el valor guardado coincide con el tier anterior (o es 0)
      if (wholesalePricePerBox === 0 || wholesalePricePerBox === (suggestedPrice)) {
        wholesalePricePerBox = suggestedPrice || 0;
      }
      if (wholesaleVendorCommissionPerBox === 0) {
        wholesaleVendorCommissionPerBox = suggestedVendor || 0;
      }
      if (wholesaleGestorCommissionPerBox === 0) {
        wholesaleGestorCommissionPerBox = suggestedGestor || 0;
      }
    }
    const stockQty = wholesaleProduct ? getStockQty(wholesaleProduct.id) : 0;
    const maxBoxes = wholesaleProduct?.unitsPerBox ? Math.floor(stockQty / wholesaleProduct.unitsPerBox) : 0;
    const tier = wholesaleProduct ? getWholesaleTier(wholesaleProduct, wholesaleBoxes) : null;
    const totalUnits = wholesaleProduct ? wholesaleBoxes * wholesaleProduct.unitsPerBox : 0;
    const total = wholesaleBoxes * wholesalePricePerBox;
    return `
      <!-- Gestor -->
      <div>
        <label class="label">Gestor que refirió (opcional)</label>
        <select class="select" id="manager-code">${managerOptionsHtml()}</select>
        ${selectedManager ? `<p class="text-xs text-muted mt-1">${esc(selectedManager.name)}${selectedManager.code ? ` · Código: ${esc(selectedManager.code)}` : ''}${selectedManager.phone ? ` · ${esc(selectedManager.phone)}` : ''}</p>` : ''}
      </div>

      <!-- Producto mayorista -->
      <div>
        <label class="label flex items-center gap-1">${icon("boxes", 14)} Producto mayorista</label>
        <select class="select" id="wholesale-product-select">
          <option value="">— Selecciona producto —</option>
          ${wholesaleProducts.map((p) => `
            <option value="${esc(p.id)}" ${wholesaleProduct?.id === p.id ? 'selected' : ''}>
              ${esc(p.name)} · ${p.unitsPerBox} pomos/caja · Stock: ${getStockQty(p.id)} (${Math.floor(getStockQty(p.id) / p.unitsPerBox)} cajas)
            </option>
          `).join("")}
        </select>
      </div>

      ${wholesaleProduct ? `
        <div class="card" style="padding:1rem;display:flex;flex-direction:column;gap:0.75rem;background:var(--bg-elevated);border:2px solid var(--primary)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div class="font-semibold">${esc(wholesaleProduct.name)}</div>
              <div class="text-xs text-muted">${esc(wholesaleProduct.brand)} · ${esc(wholesaleProduct.viscosity || '')} · ${wholesaleProduct.unitsPerBox} pomos por caja</div>
            </div>
            <div class="text-right">
              <div class="text-xs text-muted">Stock disponible</div>
              <div class="font-bold" data-ws-stock>${stockQty} pomos · ${maxBoxes} cajas</div>
            </div>
          </div>

          ${tier ? `
            <div style="background:var(--primary-tint);padding:0.5rem 0.75rem;border-radius:var(--radius);font-size:0.75rem">
              ${icon("trendingUp", 12)} <strong>Tier aplicable:</strong> ${tier.minBoxes}${tier.maxBoxes ? '-' + tier.maxBoxes : '+'} cajas
              · Precio sugerido: <strong>${formatMoney(tier.pricePerUnit, "USD")}</strong>/pomo
              · <strong>${formatMoney(tier.pricePerUnit * wholesaleProduct.unitsPerBox, "USD")}</strong>/caja
            </div>
          ` : ''}

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label label-xs">Cantidad de cajas</label>
              <input class="input" type="number" min="1" max="${maxBoxes}" id="wholesale-boxes" value="${wholesaleBoxes}" />
              <div class="text-xs text-muted mt-1">${totalUnits} pomos totales</div>
            </div>
            <div>
              <label class="label label-xs">Precio por caja (USD) *</label>
              <input class="input" type="number" step="0.01" id="wholesale-price" value="${wholesalePricePerBox}" />
              <div class="text-xs text-muted mt-1">Sugerido: ${formatMoney(getSuggestedPricePerBox(wholesaleProduct, wholesaleBoxes) || 0, "USD")}</div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label label-xs">Comisión vendedor /caja (USD)</label>
              <input class="input" type="number" step="0.01" id="wholesale-vendor-commission" value="${wholesaleVendorCommissionPerBox}" />
            </div>
            <div>
              <label class="label label-xs">Comisión gestor /caja (USD)</label>
              <input class="input" type="number" step="0.01" id="wholesale-gestor-commission" value="${wholesaleGestorCommissionPerBox}" />
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;padding-top:0.5rem;border-top:1px solid var(--border)">
            <span class="text-sm font-semibold">Total venta:</span>
            <span class="text-xl font-bold" style="color:var(--primary)">${formatMoney(total, "USD")}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span class="text-xs text-muted">Comisión vendedor total:</span>
            <span class="text-sm font-semibold">${formatMoney(wholesaleBoxes * wholesaleVendorCommissionPerBox, "USD")}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span class="text-xs text-muted">Comisión gestor total:</span>
            <span class="text-sm font-semibold">${formatMoney(wholesaleBoxes * wholesaleGestorCommissionPerBox, "USD")}</span>
          </div>
        </div>
      ` : ''}
    `;
  }

  function wireEvents() {
    // Toggle Retail / Mayorista
    container.querySelectorAll("[data-sale-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        saleType = btn.dataset.saleType;
        // Reset wholesale state al cambiar de modo
        if (saleType === "RETAIL") {
          wholesaleProduct = null;
          wholesaleBoxes = 1;
          wholesalePricePerBox = 0;
          wholesaleVendorCommissionPerBox = 0;
          wholesaleGestorCommissionPerBox = 0;
        } else {
          // Al entrar a mayorista, limpiar carrito retail
          cart = [];
        }
        render();
      });
    });

    // Mayorista: select de producto
    const wsProductSelect = container.querySelector("#wholesale-product-select");
    if (wsProductSelect) {
      wsProductSelect.addEventListener("change", (e) => {
        const pid = e.target.value;
        wholesaleProduct = pid ? products.find((p) => p.id === pid) : null;
        wholesaleBoxes = 1;
        wholesalePricePerBox = 0;
        wholesaleVendorCommissionPerBox = 0;
        wholesaleGestorCommissionPerBox = 0;
        render();
        // Re-enfocar el input de cajas
        setTimeout(() => {
          const boxesInput = container.querySelector("#wholesale-boxes");
          if (boxesInput) boxesInput.focus();
        }, 50);
      });
    }

    // Mayorista: inputs
    const wsBoxes = container.querySelector("#wholesale-boxes");
    if (wsBoxes) {
      // Usar change (blur/Enter) en vez de input para evitar re-render en cada tecla
      wsBoxes.addEventListener("change", (e) => {
        const v = parseInt(e.target.value) || 1;
        wholesaleBoxes = Math.max(1, v);
        // Reset precio para que se recalcule del tier
        wholesalePricePerBox = 0;
        wholesaleVendorCommissionPerBox = 0;
        wholesaleGestorCommissionPerBox = 0;
        render();
        setTimeout(() => {
          const newBoxes = container.querySelector("#wholesale-boxes");
          if (newBoxes) { newBoxes.focus(); }
        }, 50);
      });
    }
    const wsPrice = container.querySelector("#wholesale-price");
    if (wsPrice) {
      wsPrice.addEventListener("change", (e) => {
        wholesalePricePerBox = parseFloat(e.target.value) || 0;
        render();
        setTimeout(() => {
          const newPrice = container.querySelector("#wholesale-price");
          if (newPrice) { newPrice.focus(); }
        }, 50);
      });
    }
    const wsVendorComm = container.querySelector("#wholesale-vendor-commission");
    if (wsVendorComm) {
      wsVendorComm.addEventListener("change", (e) => {
        wholesaleVendorCommissionPerBox = parseFloat(e.target.value) || 0;
        render();
        setTimeout(() => {
          const newComm = container.querySelector("#wholesale-vendor-commission");
          if (newComm) { newComm.focus(); }
        }, 50);
      });
    }
    const wsGestorComm = container.querySelector("#wholesale-gestor-commission");
    if (wsGestorComm) {
      wsGestorComm.addEventListener("change", (e) => {
        wholesaleGestorCommissionPerBox = parseFloat(e.target.value) || 0;
        render();
        setTimeout(() => {
          const newComm = container.querySelector("#wholesale-gestor-commission");
          if (newComm) { newComm.focus(); }
        }, 50);
      });
    }

    // Gestor (desplegable con nombres)
    const managerSelect = container.querySelector("#manager-code");
    if (managerSelect) {
      managerSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        selectedManager = val ? managers.find((m) => m.id === val) || null : null;
        selectedManagerCode = selectedManager?.code || "";
        render();
      });
    }

    // Abrir catálogo
    const openCatalogBtn = container.querySelector("#open-catalog-btn");
    if (openCatalogBtn) openCatalogBtn.addEventListener("click", () => { catalogOpen = true; renderCatalogModal(); });
    const addMoreBtn = container.querySelector("#add-more-btn");
    if (addMoreBtn) addMoreBtn.addEventListener("click", () => { catalogOpen = true; renderCatalogModal(); });

    // v5.4.0: búsqueda rápida — filtra al escribir; Enter añade el primer resultado
    // v5.19.0: cada tecla repinta SOLO la lista de resultados — el input no se
    // recrea y el foco/cursor quedan donde estaban (se quitó el parche de
    // devolver el foco a mano).
    const quickSearchInput = container.querySelector("#quick-search");
    if (quickSearchInput) {
      quickSearchInput.addEventListener("input", (e) => {
        quickSearch = e.target.value;
        paintQuickResults();
      });
      quickSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const first = quickMatches()[0];
          if (first && getStockQty(first.id) > 0) {
            addProduct(first.id);
            quickSearch = "";
            render();
            const re = container.querySelector("#quick-search");
            if (re) re.focus();
          } else if (first) {
            toast("Sin stock suficiente", "warning");
          }
        }
      });
    }
    const scanSaleBtn = container.querySelector("#scan-sale-btn");
    if (scanSaleBtn) scanSaleBtn.addEventListener("click", openSaleScanner);
    // v5.19.0: los chips «Más vendidos» y los resultados rápidos los une su
    // pintor (paintTopSellers / paintQuickResults), que es quien los redibuja.

    // v5.4.0: calculadora de vuelto (actualiza solo la línea, sin re-render)
    // v5.18.0: helpers compartidos — el teclado de billetes usa los mismos
    const paidWithInput = container.querySelector("#paid-with");
    if (paidWithInput) {
      paidWithInput.addEventListener("input", (e) => {
        paidWith = parseFloat(e.target.value) || 0;
        updateChangeDue();
      });
    }
    // v5.18.0: teclado rápido de billetes — un toque llena el campo completo
    container.querySelectorAll("[data-bill]").forEach((btn) => {
      btn.addEventListener("click", () => setPaidWith(btn.dataset.bill, { focusInput: true }));
    });

    // Cart actions
    container.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.idx);
        if (action === "inc") {
          const item = cart[idx];
          const stockQty = getStockQty(item.productId);
          if (item.quantity >= stockQty) { toast(`Sin stock suficiente: quedan ${stockQty}`, "warning"); return; }
          item.quantity++;
          item.subtotal = item.quantity * item.unitPrice;
          render();
        } else if (action === "dec") {
          if (cart[idx].quantity > 1) {
            cart[idx].quantity--;
            cart[idx].subtotal = cart[idx].quantity * cart[idx].unitPrice;
          } else {
            cart.splice(idx, 1);
          }
          render();
        } else if (action === "remove") {
          cart.splice(idx, 1);
          render();
        }
      });
    });

    // v5.17: cantidad editable en el carrito (change, no input, para no
    // re-dibujar en cada tecla ni perder el foco)
    container.querySelectorAll("[data-qty-edit]").forEach((input) => {
      input.addEventListener("change", () => {
        const idx = parseInt(input.dataset.qtyEdit);
        const item = cart[idx];
        if (!item) return;
        const stockQty = getStockQty(item.productId);
        let v = parseInt(input.value);
        if (!Number.isFinite(v) || v < 1) v = 1;
        if (v > stockQty) {
          v = Math.max(1, stockQty);
          toast(`Sin stock suficiente: quedan ${getStockQty(item.productId)}`, "warning");
        }
        item.quantity = v;
        item.subtotal = item.quantity * item.unitPrice;
        render();
        const re = container.querySelector(`[data-qty-edit="${idx}"]`);
        if (re) { re.focus(); re.select(); }
      });
    });

    // Nota
    let noteDraftTimer = null;
    const noteInput = container.querySelector("#note-input");
    if (noteInput) {
      noteInput.addEventListener("input", (e) => {
        note = e.target.value;
        const counter = container.querySelector("#note-counter");
        if (counter) counter.textContent = `${note.length}/500`;
        // v5.19.0: el borrador se guarda mientras escribes (con un pequeño
        // descanso), no solo al hacer otra acción que redibuje
        clearTimeout(noteDraftTimer);
        noteDraftTimer = setTimeout(saveDraft, 400);
      });
    }

    // Payment mode toggle
    container.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        paymentMode = btn.dataset.mode;
        render();
      });
    });

    // Currency selection (SINGLE mode)
    container.querySelectorAll("[data-currency]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedCurrency = btn.dataset.currency;
        render();
      });
    });

    // Multi-currency inputs
    container.querySelectorAll("[data-multi-currency]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const curr = e.target.dataset.multiCurrency;
        multiPayments[curr] = parseFloat(e.target.value) || 0;
        e.target.classList.remove("field-error"); // v5.18.0: al editar se limpia la marca
        refreshMultiStatus();
      });
    });
    container.querySelectorAll("[data-multi-rest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const curr = btn.dataset.multiRest;
        const others = { ...multiPayments, [curr]: 0 };
        const sum = summarizeMultiPayment(others, roundCents(cartTotal()), payRates());
        if (sum.missingUSD <= 0) { toast("Ya está completo: no falta nada por cobrar", "info", 2500); return; }
        const native = usdToNative(sum.missingUSD, curr, payRates());
        if (native == null) { toast(`No hay tasa de cambio para ${curr}`, "error"); return; }
        multiPayments[curr] = native;
        const input = container.querySelector(`[data-multi-currency="${curr}"]`);
        if (input) input.value = String(native);
        refreshMultiStatus();
      });
    });

    // Card select
    const cardSelect = container.querySelector("#card-select");
    if (cardSelect) {
      cardSelect.addEventListener("change", (e) => {
        selectedCardId = e.target.value;
        // v5.18.0: elegida la tarjeta, se quita la marca de error
        cardSelect.classList.remove("field-error");
      });
    }
    const transferInput = container.querySelector("#transfer-amount");
    if (transferInput) {
      transferInput.addEventListener("input", (e) => { transferAmount = parseFloat(e.target.value) || 0; });
    }

    // Register sale
    const registerBtn = container.querySelector("#register-sale-btn");
    if (registerBtn) registerBtn.addEventListener("click", handleRegister);

    // Cancel
    const cancelBtn = container.querySelector("#cancel-sale-btn");
    if (cancelBtn) cancelBtn.addEventListener("click", () => {
      const hasContent = cart.length > 0 || note || selectedManagerCode || wholesaleProduct;
      const doCancel = () => {
        cart = [];
        note = "";
        selectedManagerCode = "";
        selectedManager = null;
        multiPayments = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
        transferAmount = 0;
        selectedCardId = "";
        paidWith = 0;
        quickSearch = "";
        wholesaleProduct = null;
        wholesaleBoxes = 1;
        wholesalePricePerBox = 0;
        wholesaleVendorCommissionPerBox = 0;
        wholesaleGestorCommissionPerBox = 0;
        render();
      };
      if (hasContent) {
        confirmDialog("¿Cancelar la venta actual? Se perderán los productos y datos ingresados.", doCancel);
      } else {
        doCancel();
      }
    });
  }

  function renderCatalogModal() {
    const close = showModal({
      title: "Catálogo de Productos",
      size: "lg",
      body: `
        <div class="catalog-body" style="display:flex;flex-direction:column;gap:0.5rem">
          <div style="position:relative">
            <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)" aria-hidden="true">${icon("search", 16)}</span>
            <input class="input" id="catalog-search" type="search" placeholder="Buscar producto, marca o código…" value="${esc(search)}" style="padding-left:2.25rem" aria-label="Buscar producto" autocomplete="off" />
          </div>
          <div class="facet-row" id="facet-cats" role="group" aria-label="Filtrar por tipo" hidden></div>
          <div class="facet-row" id="facet-brands" role="group" aria-label="Filtrar por marca" hidden></div>
          <div id="catalog-list" style="display:flex;flex-direction:column;gap:0.5rem;max-height:55vh;overflow-y:auto;padding-right:0.25rem"></div>
        </div>
      `,
      footer: `
        <div style="flex:1;display:flex;justify-content:space-between;align-items:center">
          <span class="text-xs text-muted" id="catalog-summary">Seleccionados: Ninguno</span>
        </div>
        <button class="btn btn-outline" id="catalog-cancel">Cancelar</button>
        <button class="btn btn-primary" id="catalog-add">${icon("check", 14)} Agregar</button>
      `,
      onClose: () => { catalogOpen = false; catalogListRenderer = null; },
    });

    // v5.12.0: chips de "Tipo" y "Marca" con cuántos productos hay en cada uno
    function renderFacets() {
      const facets = buildCatalogFacets(products, catalogCategories, catalogBrands, { categoryId: catFilter, brandKey: brandFilter });
      // Si el filtro elegido ya no existe (el admin lo quitó), se vuelve a "Todos"
      if (catFilter && (catFilter === NO_CATEGORY ? !facets.uncategorized.count : !facets.categories.some((c) => c.id === catFilter))) catFilter = "";
      if (brandFilter && !facets.brands.some((b) => b.key === brandFilter)) brandFilter = "";
      const chip = (attr, val, label, count, on, emoji = "") => `
        <button type="button" class="facet-chip${on ? " is-on" : ""}${!on && count === 0 ? " is-empty" : ""}" ${attr}="${esc(val)}" aria-pressed="${on ? "true" : "false"}">
          ${emoji ? `<span class="facet-ico" aria-hidden="true">${esc(emoji)}</span>` : ""}<span class="facet-name">${esc(label)}</span><span class="facet-count">${count}</span>
        </button>`;
      const paint = (el, label, chipsHtml, show) => {
        if (!el) return;
        const keep = el.querySelector(".facet-scroll")?.scrollLeft || 0;
        el.hidden = !show;
        el.innerHTML = `<span class="facet-label">${label}</span><div class="facet-scroll">${chipsHtml}</div>`;
        const sc = el.querySelector(".facet-scroll");
        if (sc) {
          sc.scrollLeft = keep;
          sc.querySelector(".is-on")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        }
      };
      const catChips = facets.categories.length + (facets.uncategorized.count ? 1 : 0);
      paint(document.querySelector("#facet-cats"), "Tipo",
        chip("data-facet-cat", "", "Todos", filterCatalog(products, catalogCategories, { brandKey: brandFilter }).length, !catFilter) +
        facets.categories.map((c) => chip("data-facet-cat", c.id, c.name, c.countHere, catFilter === c.id, c.icon)).join("") +
        (facets.uncategorized.count ? chip("data-facet-cat", NO_CATEGORY, "Sin tipo", facets.uncategorized.countHere, catFilter === NO_CATEGORY) : ""),
        catChips >= 2 || !!catFilter);
      paint(document.querySelector("#facet-brands"), "Marca",
        chip("data-facet-brand", "", "Todas", filterCatalog(products, catalogCategories, { categoryId: catFilter }).length, !brandFilter) +
        facets.brands.map((b) => chip("data-facet-brand", b.key, b.name, b.countHere, brandFilter === b.key)).join(""),
        facets.brands.length >= 2 || !!brandFilter);
    }

    function renderCatalogList() {
      const list = document.querySelector("#catalog-list");
      if (!list) return;
      renderFacets();
      const filtered = filterCatalog(products, catalogCategories, { categoryId: catFilter, brandKey: brandFilter, search });
      if (!filtered.length) {
        const elsewhere = (catFilter || brandFilter) && search.trim()
          ? filterCatalog(products, catalogCategories, { search }).length : 0;
        list.innerHTML = `
          <div class="empty-state catalog-empty">
            <div class="empty-state-icon">${icon("search", 22)}</div>
            <p class="empty-state-title">${products.length ? "No hay productos con estos filtros" : "Todavía no hay productos"}</p>
            ${elsewhere ? `<p class="empty-state-desc">Pero «${esc(search.trim())}» aparece en otros tipos o marcas.</p>` : ""}
            <div class="flex gap-2" style="justify-content:center;flex-wrap:wrap;margin-top:0.5rem">
              ${elsewhere ? `<button type="button" class="btn btn-primary btn-sm" data-catalog-everywhere>Ver ${elsewhere} en todo el catálogo</button>` : ""}
              ${catFilter || brandFilter || search ? `<button type="button" class="btn btn-outline btn-sm" data-catalog-clear>Quitar filtros</button>` : ""}
            </div>
          </div>`;
      } else {
        const rowHtml = (p) => {
          const qty = getStockQty(p.id);
          const inCart = cart.find((i) => i.productId === p.id)?.quantity || 0;
          const isOut = qty <= 0;
          const minStock = p.minStock || 5;
          const isLow = !isOut && qty <= minStock;
          return `
          <div class="catalog-item ${isOut ? "opacity-50" : ""}" data-product-id="${esc(p.id)}" style="display:flex;align-items:center;gap:0.625rem;padding:0.625rem;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-elevated)">
            <div style="width:3rem;height:3rem;border-radius:var(--radius);overflow:hidden;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:cover" />` : icon("boxes", 20)}
            </div>
            <div style="flex:1;min-width:0">
              <div class="text-sm font-semibold truncate">${esc(p.name)}</div>
              <div class="text-xs flex items-center gap-1" style="color:var(--primary)">
                <span>${formatMoney(p.salePrice, "USD")} · Stock: ${qty}</span>
                ${isOut ? `<span class="badge badge-danger" style="font-size:0.5rem;padding:0 0.25rem">Agotado</span>` : isLow ? `<span class="badge badge-warning" style="font-size:0.5rem;padding:0 0.25rem">${icon("alertTriangle", 10)} Bajo</span>` : ''}
              </div>
            </div>
            <div class="flex items-center gap-1" style="flex-shrink:0">
              <button class="btn btn-outline btn-icon btn-sm" data-qty-dec="${esc(p.id)}" ${inCart <= 0 ? 'disabled' : ''} aria-label="Quitar una unidad de ${esc(p.name)}">${icon("minus", 12)}</button>
              <span style="width:2rem;text-align:center;font-weight:700;font-size:0.875rem" data-qty-display="${esc(p.id)}">${inCart}</span>
              <button class="btn btn-outline btn-icon btn-sm" data-qty-inc="${esc(p.id)}" ${isOut || inCart >= qty ? 'disabled' : ''} aria-label="Añadir una unidad de ${esc(p.name)}${qty ? `, quedan ${qty}` : ""}">${icon("plus", 12)}</button>
            </div>
          </div>
        `;
        };
        // v5.18.0: favoritos del almacén primero — los productos que MÁS se
        // venden en este punto (con stock) al abrir el catálogo sin filtros.
        const noFilters = !search.trim() && !catFilter && !brandFilter;
        const favs = noFilters
          ? topSellerIds
              .map((id) => products.find((p) => p.id === id))
              .filter((p) => p && getStockQty(p.id) > 0)
              .slice(0, 8)
          : [];
        const favIds = new Set(favs.map((p) => p.id));
        const rest = filtered.filter((p) => !favIds.has(p.id));
        list.innerHTML = `
          ${favs.length ? `
            <div class="catalog-fav-header">${icon("flame", 13)} Favoritos de este almacén</div>
            ${favs.map(rowHtml).join("")}
            <div class="catalog-fav-header catalog-fav-header--rest">${icon("boxes", 13)} Todos los productos</div>
          ` : ""}
          ${rest.map(rowHtml).join("")}
        `;
      }

      // Update summary
      const summary = document.querySelector("#catalog-summary");
      if (summary) {
        const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
        const totalAmount = cart.reduce((s, i) => s + i.subtotal, 0);
        summary.textContent = totalItems > 0 ? `Seleccionados: ${totalItems} · ${formatMoney(totalAmount, "USD")}` : "Seleccionados: Ninguno";
      }

      // Wire qty buttons
      document.querySelectorAll("[data-qty-inc]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pid = btn.dataset.qtyInc;
          const p = products.find((x) => x.id === pid);
          if (!p) return;
          const stockQty = getStockQty(pid);
          const existing = cart.find((i) => i.productId === pid);
          if (existing) {
            if (existing.quantity >= stockQty) { toast("Sin stock suficiente", "warning"); return; }
            existing.quantity++;
            existing.subtotal = existing.quantity * existing.unitPrice;
          } else {
            if (stockQty <= 0) return;
            cart.push({
              productId: p.id, name: p.name, brand: p.brand,
              unitPrice: p.salePrice, quantity: 1, subtotal: p.salePrice,
              gestorCommission: p.gestorCommission ?? p.commission ?? 0,
              gestorCommissionCurrency: p.gestorCommissionCurrency ?? p.commissionCurrency ?? "USD",
              vendorCommission: p.vendorCommission ?? 0,
              vendorCommissionCurrency: p.vendorCommissionCurrency ?? "MN",
            });
          }
          // v5.18.0: confirmación táctil al añadir desde el catálogo
          try { navigator.vibrate?.(30); } catch {}
          renderCatalogList();
        });
      });
      document.querySelectorAll("[data-qty-dec]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pid = btn.dataset.qtyDec;
          const existing = cart.find((i) => i.productId === pid);
          if (!existing) return;
          if (existing.quantity > 1) {
            existing.quantity--;
            existing.subtotal = existing.quantity * existing.unitPrice;
          } else {
            cart.splice(cart.indexOf(existing), 1);
          }
          renderCatalogList();
        });
      });
    }

    const searchInput = document.querySelector("#catalog-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        search = e.target.value;
        renderCatalogList();
      });
    }
    // v5.12.0: un toque en un chip filtra; tocar el que ya está elegido lo quita
    document.querySelector(".catalog-body")?.addEventListener("click", (e) => {
      const catBtn = e.target.closest("[data-facet-cat]");
      const brandBtn = e.target.closest("[data-facet-brand]");
      if (catBtn) {
        const v = catBtn.dataset.facetCat;
        catFilter = catFilter === v ? "" : v;
      } else if (brandBtn) {
        const v = brandBtn.dataset.facetBrand;
        brandFilter = brandFilter === v ? "" : v;
      } else if (e.target.closest("[data-catalog-everywhere]")) {
        catFilter = "";
        brandFilter = "";
      } else if (e.target.closest("[data-catalog-clear]")) {
        catFilter = "";
        brandFilter = "";
        search = "";
        if (searchInput) searchInput.value = "";
      } else return;
      renderCatalogList();
      list?.scrollTo?.({ top: 0 });
    });
    const list = document.querySelector("#catalog-list");
    catalogListRenderer = () => { if (document.querySelector("#catalog-list")) renderCatalogList(); };

    document.querySelector("#catalog-cancel").addEventListener("click", close);
    document.querySelector("#catalog-add").addEventListener("click", () => {
      if (cart.length === 0) { toast("Selecciona al menos un producto", "warning"); return; }
      close();
      render();
    });

    renderCatalogList();
  }

  // v5.10.0: chips "Más vendidos" (solo con stock; un toque = +1 unidad)
  function shortProductName(p) {
    const name = p.name || "";
    const brand = (p.brand || "").trim();
    return brand && name.toLowerCase().startsWith(brand.toLowerCase() + " ") ? name.slice(brand.length + 1) : name;
  }
  function renderTopSellers() {
    const tops = topSellerIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p) => p && getStockQty(p.id) > 0)
      .slice(0, 6);
    if (!tops.length) return "";
    return `
      <div class="top-sellers">
        <span class="top-sellers-label">${icon("flame", 13)} Más vendidos</span>
        <div class="top-sellers-row" role="group" aria-label="Más vendidos: toca para añadir">
          ${tops.map((p) => {
            const inCart = cart.find((i) => i.productId === p.id)?.quantity || 0;
            return `
              <button type="button" class="top-chip ${inCart ? "in-cart" : ""}" data-top-add="${esc(p.id)}" aria-label="Añadir ${esc(p.name)}${inCart ? `, ${inCart} en la venta` : ""}">
                <span class="top-chip-name">${esc(shortProductName(p))}</span>
                <span class="top-chip-meta">${formatMoney(p.salePrice, "USD")}</span>
                ${inCart ? `<span class="top-chip-qty" aria-hidden="true">${inCart}</span>` : ""}
              </button>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  // v5.10.0: escanear códigos de barras y añadir a la venta (sigue abierto para varios)
  function openSaleScanner() {
    openScanner({
      title: "Escanear productos",
      hint: "Apunta al código de barras del producto",
      continuous: true,
      onCode: (code) => {
        const p = findProductByCode(products, code);
        if (!p) return { ok: false, message: `El código ${code} no está asignado a ningún producto` };
        const ok = addProduct(p.id, { silent: true });
        const qty = cart.find((i) => i.productId === p.id)?.quantity || 0;
        return ok
          ? { ok: true, message: `+1 ${shortProductName(p)} · ${qty} en la venta` }
          : { ok: false, message: `Sin stock suficiente: ${shortProductName(p)}` };
      },
    });
  }

  // v5.4.0: productos que coinciden con la búsqueda rápida (máx 6)
  function quickMatches() {
    const q = quickSearch.toLowerCase().trim();
    if (!q) return [];
    return products
      .filter((p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q))
      .slice(0, 6);
  }

  // v5.10.0: devuelve true si añadió; también frena productos agotados que aún
  // no estaban en la venta (antes se añadían con stock 0). `silent`: sin toast.
  function addProduct(productId, { silent = false } = {}) {
    const p = products.find((x) => x.id === productId);
    if (!p) return false;
    const stockQty = getStockQty(productId);
    const existing = cart.find((i) => i.productId === productId);
    if ((existing ? existing.quantity : 0) >= stockQty) {
      if (!silent) toast("Sin stock suficiente", "warning");
      return false;
    }
    if (existing) {
      existing.quantity++;
      existing.subtotal = existing.quantity * existing.unitPrice;
    } else {
      cart.push({
        productId: p.id,
        name: p.name,
        brand: p.brand,
        unitPrice: p.salePrice,
        quantity: 1,
        subtotal: p.salePrice,
        gestorCommission: p.gestorCommission ?? p.commission ?? 0,
        gestorCommissionCurrency: p.gestorCommissionCurrency ?? p.commissionCurrency ?? "USD",
        vendorCommission: p.vendorCommission ?? 0,
        vendorCommissionCurrency: p.vendorCommissionCurrency ?? "MN",
      });
    }
    if (!silent) {
      // v5.18.0: confirmación táctil al añadir (el escáner ya vibra solo)
      try { navigator.vibrate?.(30); } catch {}
      toast(`${p.name} agregado`, "success");
    }
    render();
    return true;
  }

  // ===== v5.4.0: ticket compartible =====
  function buildTicketText(sale) {
    const lines = [];
    lines.push("MANNOL POS");
    lines.push(`Venta ${sale.code} · ${sale.warehouseName || ""}`.trimEnd());
    lines.push(new Date(sale.createdAt).toLocaleString("es-ES"));
    lines.push(`Vendedor: ${sale.userName || "—"}`);
    lines.push("--------------------------------");
    for (const i of sale.items || []) {
      const qtyLabel = i.isWholesale ? `${i.boxes} caja(s)` : `${i.quantity} u`;
      lines.push(`${qtyLabel} · ${i.name} = ${formatMoney(i.subtotal, "USD")}`);
    }
    lines.push("--------------------------------");
    const pay = sale.paymentMode === "MULTI"
      ? (sale.payments || []).map((p) => `${p.currency}: ${formatMoney(p.amount, p.currency)}`).join(" + ")
      : `${sale.currency || "USD"}: ${formatMoney(sale.totalAmount, sale.currency || "USD")}`;
    lines.push(`Pago: ${pay}`);
    lines.push(`TOTAL: ${formatMoney(sale.totalAmount, "USD")}`);
    if (sale.note) lines.push(`Nota: ${sale.note}`);
    lines.push("¡Gracias por su compra!");
    return lines.join("\n");
  }

  function showTicketModal(sale, undoSnapshot = null) {
    const text = buildTicketText(sale);
    // v5.17: «Deshacer» mientras la venta SIGA en la cola de este equipo y
    // no esté subiéndose. Si ya se subió, no se ofrece (habría que anularla
    // desde Historial con su motivo).
    // v5.18.0: la ventana es corta y SE VE — «Deshacer · 10 s» con cuenta
    // atrás; el botón se deshabilita en cuanto la venta empieza a subirse.
    const UNDO_WINDOW_MS = 10000;
    const undoDeadline = Date.now() + UNDO_WINDOW_MS;
    let undoTicker = null;
    function stopUndoTicker() {
      if (undoTicker) { clearInterval(undoTicker); undoTicker = null; }
    }
    function undoStillQueued() {
      const p = getPendingSales().find((s) => s.clientRef === sale.clientRef);
      return !!p && !p.uploading && !p.blockedReason;
    }
    const pending = getPendingSales().find((s) => s.clientRef === sale.clientRef);
    const canUndo = !!undoSnapshot && !!pending && !pending.uploading && !pending.blockedReason;
    const close = showModal({
      title: `${icon("check", 16)} Venta ${sale.code} registrada`,
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          ${navigator.onLine === false ? `<div class="pending-sync-note ticket-pending">${icon("clock", 14)} <span><strong>Pendiente de subir:</strong> guardada en este equipo. Se sube sola a <strong>${esc(sale.warehouseName || sale.warehouseCode || "")}</strong> cuando vuelva internet.</span></div>` : ""}
          <pre style="margin:0;padding:0.875rem;background:var(--bg-soft);border:1px dashed var(--border);border-radius:var(--radius);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.75rem;white-space:pre-wrap;overflow-x:auto">${esc(text)}</pre>
          <p class="text-xs text-muted" style="margin:0">Cópialo al portapapeles si necesitas pasárselo al cliente.</p>
        </div>
      `,
      footer: `
        ${canUndo ? `<button class="btn btn-ghost text-danger" id="ticket-undo">${icon("arrowLeft", 14)} Deshacer · ${Math.ceil(UNDO_WINDOW_MS / 1000)} s</button>` : ""}
        <button class="btn btn-outline" id="ticket-copy">${icon("receipt", 14)} Copiar</button>
        <button class="btn btn-primary" id="ticket-close">${icon("plus", 14)} Nueva venta</button>
      `,
      onClose: stopUndoTicker,
    });
    if (canUndo) {
      const undoBtn = document.querySelector("#ticket-undo");
      const paintUndoBtn = () => {
        if (!undoBtn) return false;
        const ok = undoStillQueued();
        const left = Math.ceil((undoDeadline - Date.now()) / 1000);
        undoBtn.disabled = !ok;
        undoBtn.innerHTML = ok && left > 0
          ? `${icon("arrowLeft", 14)} Deshacer · ${left} s`
          : `${icon("arrowLeft", 14)} Deshacer`;
        undoBtn.title = ok
          ? "La venta sigue en este equipo: se retira y vuelves a editarla"
          : "La venta ya se está subiendo o se subió: anúlala desde Historial si hace falta";
        return ok;
      };
      paintUndoBtn();
      undoTicker = setInterval(() => {
        if (!paintUndoBtn()) stopUndoTicker();
      }, 250);
    }
    document.querySelector("#ticket-close").addEventListener("click", close);
    document.querySelector("#ticket-undo")?.addEventListener("click", () => {
        const still = getPendingSales().find((s) => s.clientRef === sale.clientRef);
        if (!still || still.uploading) {
          toast("La venta ya se está subiendo o se subió: anúlala desde Historial si hace falta", "warning", 5000);
          close();
          return;
        }
        if (!discardQueuedSale(sale.id)) {
          toast("No se pudo deshacer: la venta ya no está en espera", "warning");
          close();
          return;
        }
        // Restaurar la venta tal como estaba (carrito, nota, gestor, pago…)
        undoSnapshot.restore();
        close();
        render();
        toast(`Venta ${sale.code} deshecha: sigue editándola`, "info", 3500);
      });
    document.querySelector("#ticket-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast("Ticket copiado al portapapeles", "success");
      } catch {
        toast("No se pudo copiar automáticamente", "warning");
      }
    });
  }

  // v5.13.0: evita registrar dos veces la misma venta con un doble toque
  let registering = false;
  async function handleRegister() {
    if (registering) return;
    registering = true;
    // v5.16: feedback visual y sin doble toque
    const btn = container.querySelector("#register-sale-btn");
    const prevHtml = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.textContent = "Registrando…"; }
    try {
      await doRegister();
    } catch (err) {
      // v5.16: antes un error aquí no mostraba nada y la venta no se registraba
      console.error("[Ventas] error al registrar:", err);
      toast(`No se pudo registrar la venta (${err?.message || "error inesperado"}). Revisa los datos e inténtalo de nuevo.`, "error", 7000);
    } finally {
      registering = false;
      const b = container.querySelector("#register-sale-btn");
      if (b) {
        b.removeAttribute("aria-busy");
        if (prevHtml != null && b.textContent === "Registrando…") b.innerHTML = prevHtml;
        refreshRegisterBtn();
      }
    }
  }

  async function doRegister() {
    const user = store.getState().currentUser;
    const wh = store.getState().currentWarehouse;
    const total = roundCents(cartTotal());

    // Validación según modo
    if (saleType === "WHOLESALE") {
      if (!wholesaleProduct) { toast("Selecciona un producto mayorista", "error"); return; }
      if (wholesaleBoxes < 1) { toast("La cantidad de cajas debe ser al menos 1", "error"); return; }
      if (wholesalePricePerBox <= 0) { toast("El precio por caja debe ser mayor a 0", "error"); return; }
      const stockQty = getStockQty(wholesaleProduct.id);
      const maxBoxes = Math.floor(stockQty / wholesaleProduct.unitsPerBox);
      if (wholesaleBoxes > maxBoxes) { toast(`Solo hay ${maxBoxes} cajas disponibles en stock`, "error"); return; }
    } else {
      if (cart.length === 0) { toast("Agrega productos a la venta", "error"); return; }
      // v5.16: el stock pudo cambiar mientras se armaba la venta
      const over = cart.find((i) => i.quantity > getStockQty(i.productId));
      if (over) { toast(`Stock insuficiente de «${over.name}»: quedan ${getStockQty(over.productId)}`, "error", 5000); return; }
    }

    // Validar pago (v5.16): cada moneda se guarda en SU moneda y el total se
    // compara en USD con la tasa del día (antes se guardaba el total en USD
    // como si fuera MN/EUR y el pago múltiple no se comparaba con el total).
    const rates = payRates();
    let paidUSD = 0, paidMN = 0, paidEUR = 0, paidTransfer = 0;
    let paymentLines;
    if (paymentMode === "SINGLE") {
      const native = usdToNative(total, selectedCurrency, rates);
      if (native == null) {
        toast(`No hay tasa de cambio para ${selectedCurrency}. Abre Inicio con conexión para cargarla.`, "error", 6000);
        return;
      }
      paymentLines = [{ currency: selectedCurrency, amount: native, amountUSD: total, exchangeRate: rateUSD(selectedCurrency, rates) }];
    } else {
      const sum = summarizeMultiPayment(multiPayments, total, rates);
      // v5.18.0: además del aviso, marcar en rojo el campo concreto
      if (sum.missingRates.length) {
        sum.missingRates.forEach((c) => flagField(`[data-multi-currency="${c}"]`, false));
        toast(`No hay tasa de cambio para ${sum.missingRates.join(", ")}`, "error", 6000);
        return;
      }
      if (sum.lines.length === 0) { toast("Ingresa los montos del pago", "error"); return; }
      if (sum.missingUSD > 0) { toast(`Falta cobrar ${formatMoney(sum.missingUSD, "USD")}`, "error"); return; }
      if (sum.overUSD > 0) {
        Object.keys(multiPayments).forEach((c) => {
          if ((multiPayments[c] || 0) > 0) flagField(`[data-multi-currency="${c}"]`, false);
        });
        toast(`Sobra ${formatMoney(sum.overUSD, "USD")}: ajusta los montos`, "error");
        return;
      }
      paymentLines = sum.lines;
    }
    for (const l of paymentLines) {
      if (l.currency === "USD") paidUSD = l.amount;
      else if (l.currency === "MN") paidMN = l.amount;
      else if (l.currency === "EUR") paidEUR = l.amount;
      else if (l.currency === "TRANSFERENCIA") paidTransfer = l.amount;
    }
    if (paidTransfer > 0 && !selectedCardId) {
      // v5.18.0: el foco salta a la tarjeta que falta elegir
      flagField("#card-select");
      toast("Selecciona la tarjeta de transferencia", "error");
      return;
    }

    // Calcular comisiones y items según modo
    let gestorCommissionUSD = 0, gestorCommissionMN = 0;
    let vendorCommissionUSD = 0, vendorCommissionMN = 0;
    let saleItems = [];
    // v5.13.0: el stock lo descuenta la nube al subir la venta, a partir de
    // `items` (mismo producto y cantidad) y SIEMPRE del almacén de la venta.
    let stockAdjustments = []; // [{ productId, quantity }] (referencia)

    if (saleType === "WHOLESALE") {
      // Comisión vendedor (siempre USD en mayorista)
      vendorCommissionUSD = wholesaleBoxes * wholesaleVendorCommissionPerBox;
      // Comisión gestor (siempre USD en mayorista)
      gestorCommissionUSD = wholesaleBoxes * wholesaleGestorCommissionPerBox;
      // Item "virtual": representación de la venta mayorista
      const totalUnits = wholesaleBoxes * wholesaleProduct.unitsPerBox;
      saleItems = [{
        productId: wholesaleProduct.id,
        name: wholesaleProduct.name,
        brand: wholesaleProduct.brand,
        quantity: totalUnits,
        unitPrice: wholesalePricePerBox / wholesaleProduct.unitsPerBox, // precio unitario derivado
        subtotal: total,
        isWholesale: true,
        boxes: wholesaleBoxes,
        pricePerBox: wholesalePricePerBox,
        vendorCommissionPerBox: wholesaleVendorCommissionPerBox,
        gestorCommissionPerBox: wholesaleGestorCommissionPerBox,
        gestorCommission: wholesaleGestorCommissionPerBox,
        gestorCommissionCurrency: "USD",
        vendorCommission: wholesaleVendorCommissionPerBox,
        vendorCommissionCurrency: "USD",
      }];
      stockAdjustments = [{ productId: wholesaleProduct.id, quantity: totalUnits }];
    } else {
      // Retail: comisiones via helper puro (tests/sale-commissions.test.js)
      ({
        gestorCommissionUSD,
        gestorCommissionMN,
        vendorCommissionUSD,
        vendorCommissionMN,
      } = sumCartCommissions(cart));
      saleItems = cart.map((i) => ({ ...i }));
      stockAdjustments = cart.map((i) => ({ productId: i.productId, quantity: i.quantity }));
    }

    const selectedCard = cards.find((c) => c.id === selectedCardId);

    // === Regla de fin de semana ===
    // Si hoy es sábado/domingo y el admin activó la redirección, la venta
    // se asigna al almacén configurado (ej: Vedado) en lugar del almacén
    // del vendedor. La auditoría se guarda en la venta (originalWarehouseId, etc.)
    const allWarehouses = await listWarehouses();
    const settings = store.getState().settings || {};
    const createdAt = Date.now();
    const {
      effective: effectiveWh,
      weekendRedirect,
      originalWarehouseId,
      weekendWarehouseId,
    } = resolveEffectiveWarehouse(wh, allWarehouses, settings, createdAt);

    if (weekendRedirect) {
      toast(`Venta reasignada a ${effectiveWh.name} (fin de semana)`, "info", 2500);
    }
    // Usamos effectiveWh para el stock y la venta. Si no se reasignó, effectiveWh === wh.
    const finalWh = effectiveWh;

    // v5.13.0: con la nube configurada, una venta SOLO se registra en un
    // almacén real. Antes, sin conexión, la app podía abrir con almacenes de
    // prueba y esas ventas subían después sin almacén (mezcladas).
    if (!isUuid(String(finalWh?.id || "")) && (await isSupabaseConfiguredAsync())) {
      toast("Este almacén no es válido en la nube. Sal y vuelve a entrar con el PIN (con internet al menos una vez).", "error", 7000);
      return;
    }

    // v5.13.0: código con el prefijo del almacén ("VIB-2QK8ZT7M"): no se
    // repite ni se confunde con las ventas de otros almacenes.
    const saleCode = generateSaleCode(finalWh.code);

    const sale = {
      id: generateSaleId(),
      code: saleCode,
      clientRef: null,
      warehouseId: finalWh.id,
      warehouseName: finalWh.name,
      warehouseCode: finalWh.code,
      userId: user.id,
      userName: user.displayName,
      managerId: selectedManager?.id || null,
      managerName: selectedManager?.name || null,
      managerCode: selectedManager?.code || selectedManagerCode || null,
      customerName: null,
      items: saleItems,
      totalAmount: total,
      totalUSD: total,
      payments: paymentLines,
      isMultiCurrency: paymentMode === "MULTI",
      paymentMode,
      currency: selectedCurrency,
      paidUSD, paidMN, paidEUR, paidTransfer,
      paymentMethod: (selectedCurrency === "TRANSFERENCIA" || paidTransfer > 0) ? "TRANSFERENCIA" : "EFECTIVO",
      cardId: selectedCard?.id || null,
      // v5.17: solo los ÚLTIMOS 4 dígitos se guardan (la revisión detectó el
      // número completo de tarjeta en cada venta; en la base también se
      // recortan los históricos con migration-v5.17-seguridad.sql)
      cardNumber: selectedCard ? (selectedCard.last4 || String(selectedCard.number || "").replace(/\D/g, "").slice(-4) || null) : null,
      cardName: selectedCard?.name || null,
      transferAmount: paidTransfer || transferAmount || 0,
      note: note.trim() || null,
      status: "COMPLETADA",
      gestorCommissionUSD,
      gestorCommissionMN,
      vendorCommissionUSD,
      vendorCommissionMN,
      // Campos mayorista
      saleType,
      boxes: saleType === "WHOLESALE" ? wholesaleBoxes : null,
      pricePerBox: saleType === "WHOLESALE" ? wholesalePricePerBox : null,
      vendorCommissionPerBox: saleType === "WHOLESALE" ? wholesaleVendorCommissionPerBox : null,
      gestorCommissionPerBox: saleType === "WHOLESALE" ? wholesaleGestorCommissionPerBox : null,
      // Campos de auditoría de fin de semana
      weekendRedirect,
      originalWarehouseId,
      weekendWarehouseId,
      createdAt,
      completedAt: createdAt,
      syncedAt: null, // v5.13.0: se completa al subir (cola)
    };

    // v5.13.0 — La venta se guarda PRIMERO en este equipo (cola) y después
    // se sube: con internet sube en el momento; sin internet espera y sube
    // sola al volver la conexión. Un único camino → nunca se duplica.
    sale.clientRef = generateClientRef();
    try {
      enqueueSale(sale);
    } catch (err) {
      console.error("No se pudo guardar la venta en el equipo:", err);
      toast("No se pudo guardar la venta en este equipo (sin espacio). Sube las ventas pendientes y vuelve a intentarlo.", "error", 8000);
      return;
    }
    // v5.18.0: cobraste con esta moneda → la próxima venta de este almacén
    // abre ya con ella preseleccionada.
    savePayPreference();
    const online = navigator.onLine !== false;
    toast(
      online
        ? `Venta ${sale.code} registrada${saleType === "WHOLESALE" ? " (mayorista)" : ""}${weekendRedirect ? " · " + finalWh.name : ""}`
        : `Venta ${sale.code} guardada sin conexión · se subirá sola al volver internet`,
      online ? "success" : "info",
    );
    // v5.17: copia del estado para «Deshacer» en el ticket (mientras la
    // venta siga en la cola de este equipo, se restaura todo y se retira).
    const cartBefore = cart.map((i) => ({ ...i }));
    const noteBefore = note;
    const managerCodeBefore = selectedManagerCode;
    const managerBefore = selectedManager;
    const multiBefore = { ...multiPayments };
    const transferAmountBefore = transferAmount;
    const selectedCardIdBefore = selectedCardId;
    const paidWithBefore = paidWith;
    const wholesaleProductBefore = wholesaleProduct;
    const wholesaleBoxesBefore = wholesaleBoxes;
    const wholesalePricePerBoxBefore = wholesalePricePerBox;
    const wholesaleVendorCommissionBefore = wholesaleVendorCommissionPerBox;
    const wholesaleGestorCommissionBefore = wholesaleGestorCommissionPerBox;
    const undoSnapshot = {
      restore() {
        cart = cartBefore.map((i) => ({ ...i }));
        note = noteBefore;
        selectedManagerCode = managerCodeBefore;
        selectedManager = managerBefore;
        multiPayments = { ...multiBefore };
        transferAmount = transferAmountBefore;
        selectedCardId = selectedCardIdBefore;
        paidWith = paidWithBefore;
        quickSearch = "";
        wholesaleProduct = wholesaleProductBefore;
        wholesaleBoxes = wholesaleBoxesBefore;
        wholesalePricePerBox = wholesalePricePerBoxBefore;
        wholesaleVendorCommissionPerBox = wholesaleVendorCommissionBefore;
        wholesaleGestorCommissionPerBox = wholesaleGestorCommissionBefore;
        saveDraft();
      },
    };
    showTicketModal(sale, undoSnapshot);
    // Limpiar
    cart = [];
    note = "";
    selectedManagerCode = "";
    selectedManager = null;
    multiPayments = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
    transferAmount = 0;
    selectedCardId = "";
    paidWith = 0;
    quickSearch = "";
    wholesaleProduct = null;
    wholesaleBoxes = 1;
    wholesalePricePerBox = 0;
    wholesaleVendorCommissionPerBox = 0;
    wholesaleGestorCommissionPerBox = 0;
    render();
    // Subir ya (sin espera escalonada). Si falla, queda en cola y se reintenta.
    if (online) requestSync().catch((err) => console.warn("[Ventas] subida inmediata falló:", err));
  }

  render();

  return () => {
    catalogsDisposed = true;
    teardownCheckoutBar();
    unsubProducts();
    unsubStock();
    unsubCategories();
    unsubBrands();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    unsubSync();
  };
}
