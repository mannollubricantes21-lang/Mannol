// =====================================================
// Sales view (POS) — rediseñado según screenshot
// Flujo: Gestor → Productos → Nota → Pago → Registrar
// =====================================================

import { getStore } from "../store.js";
import { subscribeProducts, subscribeStock, listCards, listManagers, saveSale, adjustStock, getWholesaleTier, getSuggestedPricePerBox, getSuggestedVendorCommissionPerBox, getSuggestedGestorCommissionPerBox, isWholesaleProduct, listWarehouses, resolveEffectiveWarehouse } from "../db.js";
import { formatMoney, generateSaleId, CURRENCIES, CURRENCY_LABELS, CARD_BRANDS, getRate } from "../currency.js";
import { enqueueSale, generateClientRef } from "../offline-sync.js";
import { toast, icon, showModal, closeModal, esc, confirmDialog } from "../ui.js";

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
  // Mayorista
  let saleType = "RETAIL"; // RETAIL | WHOLESALE
  let wholesaleProduct = null; // producto seleccionado para venta mayorista
  let wholesaleBoxes = 1; // cantidad de cajas
  let wholesalePricePerBox = 0; // precio por caja (editable)
  let wholesaleVendorCommissionPerBox = 0; // comisión vendedor por caja (editable)
  let wholesaleGestorCommissionPerBox = 0; // comisión gestor por caja (editable)

  // Cargar datos
  // Flag para evitar re-fetch si la vista se monta varias veces
  let catalogsLoaded = false;
  let catalogsLoading = false;
  if (!catalogsLoaded && !catalogsLoading) {
    catalogsLoading = true;
    Promise.all([listCards(), listManagers()]).then(([c, m]) => {
      cards = c;
      managers = m;
      catalogsLoaded = true;
      catalogsLoading = false;
      render();
    }).catch(() => {
      catalogsLoading = false;
    });
  }

  const unsubProducts = subscribeProducts((items) => {
    products = items.filter((p) => p.active !== false);
    render();
  });
  const warehouse = store.getState().currentWarehouse;
  const unsubStock = warehouse ? subscribeStock(warehouse.id, (items) => {
    stock = items;
    render();
  }) : () => {};

  const onOnline = () => { isOnline = true; render(); };
  const onOffline = () => { isOnline = false; render(); };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // Subscribe to sync status for pending count
  let unsubSync = () => {};
  import("../offline-sync.js").then(({ subscribeSyncStatus }) => {
    unsubSync = subscribeSyncStatus(() => render());
  }).catch(() => {});

  function getStockQty(productId) {
    return stock.find((s) => s.productId === productId)?.quantity ?? 0;
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
    const offlineQueue = store.getState().offlineQueue;

    if (!user || !wh) {
      container.innerHTML = `<div class="empty-state">Selecciona un almacén en el menú lateral</div>`;
      return;
    }

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold flex items-center gap-2">${icon("cart", 20)} Venta en ${esc(wh.name)} (${esc(wh.code)})</h1>
            <p class="text-xs text-muted">Solo productos, gestor y pago.</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="badge ${isOnline ? "badge-accent" : "badge-warning"}">${isOnline ? "En línea" : "Offline"}</span>
            ${offlineQueue.length > 0 ? `<span class="badge badge-warning">${icon("clock", 12)} ${offlineQueue.length} pendientes</span>` : ""}
          </div>
        </div>

        ${!isOnline ? `
          <div class="sync-banner sync-banner-offline">
            <div class="sync-banner-icon">${icon("wifiOff", 18)}</div>
            <div class="sync-banner-content">
              <div class="sync-banner-title">Sin conexión</div>
              <div class="sync-banner-sub">${offlineQueue.length > 0 ? `${offlineQueue.length} venta(s) en cola · Se sincronizarán al recuperar internet` : "Las ventas se guardarán localmente"}</div>
            </div>
          </div>
        ` : ''}

        <!-- Toggle Retail / Mayorista -->
        <div class="tabs-list" style="grid-template-columns: 1fr 1fr;margin-bottom:0">
          <button class="tabs-trigger ${saleType === 'RETAIL' ? 'active' : ''}" data-sale-type="RETAIL">
            ${icon("cart", 14)} Venta retail (por unidad)
          </button>
          <button class="tabs-trigger ${saleType === 'WHOLESALE' ? 'active' : ''}" data-sale-type="WHOLESALE">
            ${icon("boxes", 14)} Venta mayorista (por caja)
          </button>
        </div>

        ${saleType === "WHOLESALE" ? renderWholesaleSection() : `
        <div>
          <label class="label">Gestor que refirió (opcional)</label>
          <input class="input" id="manager-code" value="${selectedManagerCode}" placeholder="SIGLA: CM, AR, JP, MG... (dejar vacío si no hay)" autocomplete="off" />
          ${selectedManager ? `<p class="text-xs text-muted mt-1">${esc(selectedManager.name)} · ${esc(selectedManager.phone || '')}</p>` : ''}
        </div>

        <!-- Productos de la venta -->
        <div>
          <label class="label flex items-center gap-1">${icon("boxes", 14)} Productos de la venta</label>
          ${cart.length === 0 ? `
            <button class="btn btn-primary btn-block btn-lg" id="open-catalog-btn" style="justify-content:space-between">
              <span class="flex items-center gap-2">${icon("boxes", 18)} Abrir catálogo de productos</span>
              <span class="badge">${products.filter(p => getStockQty(p.id) > 0).length} disponibles</span>
            </button>
          ` : `
            <div style="display:flex;flex-direction:column;gap:0.5rem">
              ${cart.map((item, i) => {
                const p = products.find((x) => x.id === item.productId);
                const stockQty = getStockQty(item.productId);
                return `
                  <div class="cart-item" style="display:flex;align-items:center;gap:0.5rem;padding:0.625rem">
                    <div style="flex:1;min-width:0">
                      <div class="text-sm font-medium truncate">${esc(item.name)}</div>
                      <div class="text-xs text-muted">${formatMoney(item.unitPrice, "USD")} c/u · Stock: ${stockQty + item.quantity}</div>
                      <div class="text-xs text-muted">Comisión gestor: ${p?.gestorCommission ?? p?.commission ?? 0} ${p?.gestorCommissionCurrency ?? p?.commissionCurrency ?? "USD"} · Comisión vendedor: ${p?.vendorCommission ?? 0} ${p?.vendorCommissionCurrency ?? "MN"}</div>
                    </div>
                    <div class="flex items-center gap-1">
                      <button class="btn btn-outline btn-icon btn-sm" data-action="dec" data-idx="${i}">${icon("minus", 12)}</button>
                      <span style="width:2rem;text-align:center;font-weight:600">${item.quantity}</span>
                      <button class="btn btn-outline btn-icon btn-sm" data-action="inc" data-idx="${i}">${icon("plus", 12)}</button>
                    </div>
                    <div class="text-sm font-bold" style="width:5rem;text-align:right">${formatMoney(item.subtotal, "USD")}</div>
                    <button class="btn btn-ghost btn-icon btn-sm text-danger" data-action="remove" data-idx="${i}">${icon("trash", 12)}</button>
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
          <div>
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
                      <div class="font-semibold text-sm">${curr}</div>
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
                    <input class="input" type="number" step="0.01" placeholder="0.00" data-multi-currency="${curr}" value="${multiPayments[curr] || ''}" />
                  </div>
                `).join("")}
              </div>
            `}

            ${selectedCurrency === 'TRANSFERENCIA' || (paymentMode === 'MULTI' && multiPayments.TRANSFERENCIA > 0) ? `
              <div class="card mt-3" style="padding:0.75rem">
                <label class="label label-xs">Tarjeta de transferencia</label>
                <select class="select" id="card-select">
                  <option value="">— Selecciona tarjeta —</option>
                  ${cards.map((c) => `<option value="${esc(c.id)}" ${selectedCardId === c.id ? 'selected' : ''}>${esc(c.name)} · ${esc(c.bank || '')} · ${esc((c.number || '').slice(-4))}</option>`).join("")}
                </select>
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

          <!-- Botones -->
          <div style="display:flex;flex-direction:column;gap:0.5rem">
            <button class="btn btn-primary btn-block btn-lg" id="register-sale-btn" style="font-size:1.125rem;font-weight:700">
              ${icon("check", 20)} Registrar venta
            </button>
            <button class="btn btn-ghost btn-block" id="cancel-sale-btn">Cancelar</button>
          </div>
        ` : ''}
      </div>
    `;

    wireEvents();
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
        <input class="input" id="manager-code" value="${esc(selectedManagerCode)}" placeholder="SIGLA: CM, AR, JP, MG... (dejar vacío si no hay)" autocomplete="off" />
        ${selectedManager ? `<p class="text-xs text-muted mt-1">${esc(selectedManager.name)} · ${esc(selectedManager.phone || '')}</p>` : ''}
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
              <div class="font-bold">${stockQty} pomos · ${maxBoxes} cajas</div>
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

    // Gestor
    const managerInput = container.querySelector("#manager-code");
    if (managerInput) {
      managerInput.addEventListener("input", (e) => {
        selectedManagerCode = e.target.value.toUpperCase().trim();
        selectedManager = managers.find((m) => m.code.toUpperCase() === selectedManagerCode) || null;
        render();
        const newInput = container.querySelector("#manager-code");
        if (newInput) { newInput.focus(); newInput.setSelectionRange(selectedManagerCode.length, selectedManagerCode.length); }
      });
    }

    // Abrir catálogo
    const openCatalogBtn = container.querySelector("#open-catalog-btn");
    if (openCatalogBtn) openCatalogBtn.addEventListener("click", () => { catalogOpen = true; renderCatalogModal(); });
    const addMoreBtn = container.querySelector("#add-more-btn");
    if (addMoreBtn) addMoreBtn.addEventListener("click", () => { catalogOpen = true; renderCatalogModal(); });

    // Cart actions
    container.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.idx);
        if (action === "inc") {
          const item = cart[idx];
          const stockQty = getStockQty(item.productId);
          if (item.quantity >= stockQty) { toast("Sin stock suficiente", "warning"); return; }
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

    // Nota
    const noteInput = container.querySelector("#note-input");
    if (noteInput) {
      noteInput.addEventListener("input", (e) => {
        note = e.target.value;
        const counter = container.querySelector("#note-counter");
        if (counter) counter.textContent = `${note.length}/500`;
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
      });
    });

    // Card select
    const cardSelect = container.querySelector("#card-select");
    if (cardSelect) {
      cardSelect.addEventListener("change", (e) => { selectedCardId = e.target.value; });
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
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          <div style="position:relative">
            <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)">${icon("search", 16)}</span>
            <input class="input" id="catalog-search" placeholder="Buscar producto..." value="${search}" style="padding-left:2.25rem" />
          </div>
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
      onClose: () => { catalogOpen = false; },
    });

    function renderCatalogList() {
      const list = document.querySelector("#catalog-list");
      if (!list) return;
      const filtered = products.filter((p) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
      });
      list.innerHTML = filtered.map((p) => {
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
              <button class="btn btn-outline btn-icon btn-sm" data-qty-dec="${esc(p.id)}" ${inCart <= 0 ? 'disabled' : ''}>${icon("minus", 12)}</button>
              <span style="width:2rem;text-align:center;font-weight:700;font-size:0.875rem" data-qty-display="${esc(p.id)}">${inCart}</span>
              <button class="btn btn-outline btn-icon btn-sm" data-qty-inc="${esc(p.id)}" ${isOut || inCart >= qty ? 'disabled' : ''}>${icon("plus", 12)}</button>
            </div>
          </div>
        `;
      }).join("");

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

    document.querySelector("#catalog-cancel").addEventListener("click", close);
    document.querySelector("#catalog-add").addEventListener("click", () => {
      if (cart.length === 0) { toast("Selecciona al menos un producto", "warning"); return; }
      close();
      render();
    });

    renderCatalogList();
  }

  function addProduct(productId) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const stockQty = getStockQty(productId);
    const existing = cart.find((i) => i.productId === productId);
    if (existing && existing.quantity >= stockQty) {
      toast("Sin stock suficiente", "warning");
      return;
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
    toast(`${p.name} agregado`, "success");
    render();
  }

  async function handleRegister() {
    const user = store.getState().currentUser;
    const wh = store.getState().currentWarehouse;
    const total = cartTotal();

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
    }

    // Validar pago
    let paidUSD = 0, paidMN = 0, paidEUR = 0, paidTransfer = 0;
    if (paymentMode === "SINGLE") {
      if (selectedCurrency === "USD") paidUSD = total;
      else if (selectedCurrency === "MN") paidMN = total;
      else if (selectedCurrency === "EUR") paidEUR = total;
      else if (selectedCurrency === "TRANSFERENCIA") paidTransfer = total;
    } else {
      paidUSD = multiPayments.USD || 0;
      paidMN = multiPayments.MN || 0;
      paidEUR = multiPayments.EUR || 0;
      paidTransfer = multiPayments.TRANSFERENCIA || 0;
    }

    // Calcular comisiones y items según modo
    let gestorCommissionUSD = 0, gestorCommissionMN = 0;
    let vendorCommissionUSD = 0, vendorCommissionMN = 0;
    let saleItems = [];
    let stockAdjustments = []; // [{ productId, quantity }]

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
      // Retail: cálculo existente
      for (const item of cart) {
        const gCom = item.gestorCommission || 0;
        const gCurr = item.gestorCommissionCurrency || "USD";
        const vCom = item.vendorCommission || 0;
        const vCurr = item.vendorCommissionCurrency || "MN";
        if (gCurr === "USD") gestorCommissionUSD += gCom * item.quantity;
        else gestorCommissionMN += gCom * item.quantity;
        if (vCurr === "USD") vendorCommissionUSD += vCom * item.quantity;
        else vendorCommissionMN += vCom * item.quantity;
      }
      saleItems = cart.map((i) => ({ ...i }));
      stockAdjustments = cart.map((i) => ({ productId: i.productId, quantity: i.quantity }));
    }

    const saleCode = `V-${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 9)}`;
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
      payments: paymentMode === "MULTI" ? Object.entries(multiPayments).filter(([_, v]) => v > 0).map(([currency, amount]) => ({ currency, amount, amountUSD: amount, exchangeRate: 1 })) : [{ currency: selectedCurrency, amount: total, amountUSD: total, exchangeRate: 1 }],
      isMultiCurrency: paymentMode === "MULTI",
      paymentMode,
      currency: selectedCurrency,
      paidUSD, paidMN, paidEUR, paidTransfer,
      paymentMethod: (selectedCurrency === "TRANSFERENCIA" || paidTransfer > 0) ? "TRANSFERENCIA" : "EFECTIVO",
      cardId: selectedCard?.id || null,
      cardNumber: selectedCard?.number || null,
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
      syncedAt: navigator.onLine ? Date.now() : null,
    };

    try {
      if (!navigator.onLine) {
        enqueueSale(sale);
        toast(`Venta ${sale.code} guardada sin conexión · Se subirá automáticamente`, "info");
      } else {
        sale.clientRef = generateClientRef();
        await saveSale(sale);
        for (const adj of stockAdjustments) {
          // Descuenta el stock del almacén efectivo (Vedado si fue reasignado, o el del vendedor si no)
          await adjustStock(finalWh.id, adj.productId, -adj.quantity, "VENTA", `Venta ${sale.code}`, user.id, user.displayName);
        }
        sale.syncedAt = Date.now();
        toast(`Venta ${sale.code} registrada${saleType === "WHOLESALE" ? " (mayorista)" : ""}${weekendRedirect ? " · " + finalWh.name : ""}`, "success");
      }
      // Limpiar
      cart = [];
      note = "";
      selectedManagerCode = "";
      selectedManager = null;
      multiPayments = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
      transferAmount = 0;
      selectedCardId = "";
      wholesaleProduct = null;
      wholesaleBoxes = 1;
      wholesalePricePerBox = 0;
      wholesaleVendorCommissionPerBox = 0;
      wholesaleGestorCommissionPerBox = 0;
      render();
    } catch (err) {
      console.error("Sale save failed, enqueuing for retry:", err);
      enqueueSale(sale);
      toast(`Venta ${sale.code} guardada en cola · Se sincronizará automáticamente`, "warning");
      cart = [];
      note = "";
      selectedManagerCode = "";
      selectedManager = null;
      multiPayments = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
      transferAmount = 0;
      selectedCardId = "";
      wholesaleProduct = null;
      wholesaleBoxes = 1;
      wholesalePricePerBox = 0;
      wholesaleVendorCommissionPerBox = 0;
      wholesaleGestorCommissionPerBox = 0;
      render();
    }
  }

  render();

  return () => {
    unsubProducts();
    unsubStock();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    unsubSync();
  };
}
