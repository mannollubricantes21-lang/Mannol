// =====================================================
// Warehouse Interior view — layout exacto del screenshot
// KPIs en tarjetas oscuras + detalle por moneda + FAB
// =====================================================

import { getStore } from "../store.js";
import { subscribeSales, subscribeStock, listProducts, listWarehouses, listAllStockAcrossWarehouses, listStockForProductInAllWarehouses } from "../db.js";
import { formatMoney, formatDate } from "../currency.js";
import { icon, esc, toast, showModal, closeModal, confirmDialog } from "../ui.js";

export function mountWarehouseInterior(container, navigate) {
  const store = getStore();
  const warehouse = store.getState().currentWarehouse;
  let sales = [];
  let stock = [];
  let products = [];
  let period = "today";
  let search = "";
  let inventoryTab = "stock"; // "stock" | "others"  (sin "transfers" — solo admin transfiere)
  let otherWarehousesStock = []; // stock en otros almacenes
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

  // Cargar stock de otros almacenes (para el tab "Otros almacenes")
  async function loadOtherStock() {
    const allStock = await listAllStockAcrossWarehouses();
    otherWarehousesStock = allStock.filter((s) => s.warehouseId !== warehouse.id);
    render();
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
    const filteredProducts = products.filter((p) =>
      !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.brand || "").toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase())
    );
    const lowStock = stock.filter((s) => s.quantity <= (s.minStock || 5) && s.quantity > 0).length;
    const outOfStock = stock.filter((s) => s.quantity === 0).length;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.875rem">
        <!-- Header del almacén -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem">
          <div style="display:flex;align-items:center;gap:0.5rem;min-width:0">
            <span class="badge badge-outline" style="font-size:0.75rem;font-weight:700">${esc(warehouse.code)}</span>
            <h2 class="text-lg font-bold" style="margin:0">${esc(warehouse.name)}</h2>
          </div>
          <button class="btn btn-ghost btn-sm" data-nav-back>${icon("arrowLeft", 14)} Volver</button>
        </div>
        ${warehouse.address || warehouse.phone ? `
          <div class="text-xs text-muted" style="display:flex;flex-direction:column;gap:0.125rem">
            ${warehouse.address ? `<div>${icon("mapPin", 12)} ${esc(warehouse.address)}</div>` : ''}
            ${warehouse.phone ? `<div>${icon("phone", 12)} ${esc(warehouse.phone)}</div>` : ''}
          </div>
        ` : ''}

        <!-- Selector de período -->
        <div style="display:flex;gap:0.375rem">
          <button class="btn ${period === 'today' ? 'btn-primary' : 'btn-outline'} btn-sm" data-period="today" style="flex:1">Hoy</button>
          <button class="btn ${period === 'week' ? 'btn-primary' : 'btn-outline'} btn-sm" data-period="week" style="flex:1">Semana</button>
          <button class="btn ${period === 'month' ? 'btn-primary' : 'btn-outline'} btn-sm" data-period="month" style="flex:1">Mes</button>
        </div>

        <!-- Panel de resumen -->
        <div class="card-dark" style="padding:0.875rem">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.625rem">
            <h3 class="text-sm font-semibold text-on-dark flex items-center gap-1">${icon("store", 14)} Resumen ${period === 'today' ? 'Hoy' : period === 'week' ? 'Semana' : 'Mes'}</h3>
            <span class="badge badge-dark">${icon("cart", 10)} ${stats.count} ventas</span>
          </div>

          <!-- Grid 2x3 KPIs -->
          <div class="grid grid-cols-3 gap-2">
            <div style="text-align:center;padding:0.5rem;background:var(--bg-dark);border-radius:var(--radius);border:1px solid var(--border-on-dark)">
              <div style="color:var(--accent-usd);margin-bottom:0.125rem">${icon("cart", 18)}</div>
              <div class="text-xl font-bold text-on-dark">${stats.count}</div>
              <div class="text-xs text-muted-on-dark">Ventas</div>
            </div>
            <div style="text-align:center;padding:0.5rem;background:var(--bg-dark);border-radius:var(--radius);border:1px solid color-mix(in oklab, var(--accent-usd) 30%, transparent)">
              <div style="color:var(--accent-usd);margin-bottom:0.125rem;font-size:1.125rem;font-weight:700">$</div>
              <div class="text-xl font-bold text-on-dark">${formatMoney(stats.byCurrency.USD.amount, "USD")}</div>
              <div class="text-xs text-muted-on-dark">USD</div>
            </div>
            <div style="text-align:center;padding:0.5rem;background:var(--bg-dark);border-radius:var(--radius);border:1px solid color-mix(in oklab, var(--accent-mn) 30%, transparent)">
              <div style="color:var(--accent-mn);margin-bottom:0.125rem;font-size:1.125rem;font-weight:700">₱</div>
              <div class="text-xl font-bold text-on-dark">${formatMoney(stats.byCurrency.MN.amount, "MN")}</div>
              <div class="text-xs text-muted-on-dark">MN</div>
            </div>
            <div style="text-align:center;padding:0.5rem;background:var(--bg-dark);border-radius:var(--radius);border:1px solid color-mix(in oklab, var(--accent-eur) 30%, transparent)">
              <div style="color:var(--accent-eur);margin-bottom:0.125rem;font-size:1.125rem;font-weight:700">€</div>
              <div class="text-xl font-bold text-on-dark">${formatMoney(stats.byCurrency.EUR.amount, "EUR")}</div>
              <div class="text-xs text-muted-on-dark">EUR</div>
            </div>
            <div style="text-align:center;padding:0.5rem;background:var(--bg-dark);border-radius:var(--radius);border:1px solid color-mix(in oklab, var(--accent-transfer) 30%, transparent)">
              <div style="color:var(--accent-transfer);margin-bottom:0.125rem">${icon("creditCard", 18)}</div>
              <div class="text-xl font-bold text-on-dark">${formatMoney(stats.byCurrency.TRANSFERENCIA.amount, "USD")}</div>
              <div class="text-xs text-muted-on-dark">Transf.</div>
            </div>
            <div style="text-align:center;padding:0.5rem;background:var(--bg-dark);border-radius:var(--radius);border:1px solid var(--border-on-dark)">
              <div style="color:var(--warning);margin-bottom:0.125rem">${icon("boxes", 18)}</div>
              <div class="text-xl font-bold text-on-dark">${stats.unitsSold}</div>
              <div class="text-xs text-muted-on-dark">Unidades</div>
            </div>
          </div>

          ${stats.count > 0 ? `
            <hr style="border:none;border-top:1px solid var(--border-on-dark);margin:0.625rem 0" />
            <div class="grid grid-cols-2 gap-2">
              ${Object.entries(stats.byCurrency).filter(([_, v]) => v.count > 0).map(([curr, data]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0.5rem;background:var(--bg-dark);border-radius:var(--radius-sm);border:1px solid var(--border-on-dark)">
                  <span class="text-xs text-muted-on-dark"><strong class="text-on-dark">${esc(curr)}</strong> · ${data.count} venta(s)</span>
                  <span class="text-xs font-bold text-on-dark">${formatMoney(data.amount, curr)}</span>
                </div>
              `).join("")}
            </div>
          ` : `<p class="text-xs text-muted-on-dark text-center" style="margin-top:0.5rem">Sin ventas en este período</p>`}
        </div>

        <!-- Botón registrar venta -->
        <button class="btn btn-primary btn-block btn-lg" id="register-sale-btn" style="font-size:1rem;font-weight:700;height:3rem">
          ${icon("cart", 20)} Registrar venta
        </button>

        <!-- Inventario con tabs: Stock / Otros almacenes / Transferencias -->
        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
            <h3 class="card-title flex items-center gap-1">${icon("boxes", 14)} Inventario</h3>
            <div style="display:flex;gap:0.25rem">
              ${lowStock > 0 ? `<span class="badge badge-warning" style="font-size:0.5625rem">${lowStock} bajo</span>` : ''}
              ${outOfStock > 0 ? `<span class="badge badge-danger" style="font-size:0.5625rem">${outOfStock} agotado</span>` : ''}
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
              <div style="max-height:18rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.25rem">
                ${filteredProducts.map((p) => {
                  const s = stockMap[p.id];
                  const qty = s?.quantity ?? 0;
                  const min = s?.minStock || p.minStock || 5;
                  const isLow = qty > 0 && qty <= min;
                  const isOut = qty === 0;
                  return `
                    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.375rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius)">
                      <div style="flex:1;min-width:0">
                        <div class="text-xs font-medium truncate">${esc(p.name)}</div>
                        <div class="text-xs text-muted">${esc(p.brand)} ${isAdmin ? '· ' + formatMoney(s?.localPrice || p.salePrice, "USD") : ''}</div>
                      </div>
                      <span class="text-sm font-bold ${isOut ? 'text-danger' : isLow ? 'text-warning' : ''}">${qty}</span>
                      ${isOut ? '<span class="badge badge-danger" style="font-size:0.5rem">Agotado</span>' : isLow ? '<span class="badge badge-warning" style="font-size:0.5rem">Bajo</span>' : ''}
                      <button class="btn btn-ghost btn-sm" data-view-others="${esc(p.id)}" title="Ver en otros almacenes" style="padding:0.25rem 0.5rem">${icon("mapPin", 12)}</button>
                    </div>
                  `;
                }).join("")}
                ${filteredProducts.length === 0 ? '<div class="empty-state text-xs">Sin productos</div>' : ''}
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
              ${otherWarehousesStock.length === 0 ? `
                <div class="empty-state text-xs">
                  <div class="empty-state-icon">${icon("mapPin", 24)}</div>
                  Cargando stock de otros almacenes...
                </div>
              ` : (() => {
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
                      </div>
                    `).join('')}
                  </div>
                `;
              })()}
            ` : ''}
          </div>
        </div>

        <!-- Ventas recientes -->
        ${periodSales.length > 0 ? `
          <div class="card">
            <div class="card-header"><h3 class="card-title">Ventas recientes</h3></div>
            <div class="card-content" style="padding:0.5rem">
              <div style="max-height:14rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.25rem">
                ${periodSales.slice(0, 10).map((s) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius)">
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
        if (inventoryTab === "others" && otherWarehousesStock.length === 0) {
          await loadOtherStock();
        } else {
          render();
        }
      });
    });

    // Botón "Ver en otros almacenes" (en cada producto del tab Stock)
    container.querySelectorAll("[data-view-others]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const productId = btn.dataset.viewOthers;
        const product = products.find((p) => p.id === productId);
        if (!product) return;
        // Cambiar al tab "otros" y mostrar el modal con detalle
        inventoryTab = "others";
        await loadOtherStock();
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
