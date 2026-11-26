// =====================================================
// Sales view (POS) — rediseñado según screenshot
// Flujo: Gestor → Productos → Nota → Pago → Registrar
// =====================================================

import { normalizeAppearance, isIconView } from "../appearance.js";
import { applyVendorRuleToItems } from "../vendor-rule.js";
import { getStore } from "../store.js";
import { subscribeProducts, subscribeStock, subscribeCategories, subscribeBrands, listCards, listManagers, listSales, isUuid, getWholesaleTier, getSuggestedPricePerBox, getSuggestedVendorCommissionPerBox, getSuggestedGestorCommissionPerBox, isWholesaleProduct, listWarehouses, resolveEffectiveWarehouse, sumCartCommissions } from "../db.js";
import { formatMoney, generateSaleId, generateSaleCode, CURRENCIES, CURRENCY_LABELS, CARD_BRANDS, getRate } from "../currency.js";
import { enqueueSale, generateClientRef, requestSync, getPendingCount, getPendingSales, discardQueuedSale } from "../offline-sync.js";
import { isSupabaseConfiguredAsync } from "../supabase.js";
import { toast, actionToast, icon, showModal, closeModal, esc, confirmDialog } from "../ui.js";
import { computeTopSellers, findProductByCode } from "../sales-stats.js";
import { openScanner, canUseCamera } from "../barcode-scanner.js";
import { buildCatalogFacets, filterCatalog, NO_CATEGORY, sortOutOfStockLast } from "../catalog-facets.js";
import { roundCents, rateUSD, usdToNative, summarizeMultiPayment, billPresetsFor, normalizePaymentPreference, applyMnSurcharge, mixRestInMN, normalizeMixSurcharges } from "../payment-utils.js";
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
  let pendingReprice = false;
  let extrasOpen = false; // v5.23.0: «Gestor y nota» desplegado
  // v5.27.0 (teléfono): la venta en dos pasos — 1) armar el carrito, 2) cobrar
  let payStep = false;
  let plistBrand = ""; // v5.27.0: filtro por marca de la lista de productos
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
        // v5.21.0: «Vender de nuevo» desde el Historial → precios de HOY
        pendingReprice = !!d.reprice;
        setTimeout(() => toast(d.reprice ? `Productos de la venta ${d.fromCode || ""} cargados: revisa y cobra` : "Se recuperó la venta que tenías a medias", "info", 3500), 400);
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
  // v5.20.0: pago mixto — el resto en MN se cobra a la tasa del día MÁS un
  // recargo por cada USD (+10 / +20 MN). Se recuerda por almacén.
  // v5.21.0: los valores (+10 / +20…) y el marcado por defecto los define
  // el admin en Admin → Tasas. La elección del vendedor se recuerda por
  // almacén hasta que el admin cambie el valor por defecto.
  const mixKey = draftWh ? `mannol-mix-surcharge-v2-${draftWh.id}` : null;
  const mixCfg = () => normalizeMixSurcharges(store.getState().settings);
  let mnSurchargeChoice = null;
  try {
    const saved = mixKey ? JSON.parse(localStorage.getItem(mixKey) || "null") : null;
    if (saved && saved.def === mixCfg().def) mnSurchargeChoice = Number(saved.v);
  } catch {}
  let mnTouched = false; // el vendedor escribió el monto en MN a mano
  function currentSurcharge() {
    const cfg = mixCfg();
    return mnSurchargeChoice != null && cfg.options.includes(mnSurchargeChoice) ? mnSurchargeChoice : cfg.def;
  }
  function setMnSurcharge(v) {
    const cfg = mixCfg();
    mnSurchargeChoice = cfg.options.includes(Number(v)) ? Number(v) : cfg.def;
    try { if (mixKey) localStorage.setItem(mixKey, JSON.stringify({ v: mnSurchargeChoice, def: cfg.def })); } catch {}
  }
  /** Tasas para el pago mixto: el MN lleva el recargo por USD. */
  // Ajustes al día (recargos que pudo cambiar el admin)
  import("../db.js").then((m) => m.getSettings()).then((st) => {
    if (!st) return;
    const before = JSON.stringify(mixCfg());
    store.setSettings(st);
    if (paymentMode === "MULTI" && JSON.stringify(mixCfg()) !== before && container.isConnected) render();
  }).catch(() => {});
  function multiRates() {
    return applyMnSurcharge(payRates(), currentSurcharge());
  }
  /** MN por 1 USD (con recargo) o null sin tasa. */
  function mixUsdInMN() {
    const r = rateUSD("MN", multiRates());
    return r ? 1 / r : null;
  }
  /**
   * Calcula solo el resto en MN a partir de lo que se cobra en USD / EUR /
   * transferencia. Si el vendedor escribió el MN a mano, no se toca.
   */
  function autoFillMN() {
    if (paymentMode !== "MULTI" || mnTouched) return;
    multiPayments.MN = mixRestInMN(multiPayments, roundCents(cartTotal()), multiRates());
  }
  function paintMnAuto() {
    const inp = container.querySelector('[data-multi-currency="MN"]');
    if (inp && document.activeElement !== inp) inp.value = multiPayments.MN > 0 ? String(multiPayments.MN) : "";
    const hint = container.querySelector("#mn-rate-hint");
    if (hint) hint.innerHTML = mnRateHintHtml();
  }
  function mnRateHintHtml() {
    const base = rateUSD("MN", payRates());
    if (!base) return "Sin tasa de MN";
    const baseMN = Math.round(1 / base);
    const sc = currentSurcharge();
    return sc > 0
      ? `1 USD = <strong>${baseMN + sc} MN</strong> (${baseMN} + ${sc})`
      : `1 USD = <strong>${baseMN} MN</strong>`;
  }
  function multiSummary() {
    return summarizeMultiPayment(multiPayments, roundCents(cartTotal()), multiRates());
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
    if (focusInput && inp) { inp.focus(); try { inp.selectionStart = inp.selectionEnd = inp.value.length; } catch {} }
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
    if (pendingReprice && products.length) {
      pendingReprice = false;
      // Precio y comisiones actuales; se quitan los productos ya inexistentes
      cart = cart.filter((i) => products.some((p) => p.id === i.productId)).map((i) => {
        const p = products.find((x) => x.id === i.productId);
        const unitPrice = Number(p.salePrice) || i.unitPrice;
        return {
          ...i, name: p.name, brand: p.brand, unitPrice, subtotal: unitPrice * i.quantity,
          gestorCommission: p.gestorCommission ?? p.commission ?? 0,
          gestorCommissionCurrency: p.gestorCommissionCurrency ?? p.commissionCurrency ?? "USD",
          vendorCommission: p.vendorCommission ?? 0,
          vendorCommissionCurrency: p.vendorCommissionCurrency ?? "MN",
        };
      });
      setTimeout(() => { if (container.isConnected) render(); }, 0);
    }
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

    if (!hasCheckoutItems()) payStep = false;
    saveDraft();
    autoFillMN(); // v5.20.0: el resto en MN sigue al total y a lo cobrado en USD
    container.innerHTML = `
      <div class="sale-form-panel" data-step="${payStep && hasCheckoutItems() ? "pay" : "cart"}" style="display:flex;flex-direction:column;gap:1rem">
        <div class="sale-head">
          <!-- v5.20.0: volver sin tener que tocar «Inicio» · v5.27.0: en el paso de cobro vuelve al carrito -->
          <button type="button" class="btn btn-secondary btn-icon sale-back" id="sales-back-btn" aria-label="Volver" title="Volver">${icon("arrowLeft", 18)}</button>
          <button type="button" class="btn btn-secondary btn-icon sale-back-cart" id="sale-back-cart" aria-label="Volver a los productos" title="Volver a los productos">${icon("arrowLeft", 18)}</button>
          <h1 class="sale-title">${payStep && hasCheckoutItems() ? "Cobrar" : "Nueva venta"} <span class="sale-title-wh">${esc(wh.name)}</span></h1>
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

        <!-- v5.27.0 (paso 2): resumen de lo que se cobra, con «Cambiar» -->
        <button type="button" class="sale-pay-summary sale-pay-part" id="sale-pay-summary">
          <span>${checkoutCountLabel()}</span>
          <strong>${formatMoney(cartTotal(), "USD")}</strong>
          <span class="sale-pay-change">Cambiar</span>
        </button>

        <!-- Toggle Retail / Mayorista -->
        <div class="tabs-list sale-cart-part" style="grid-template-columns: 1fr 1fr;margin-bottom:0">
          <button class="tabs-trigger ${saleType === 'RETAIL' ? 'active' : ''}" data-sale-type="RETAIL">
            ${icon("cart", 14)} Por unidad
          </button>
          <button class="tabs-trigger ${saleType === 'WHOLESALE' ? 'active' : ''}" data-sale-type="WHOLESALE">
            ${icon("boxes", 14)} Mayorista · caja
          </button>
        </div>

        ${saleType === "WHOLESALE" ? `<div class="sale-cart-part">${renderWholesaleSection()}</div>` : `
        <div class="sale-cart-part sale-retail">
          <!-- v5.27.0: catálogo (botón de color), búsqueda rápida y más vendidos -->
          <section class="card sale-products" aria-label="Productos">
            <div class="card-header sp-head">
              <h3 class="card-title">Productos</h3>
            </div>
            <div class="sp-body">
              <!-- v5.27.0: catálogo y escáner, mitad y mitad -->
              <div class="sp-actions ${canUseCamera() ? "has-scan" : ""}">
              <button type="button" class="btn btn-primary btn-lg sp-catalog-btn" id="open-catalog-btn">
                <span class="flex items-center gap-2">${icon("boxes", 22)} Abrir catálogo</span>
                <span class="sp-catalog-n" data-catalog-badge>${products.filter((p) => getStockQty(p.id) > 0).length} disponibles</span>
              </button>
                ${canUseCamera() ? `<button type="button" class="btn btn-primary btn-lg sp-scan-btn" id="scan-sale-btn" aria-label="Escanear código de barras">${icon("scan", 22)} Escanear</button>` : ""}
              </div>
          <div style="position:relative">
            <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 14)}</span>
            <input class="input" id="quick-search" placeholder="Buscar: 5W-30, grasa, filtro…" value="${esc(quickSearch)}" style="padding-left:2.1rem" autocomplete="off" />

            <!-- v5.19.0: contenedor fijo — los resultados los pinta paintQuickResults()
                 (antes cada tecla re-renderizaba TODO y había que devolver el foco a mano) -->
            <div id="quick-results" style="position:absolute;left:0;right:0;top:calc(100% + 0.25rem);z-index:30;display:none;flex-direction:column;gap:0.25rem;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-lg);padding:0.375rem;box-shadow:var(--shadow-md);max-height:16rem;overflow-y:auto"></div>
          </div>
              <!-- v5.27.0: los productos se ven al abrir el catálogo; aquí solo
                   los más vendidos para añadir con un toque -->
              <div data-top-sellers-zone></div>
            </div>
          </section>
          <!-- v5.27.0: lo que va en la venta (cantidad editable, quitar) -->
          ${cart.length ? `
            <section class="card sale-incart" aria-label="En la venta">
              <div class="card-header sp-head">
                <h3 class="card-title">En la venta</h3>
                <span class="sp-head-meta">${cart.reduce((n, i) => n + i.quantity, 0)} u · <strong>${formatMoney(cartTotal(), "USD")}</strong></span>
              </div>
              <div class="sale-incart-list">
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
              </div>
            </section>` : ""}
        </div>
        `}

        <!-- v5.23.0: opcionales plegados (gestor en menudeo + nota) para no distraer -->
        <details class="sale-extras sale-cart-part" data-sale-extras ${extrasOpen || note ? "open" : ""}>
          <summary>
            <span class="flex items-center gap-1">${icon("users", 14)} Gestor y nota <span class="text-muted" style="font-weight:500">(opcional)</span></span>
            <span class="sale-extras-sum">${[selectedManager ? esc(selectedManager.name) : "", note ? "con nota" : ""].filter(Boolean).join(" · ")}</span>
          </summary>
          <div style="display:flex;flex-direction:column;gap:0.75rem;padding-top:0.625rem">
            ${`
            <div>
              <label class="label" for="manager-code">Gestor que refirió</label>
              <select class="select" id="manager-code">${managerOptionsHtml()}</select>
              ${selectedManager ? `<p class="text-xs text-muted mt-1">${esc(selectedManager.name)}${selectedManager.code ? ` · Código: ${esc(selectedManager.code)}` : ''}${selectedManager.phone ? ` · ${esc(selectedManager.phone)}` : ''}</p>` : ''}
            </div>`}
            <div>
              <label class="label flex items-center gap-1" for="note-input">${icon("receipt", 14)} Nota / Observaciones</label>
              <textarea class="textarea" id="note-input" placeholder="Ej: cliente frecuente, datos de envío, acuerdo de pago, descripción del vehículo..." maxlength="500" style="min-height:4rem">${note}</textarea>
              <div class="text-xs text-muted text-right mt-1" id="note-counter">${note.length}/500</div>
            </div>
          </div>
        </details>

        ${(saleType === "WHOLESALE" ? wholesaleProduct : cart.length > 0) ? `
          <!-- Selector de modo de pago -->
          <div id="payment-section" class="sale-pay-part">
            <div class="sale-step"><span class="sale-step-n">2</span><span>Cobro</span><span class="sale-step-meta">${formatMoney(cartTotal(), "USD")}</span></div>
            <div class="tabs-list" style="grid-template-columns: 1fr 1fr;margin-bottom:0.75rem">
              <button class="tabs-trigger ${paymentMode === 'SINGLE' ? 'active' : ''}" data-mode="SINGLE">Una moneda</button>
              <button class="tabs-trigger ${paymentMode === 'MULTI' ? 'active' : ''}" data-mode="MULTI">Pago mixto</button>
            </div>

            ${paymentMode === 'SINGLE' ? `
              <div class="grid grid-cols-2 gap-2">
                ${CURRENCIES.map((curr) => `
                  <button class="payment-card ${selectedCurrency === curr ? 'selected' : ''}" data-currency="${curr}" style="display:flex;align-items:center;gap:0.75rem;padding:1rem;border:2px solid ${selectedCurrency === curr ? CURRENCY_META[curr].color : 'var(--border)'};border-radius:var(--radius-lg);background:${selectedCurrency === curr ? `color-mix(in oklab, ${CURRENCY_META[curr].color} 12%, var(--bg-elevated))` : 'var(--bg-elevated)'};cursor:pointer;text-align:left">
                    <span style="font-size:1.5rem;font-weight:700;color:${CURRENCY_META[curr].color}">${CURRENCY_META[curr].icon}</span>
                    <div>
                      <div class="font-semibold text-sm">${curr === "TRANSFERENCIA" ? "TRANSF." : curr}</div>
                      <div class="text-xs text-muted">${CURRENCY_META[curr].label}</div>
                    </div>
                  </button>
                `).join("")}
              </div>
            ` : `
              <!-- v5.20.0: recargo por USD cuando el resto se cobra en MN -->
              ${mixCfg().options.length > 1 ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem">
                <span class="text-xs text-muted">Resto en MN con recargo por USD:</span>
                <div class="seg-group" role="group" aria-label="Recargo por USD al cobrar en MN">
                  ${mixCfg().options.map((v) => `<button type="button" class="seg ${currentSurcharge() === v ? 'seg-on' : ''}" data-mix-surcharge="${v}" aria-pressed="${currentSurcharge() === v}">${v === 0 ? 'Tasa' : '+' + v}</button>`).join("")}
                </div>
              </div>` : ""}
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
                    ${curr === "MN" ? `<div class="text-xs text-muted" id="mn-rate-hint" style="margin-top:0.25rem">${mnRateHintHtml()}</div>` : ""}
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
          <div class="card sale-pay-part" style="padding:1rem;display:flex;justify-content:space-between;align-items:center">
            <span class="flex items-center gap-2 font-semibold">${icon("dollar", 18)} Total a cobrar</span>
            <span class="text-2xl font-bold" style="color:var(--primary)">${formatMoney(cartTotal(), "USD")}</span>
          </div>

          <!-- v5.4.0: calculadora de vuelto (efectivo en una sola moneda) -->
          ${paymentMode === "SINGLE" && selectedCurrency !== "TRANSFERENCIA" ? `
            <div class="card sale-pay-part" style="padding:0.875rem 1rem">
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
          <div class="sale-pay-part" style="display:flex;flex-direction:column;gap:0.5rem">
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
            Cobrar ${icon("arrowRight", 16)}
          </button>
        </div>
      ` : ''}
    `;

    wireEvents();
    paintHeaderBadges();
    paintQuickResults();
    paintTopSellers();
    paintProductList();
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
    if (!quickSearch.trim() || container.querySelector("#sale-plist")) { // v5.27.0: la lista ya filtra
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

  // v5.27.0: lista de productos a la vista (sustituye a «Más vendidos» +
  // «Abrir catálogo»). Se repinta sola al escribir, sin perder el foco.
  function plistMatches() {
    const q = quickSearch.toLowerCase().trim();
    const rank = new Map(topSellerIds.map((id, i) => [id, i]));
    const list = products.filter((p) => {
      if (plistBrand && (p.brand || "Sin marca") !== plistBrand) return false;
      if (!q) return true;
      return [p.name, p.brand, p.sku, p.viscosity].some((v) => String(v || "").toLowerCase().includes(q));
    });
    list.sort((a, b) => {
      const ao = getStockQty(a.id) <= 0, bo = getStockQty(b.id) <= 0;
      if (ao !== bo) return ao ? 1 : -1;
      const ra = rank.has(a.id) ? rank.get(a.id) : 999, rb = rank.has(b.id) ? rank.get(b.id) : 999;
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name), "es");
    });
    return list;
  }
  function paintProductList() {
    const el = container.querySelector("#sale-plist");
    if (!el) return;
    const chipsEl = container.querySelector("#sp-chips");
    if (chipsEl) {
      const brands = [...new Set(products.map((p) => p.brand || "Sin marca"))].sort((a, b) => a.localeCompare(b, "es"));
      chipsEl.hidden = brands.length < 2;
      chipsEl.innerHTML = ["", ...brands].map((b) => `
        <button type="button" class="sp-chip ${plistBrand === b ? "on" : ""}" data-plist-brand="${esc(b)}" aria-pressed="${plistBrand === b}">${b ? esc(b) : "Todas"}</button>`).join("");
      chipsEl.querySelectorAll("[data-plist-brand]").forEach((btn) => btn.addEventListener("click", () => {
        plistBrand = btn.dataset.plistBrand; paintProductList();
      }));
    }
    const top = new Set(topSellerIds.slice(0, 6));
    const list = plistMatches();
    el.innerHTML = list.length === 0
      ? `<div class="sp-empty">Sin resultados${quickSearch ? ` para «${esc(quickSearch)}»` : ""}.</div>`
      : list.map((p) => {
          const qty = getStockQty(p.id);
          const inCart = cart.find((i) => i.productId === p.id)?.quantity || 0;
          const left = qty - inCart;
          const out = qty <= 0;
          const low = !out && qty <= (p.minStock || 5);
          const sub = [p.brand, p.viscosity, p.volumeLiters ? `${p.volumeLiters} L` : ""].filter(Boolean).join(" · ");
          return `
          <div class="sp-row ${inCart ? "in-cart" : ""} ${out ? "is-out" : ""}">
            <div class="sp-info">
              <div class="sp-name">${top.has(p.id) && !out ? `<span class="sp-top" title="Más vendido">★</span>` : ""}${esc(p.name)}</div>
              <div class="sp-sub">${sub ? `${esc(sub)} · ` : ""}<span class="${out ? "sp-out" : low ? "sp-low" : ""}">${out ? "Agotado" : `quedan ${qty}`}</span></div>
            </div>
            <div class="sp-price">${formatMoney(p.salePrice, "USD")}</div>
            ${inCart ? `
              <div class="sp-step">
                <button type="button" class="btn btn-secondary btn-icon" data-plist-dec="${esc(p.id)}" aria-label="Quitar uno de ${esc(p.name)}">${icon("minus", 16)}</button>
                <span class="sp-qty" aria-label="${inCart} en la venta">${inCart}</span>
                <button type="button" class="btn btn-primary btn-icon" data-plist-add="${esc(p.id)}" ${left <= 0 ? "disabled" : ""} aria-label="Añadir otro ${esc(p.name)}">${icon("plus", 16)}</button>
              </div>` : `
              <button type="button" class="btn btn-secondary btn-icon sp-add" data-plist-add="${esc(p.id)}" ${out ? "disabled" : ""} aria-label="Añadir ${esc(p.name)}">${icon("plus", 18)}</button>`}
          </div>`;
        }).join("");
    el.querySelectorAll("[data-plist-add]").forEach((btn) => btn.addEventListener("click", () => {
      try { navigator.vibrate?.(25); } catch {}
      addProduct(btn.dataset.plistAdd, { silent: false, quiet: true });
    }));
    el.querySelectorAll("[data-plist-dec]").forEach((btn) => btn.addEventListener("click", () => {
      const idx = cart.findIndex((i) => i.productId === btn.dataset.plistDec);
      if (idx < 0) return;
      const it = cart[idx];
      if (it.quantity > 1) { it.quantity--; it.subtotal = it.quantity * it.unitPrice; } else cart.splice(idx, 1);
      render();
    }));
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
    paintProductList();
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
    return `${units} producto${units === 1 ? "" : "s"}`;
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
      // v5.27.0 (teléfono): el cobro es un paso propio
      if (window.matchMedia?.("(max-width: 1023.98px)").matches) {
        payStep = true;
        render();
        try { window.scrollTo({ top: 0 }); } catch {}
        return;
      }
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
      const suggestedGestor = getSuggestedGestorCommissionPerBox(wholesaleProduct, wholesaleBoxes, wholesalePricePerBox || null);
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
    // v5.27.0: elegir el producto en tarjetas (antes un desplegable largo) y
    // las cajas con − n +; los tramos de precio a la vista; comisiones plegadas.
    const tiers = wholesaleProduct ? [...(wholesaleProduct.wholesaleTiers || [])].sort((a, b) => a.minBoxes - b.minBoxes) : [];
    const ppb = (t) => (Number(t.pricePerUnit) || 0) * (wholesaleProduct?.unitsPerBox || 0);
    const suggested = wholesaleProduct ? (getSuggestedPricePerBox(wholesaleProduct, wholesaleBoxes) || 0) : 0;
    const pickList = wholesaleProducts.map((p) => {
      const q = getStockQty(p.id);
      const boxes = p.unitsPerBox ? Math.floor(q / p.unitsPerBox) : 0;
      const first = [...(p.wholesaleTiers || [])].sort((a, b) => a.minBoxes - b.minBoxes)[0];
      const from = first ? (Number(first.pricePerUnit) || 0) * p.unitsPerBox : 0;
      return `
        <button type="button" class="ws-pick ${wholesaleProduct?.id === p.id ? "on" : ""}" data-ws-pick="${esc(p.id)}" ${boxes <= 0 ? "disabled" : ""} aria-pressed="${wholesaleProduct?.id === p.id}">
          <span class="ws-pick-info">
            <span class="ws-pick-name">${esc(p.name)}</span>
            <span class="ws-pick-sub">${p.unitsPerBox} pomos por caja · ${boxes > 0 ? `<strong>${boxes} caja${boxes === 1 ? "" : "s"}</strong> disponibles` : `<span class="sp-out">sin cajas completas</span>`}</span>
          </span>
          ${from ? `<span class="ws-pick-price"><small>desde</small>${formatMoney(from, "USD")}<small>/caja</small></span>` : ""}
        </button>`;
    }).join("");
    return `
      ${!wholesaleProduct ? `
        <section class="card ws-card" aria-label="Producto por caja">
          <div class="card-header sp-head"><h3 class="card-title">¿Qué producto se vende por caja?</h3></div>
          <div class="ws-pick-list">${pickList}</div>
        </section>
      ` : `
        <section class="card ws-card" aria-label="Venta por caja">
          <div class="card-header sp-head">
            <h3 class="card-title" style="min-width:0"><span class="truncate">${esc(wholesaleProduct.name)}</span></h3>
            <button type="button" class="btn btn-text btn-sm" data-ws-change>Cambiar</button>
          </div>
          <div class="ws-body">
            <div class="ws-facts">
              <span><strong>${wholesaleProduct.unitsPerBox}</strong> pomos por caja</span>
              <span data-ws-stock><strong>${maxBoxes}</strong> cajas disponibles (${stockQty} pomos)</span>
            </div>

            <div class="ws-boxes">
              <span class="ws-boxes-label">Cajas</span>
              <div class="ws-boxes-ctrl">
                <button type="button" class="btn btn-secondary btn-icon" data-ws-step="-1" ${wholesaleBoxes <= 1 ? "disabled" : ""} aria-label="Una caja menos">${icon("minus", 18)}</button>
                <input class="input ws-boxes-input" type="number" min="1" max="${maxBoxes}" id="wholesale-boxes" value="${wholesaleBoxes}" inputmode="numeric" aria-label="Cantidad de cajas" />
                <button type="button" class="btn btn-primary btn-icon" data-ws-step="1" ${wholesaleBoxes >= maxBoxes ? "disabled" : ""} aria-label="Una caja más">${icon("plus", 18)}</button>
              </div>
              <span class="ws-boxes-units">${totalUnits} pomos</span>
            </div>

            ${tiers.length ? `
              <div class="ws-tiers" role="list" aria-label="Precios por cantidad">
                ${tiers.map((t) => {
                  const on = tier && t.minBoxes === tier.minBoxes;
                  return `
                  <div class="ws-tier ${on ? "on" : ""}" role="listitem">
                    <span class="ws-tier-range">${t.minBoxes}${t.maxBoxes ? `–${t.maxBoxes}` : "+"} cajas</span>
                    <strong>${formatMoney(ppb(t), "USD")}</strong><span class="ws-tier-unit">/caja</span>
                    ${Number(t.gestorCommissionPercent) > 0 ? `<span class="ws-tier-note">gestor ${t.gestorCommissionPercent}%</span>` : ""}
                  </div>`;
                }).join("")}
              </div>` : ""}

            <label class="ws-price">
              <span>Precio por caja (USD)</span>
              <input class="input" type="number" step="0.01" id="wholesale-price" value="${wholesalePricePerBox}" inputmode="decimal" />
              ${suggested && Math.abs(suggested - wholesalePricePerBox) > 0.001 ? `<button type="button" class="btn btn-text btn-sm" data-ws-suggested="${suggested}">Usar ${formatMoney(suggested, "USD")}</button>` : `<small>Precio del tramo</small>`}
            </label>

            <details class="ws-comm">
              <summary>Comisiones <span>vendedor ${formatMoney(wholesaleBoxes * wholesaleVendorCommissionPerBox, "USD")} · gestor ${formatMoney(wholesaleBoxes * wholesaleGestorCommissionPerBox, "USD")}</span></summary>
              <div class="grid grid-cols-2 gap-2" style="padding-top:0.625rem">
                <div>
                  <label class="label label-xs" for="wholesale-vendor-commission">Vendedor por caja (USD)</label>
                  <input class="input" type="number" step="0.01" id="wholesale-vendor-commission" value="${wholesaleVendorCommissionPerBox}" />
                </div>
                <div>
                  <label class="label label-xs" for="wholesale-gestor-commission">Gestor por caja (USD)</label>
                  <input class="input" type="number" step="0.01" id="wholesale-gestor-commission" value="${wholesaleGestorCommissionPerBox}" />
                  ${Number(tier?.gestorCommissionPercent) > 0 ? `<div class="text-xs text-muted mt-1">${tier.gestorCommissionPercent}% del precio de la caja</div>` : ""}
                </div>
              </div>
            </details>

            <div class="ws-total">
              <span>${wholesaleBoxes} caja${wholesaleBoxes === 1 ? "" : "s"} × ${formatMoney(wholesalePricePerBox, "USD")}</span>
              <strong>${formatMoney(total, "USD")}</strong>
            </div>
          </div>
        </section>
      `}
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

    // v5.27.0: mayorista — elegir producto, cambiar, − / + cajas, precio sugerido
    container.querySelectorAll("[data-ws-pick]").forEach((btn) => btn.addEventListener("click", () => {
      wholesaleProduct = products.find((p) => p.id === btn.dataset.wsPick) || null;
      wholesaleBoxes = 1;
      wholesalePricePerBox = 0;
      wholesaleVendorCommissionPerBox = 0;
      wholesaleGestorCommissionPerBox = 0;
      render();
    }));
    container.querySelector("[data-ws-change]")?.addEventListener("click", () => {
      wholesaleProduct = null;
      render();
    });
    container.querySelectorAll("[data-ws-step]").forEach((btn) => btn.addEventListener("click", () => {
      const q = wholesaleProduct ? getStockQty(wholesaleProduct.id) : 0;
      const maxB = wholesaleProduct?.unitsPerBox ? Math.floor(q / wholesaleProduct.unitsPerBox) : 1;
      const next = Math.min(Math.max(1, wholesaleBoxes + Number(btn.dataset.wsStep)), Math.max(1, maxB));
      if (next === wholesaleBoxes) return;
      wholesaleBoxes = next;
      wholesalePricePerBox = 0;
      wholesaleVendorCommissionPerBox = 0;
      wholesaleGestorCommissionPerBox = 0;
      render();
    }));
    container.querySelector("[data-ws-suggested]")?.addEventListener("click", (e) => {
      wholesalePricePerBox = Number(e.currentTarget.dataset.wsSuggested) || 0;
      if (Number(getWholesaleTier(wholesaleProduct, wholesaleBoxes)?.gestorCommissionPercent) > 0) wholesaleGestorCommissionPerBox = 0;
      render();
    });

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
        // v5.26.0: gestor en % → se recalcula con el precio nuevo
        if (Number(getWholesaleTier(wholesaleProduct, wholesaleBoxes)?.gestorCommissionPercent) > 0) wholesaleGestorCommissionPerBox = 0;
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
        paintProductList();
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
        // v5.20.0: escribir USD/EUR/transf. calcula solo el resto en MN.
        // Si el MN se escribe a mano, manda el vendedor (vacío = automático otra vez).
        if (curr === "MN") mnTouched = multiPayments.MN > 0;
        else { autoFillMN(); paintMnAuto(); }
        refreshMultiStatus();
      });
    });
    container.querySelectorAll("[data-mix-surcharge]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMnSurcharge(btn.dataset.mixSurcharge);
        mnTouched = false; // con el nuevo recargo se recalcula el resto en MN
        render();
      });
    });
    container.querySelectorAll("[data-multi-rest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const curr = btn.dataset.multiRest;
        const others = { ...multiPayments, [curr]: 0 };
        const sum = summarizeMultiPayment(others, roundCents(cartTotal()), multiRates());
        if (sum.missingUSD <= 0) { toast("Ya está completo: no falta nada por cobrar", "info", 2500); return; }
        let native = usdToNative(sum.missingUSD, curr, multiRates());
        if (native == null) { toast(`No hay tasa de cambio para ${curr}`, "error"); return; }
        if (curr === "MN") { native = Math.ceil(native - 1e-9); mnTouched = true; }
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

    container.querySelector("[data-sale-extras]")?.addEventListener("toggle", (e) => { extrasOpen = e.currentTarget.open; });
    const backToCart = () => { payStep = false; render(); try { window.scrollTo({ top: 0 }); } catch {} };
    container.querySelector("#sale-back-cart")?.addEventListener("click", backToCart);
    container.querySelector("#sale-pay-summary")?.addEventListener("click", backToCart);
    container.querySelector("#sales-back-btn")?.addEventListener("click", () => {
      // El carrito a medias queda guardado (borrador) y se recupera al volver
      window.dispatchEvent(new CustomEvent("mannol:nav", { detail: { view: "dashboard" } }));
    });

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
          <div id="catalog-list" class="catalog-list"></div>
        </div>
      `,
      footer: `
        <div style="flex:1;display:flex;justify-content:space-between;align-items:center">
          <span class="text-xs text-muted" id="catalog-summary">Toca + para añadir</span>
        </div>
        <button class="btn btn-primary" id="catalog-add">${icon("check", 14)} Listo</button>
      `,
      // v5.27.0: el «+» ya añade a la venta; al cerrar (como sea) se pinta la venta
      onClose: () => { catalogOpen = false; catalogListRenderer = null; render(); },
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
        // v5.25.0: vista elegida en «Apariencia» del almacén
        // v5.27.0: vistas como el menú «Ver» de Windows (iconos muy grandes … detalles)
        const view = normalizeAppearance({ catalogView: document.documentElement.getAttribute("data-catalog-view") }).catalogView;
        const asCards = isIconView(view);
        list.classList.toggle("as-cards", asCards);
        ["xlarge", "large", "medium", "small"].forEach((v) => list.classList.toggle(`view-${v}`, view === v));
        const favSet = new Set(topSellerIds.slice(0, 8));
        const rowHtml = (p) => {
          const qty = getStockQty(p.id);
          const inCart = cart.find((i) => i.productId === p.id)?.quantity || 0;
          const isOut = qty <= 0;
          const minStock = p.minStock || 5;
          const isLow = !isOut && qty <= minStock;
          return `
          ${asCards ? `
          <div class="catalog-item catalog-tile ${isOut ? "is-out" : ""} ${inCart > 0 ? "in-cart" : ""}" data-product-id="${esc(p.id)}">
            <div class="ct-pic cr-pic">
              ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" />` : icon("droplet", view === "small" ? 20 : view === "xlarge" ? 44 : 30)}
              ${favSet.has(p.id) ? `<span class="ct-flag ct-fav">Más vendido</span>` : ""}
              ${isOut ? `<span class="ct-flag ct-stock ct-out">Agotado</span>` : isLow ? `<span class="ct-flag ct-stock">Quedan ${qty}</span>` : ""}
            </div>
            <div class="ct-body cr-body">
              <div class="ct-name">${esc(p.name)}</div>
              <div class="ct-sub">${esc([p.brand, p.viscosity, p.volumeLiters ? `${p.volumeLiters} L` : ""].filter(Boolean).join(" · ") || `Stock ${qty}`)}</div>
            </div>
            <div class="ct-price">${formatMoney(p.salePrice, "USD")}</div>
            ${inCart > 0 ? `
              <div class="ct-stepper">
                <button class="btn btn-outline btn-icon" data-qty-dec="${esc(p.id)}" aria-label="Quitar una unidad de ${esc(p.name)}">${icon("minus", 14)}</button>
                <span class="cr-qty" data-qty-display="${esc(p.id)}">${inCart}</span>
                <button class="btn btn-primary btn-icon" data-qty-inc="${esc(p.id)}" ${inCart >= qty ? "disabled" : ""} aria-label="Añadir una unidad de ${esc(p.name)}">${icon("plus", 16)}</button>
              </div>` : `
              <button class="ct-add" data-qty-inc="${esc(p.id)}" ${isOut ? "disabled" : ""} aria-label="Agregar ${esc(p.name)}">${isOut ? "Agotado" : view === "small" ? "+" : "+ Agregar"}</button>`}
          </div>` : `
          <div class="catalog-item catalog-row ${isOut ? "is-out" : ""} ${inCart > 0 ? "in-cart" : ""}" data-product-id="${esc(p.id)}">
            <div class="cr-pic" aria-hidden="true">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy" />` : icon("boxes", 18)}</div>
            <div class="cr-body">
              <div class="cr-name">${esc(p.name)}</div>
              <div class="cr-meta"><strong>${formatMoney(p.salePrice, "USD")}</strong>
                ${isOut ? `<span class="cr-tag cr-out">Agotado</span>` : isLow ? `<span class="cr-tag cr-low">Quedan ${qty}</span>` : `<span class="cr-stock">Stock ${qty}</span>`}</div>
            </div>
            <div class="cr-ctrl">
              ${inCart > 0 ? `<button class="btn btn-outline btn-icon" data-qty-dec="${esc(p.id)}" aria-label="Quitar una unidad de ${esc(p.name)}">${icon("minus", 14)}</button>
              <span class="cr-qty" data-qty-display="${esc(p.id)}">${inCart}</span>` : ""}
              <button class="btn btn-primary btn-icon" data-qty-inc="${esc(p.id)}" ${isOut || inCart >= qty ? 'disabled' : ''} aria-label="Añadir una unidad de ${esc(p.name)}${qty ? `, quedan ${qty}` : ""}">${icon("plus", 16)}</button>
            </div>
          </div>
          `}
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
        // v5.20.0: los agotados al final de la lista
        const rest = sortOutOfStockLast(filtered.filter((p) => !favIds.has(p.id)), (p) => getStockQty(p.id));
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
        summary.textContent = totalItems > 0 ? `En la venta: ${totalItems} · ${formatMoney(totalAmount, "USD")}` : "Toca + para añadir";
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
      // v5.22.0: tocar la foto o el nombre también añade una unidad
      document.querySelectorAll("#catalog-list .catalog-item:not(.is-out) .cr-pic, #catalog-list .catalog-item:not(.is-out) .cr-body").forEach((el) => {
        el.addEventListener("click", () => el.closest(".catalog-item")?.querySelector("[data-qty-inc]:not([disabled])")?.click());
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

    document.querySelector("#catalog-add").addEventListener("click", () => close());

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
    const found = products
      .filter((p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q));
    // v5.20.0: primero lo que se puede vender; los agotados al final
    return sortOutOfStockLast(found, (p) => getStockQty(p.id)).slice(0, 6);
  }

  // v5.10.0: devuelve true si añadió; también frena productos agotados que aún
  // no estaban en la venta (antes se añadían con stock 0). `silent`: sin toast.
  function addProduct(productId, { silent = false, quiet = false } = {}) {
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
    if (!silent && !quiet) {
      // v5.18.0: confirmación táctil al añadir (el escáner ya vibra solo)
      try { navigator.vibrate?.(30); } catch {}
      toast(`${p.name} agregado`, "success");
    }
    render();
    return true;
  }

  // v5.22.0: confirmación visual grande (medio segundo, no bloquea)
  function flashSaleDone(sale) {
    try {
      const el = document.createElement("div");
      el.className = "sale-done-flash";
      el.setAttribute("role", "status");
      el.innerHTML = `<div class="sdf-ring">${icon("check", 44)}</div><div class="sdf-txt">Venta registrada</div><div class="sdf-sub">${esc(sale.code)} · ${formatMoney(sale.totalAmount, "USD")}</div>`;
      document.body.appendChild(el);
      el.addEventListener("click", () => el.remove());
      setTimeout(() => el.classList.add("out"), 900);
      setTimeout(() => el.remove(), 1200);
    } catch {}
  }

  function showUndoToast(sale, undoSnapshot, message, type) {
    flashSaleDone(sale);
    actionToast(message, {
      type,
      actionLabel: "Deshacer",
      duration: 8000,
      onAction: () => {
        const still = getPendingSales().find((x) => x.clientRef === sale.clientRef);
        if (!still || still.uploading || !discardQueuedSale(sale.id)) {
          toast("La venta ya se subió: anúlala desde Historial si hace falta", "warning", 5000);
          return;
        }
        undoSnapshot.restore();
        render();
        toast(`Venta ${sale.code} deshecha: sigue editándola`, "info", 3500);
      },
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
      const sum = summarizeMultiPayment(multiPayments, total, multiRates());
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
      // v5.20.0: queda constancia del recargo aplicado al MN
      const sc = currentSurcharge();
      paymentLines = sum.lines.map((l) => (l.currency === "MN" && sc > 0 ? { ...l, surchargeMNPerUSD: sc } : l));
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
      // v5.26.0: el vendedor cobra POR VENTA (regla de Admin → Comisiones vendedores)
      const ruled = applyVendorRuleToItems(saleItems, total, store.getState().settings?.vendorSaleRule);
      saleItems = ruled.items;
      if (ruled.vendorUSD !== null) { vendorCommissionUSD = ruled.vendorUSD; vendorCommissionMN = 0; }
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
      // v5.26.0: almacén con dos vendedores (cada uno con su PIN): quién vendió
      sellerSlot: user.sellerSlot === 1 || user.sellerSlot === 2 ? user.sellerSlot : null,
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
    const doneMsg = online
      ? `Venta ${sale.code} registrada${saleType === "WHOLESALE" ? " (mayorista)" : ""}${weekendRedirect ? " · " + finalWh.name : ""}`
      : `Venta ${sale.code} guardada sin conexión · se subirá sola al volver internet`;
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
        mnTouched = (multiBefore.MN || 0) > 0;
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
    // v5.20.0: sin ventana de «Compartir / Copiar / Cerrar» — solo un aviso
    // que no bloquea, con «Deshacer» unos segundos. Se sigue vendiendo al momento.
    showUndoToast(sale, undoSnapshot, doneMsg, online ? "success" : "info");
    // Limpiar
    cart = [];
    note = "";
    selectedManagerCode = "";
    selectedManager = null;
    multiPayments = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
    mnTouched = false;
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
