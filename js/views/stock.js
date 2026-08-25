// =====================================================
// Stock view — inventario con ajuste (motivos: AJUSTE_MANUAL, INVENTARIO, MERMA, DEVOLUCION)
// =====================================================

import { getStore } from "../store.js";
import { subscribeProducts, subscribeStock, adjustStock, listStock, listProducts, listCategories } from "../db.js";
import { formatMoney, skeletonStatCard, skeletonRow } from "../currency.js";
import { toast, icon, showModal, esc } from "../ui.js";
import { STOCK_REASONS, STOCK_REASON_LABELS } from "../types.js";
import { exportToCSV } from "../csv-export.js";

export function mountStockView(container, navigate) {
  const store = getStore();
  let products = [];
  let stock = [];
  let categories = [];
  let search = "";
  let filterCategory = "";
  let filterBrand = "";
  let filterStatus = "all"; // all | low | out | ok
  let isLoading = true;

  function render() {
    const warehouse = store.getState().currentWarehouse;
    const user = store.getState().currentUser;
    const canEdit = user?.role === "admin";
    const isAdmin = user?.role === "admin";

    if (!warehouse) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon("building", 24)}</div><p class="empty-state-title">Selecciona un almacén</p><p class="empty-state-desc">Elige un almacén en el menú lateral para ver su inventario.</p></div>`;
      return;
    }

    if (isLoading) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div>
            <h1 class="text-2xl font-bold flex items-center gap-2">${icon("boxes", 24)} Inventario</h1>
            <p class="text-sm text-muted">Cargando productos y stock…</p>
          </div>
          <div class="grid md:grid-cols-3 gap-3">${skeletonStatCard(3)}</div>
          <div class="card">
            <div class="overflow-x-auto">
              <table class="table"><thead><tr><th>Producto</th><th>Marca</th><th class="text-center">Cantidad</th><th class="text-center">Mínimo</th><th class="text-center">Estado</th></tr></thead>
              <tbody>${skeletonRow(5, 5)}</tbody></table>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const stockMap = {};
    stock.forEach((s) => (stockMap[s.productId] = s));

    // Filtros combinados
    const filtered = products.filter((p) => {
      // Búsqueda por texto
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) &&
            !(p.brand || "").toLowerCase().includes(q) &&
            !(p.sku || "").toLowerCase().includes(q) &&
            !(p.viscosity || "").toLowerCase().includes(q)) return false;
      }
      // Filtro por categoría
      if (filterCategory && p.categoryId !== filterCategory) return false;
      // Filtro por marca
      if (filterBrand && p.brand !== filterBrand) return false;
      // Filtro por estado
      if (filterStatus !== "all") {
        const s = stockMap[p.id];
        const qty = s?.quantity ?? 0;
        const min = s?.minStock || p.minStock || 5;
        if (filterStatus === "out" && qty > 0) return false;
        if (filterStatus === "low" && !(qty > 0 && qty <= min)) return false;
        if (filterStatus === "ok" && qty <= min) return false;
      }
      return true;
    });

    // Marcas únicas
    const uniqueBrands = Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort();

    const totalUnits = stock.reduce((s, x) => s + x.quantity, 0);
    const totalValue = isAdmin ? stock.reduce((s, x) => {
      const p = products.find((pp) => pp.id === x.productId);
      return s + (x.quantity * (x.localPrice || p?.salePrice || 0));
    }, 0) : 0;
    const lowStock = stock.filter((s) => s.quantity <= (s.minStock || 5) && s.quantity > 0).length;
    const outOfStock = stock.filter((s) => s.quantity === 0).length;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div>
          <h1 class="text-2xl font-bold flex items-center gap-2">${icon("boxes", 24)} Inventario</h1>
          <p class="text-sm text-muted">
            Almacén: <span class="badge badge-accent">${esc(warehouse.name)}</span> ·
            ${products.length} productos · ${totalUnits} unidades${isAdmin ? ' · ' + formatMoney(totalValue, "USD") : ''}
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-3">
          <div class="stat-card">
            <div class="stat-label">${icon("boxes", 14)} Total unidades</div>
            <div class="stat-value">${totalUnits}</div>
            <div class="stat-sub">${products.length} SKUs${isAdmin ? ' · ' + formatMoney(totalValue, "USD") : ''}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label" style="color:var(--warning)">${icon("alertTriangle", 14)} Stock bajo</div>
            <div class="stat-value text-warning">${lowStock}</div>
            <div class="stat-sub">Productos por debajo del mínimo</div>
          </div>
          <div class="stat-card">
            <div class="stat-label" style="color:var(--danger)">${icon("alertTriangle", 14)} Agotados</div>
            <div class="stat-value text-danger">${outOfStock}</div>
            <div class="stat-sub">Productos sin existencias</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
          <div style="position:relative;flex:1;min-width:12rem">
            <span style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-muted)" aria-hidden="true">${icon("search", 16)}</span>
            <input class="input" placeholder="Buscar por nombre, marca, SKU o viscosidad..." id="search-input" value="${esc(search)}" style="padding-left:2.25rem" aria-label="Buscar producto" />
          </div>
          <select class="select" id="cat-filter" style="min-width:10rem" aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            ${categories.filter(c => !c.parentId).map((c) => `<option value="${esc(c.id)}" ${filterCategory === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
          <select class="select" id="brand-filter" style="min-width:8rem" aria-label="Filtrar por marca">
            <option value="">Todas las marcas</option>
            ${uniqueBrands.map((b) => `<option value="${esc(b)}" ${filterBrand === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
          </select>
          <select class="select" id="status-filter" style="min-width:8rem" aria-label="Filtrar por estado">
            <option value="all" ${filterStatus === "all" ? 'selected' : ''}>Todos los estados</option>
            <option value="ok" ${filterStatus === "ok" ? 'selected' : ''}>Stock OK</option>
            <option value="low" ${filterStatus === "low" ? 'selected' : ''}>Stock bajo</option>
            <option value="out" ${filterStatus === "out" ? 'selected' : ''}>Agotados</option>
          </select>
          <button class="btn btn-outline btn-sm" id="clear-filters" title="Limpiar filtros" aria-label="Limpiar filtros">${icon("x", 14)}</button>
          <button class="btn btn-outline btn-sm" id="export-csv-btn" title="Exportar inventario a CSV" aria-label="Exportar inventario a CSV">${icon("download", 14)} CSV</button>
        </div>

        <div class="card">
          <div class="overflow-x-auto">
            <table class="table">
              <thead><tr><th>Producto</th><th>Marca</th>${isAdmin ? '<th class="text-right">Precio</th>' : ''}<th class="text-center">Cantidad</th><th class="text-center">Mínimo</th><th class="text-center">Estado</th>${canEdit ? '<th class="text-right">Acciones</th>' : ''}</tr></thead>
              <tbody>
                ${filtered.length === 0 ? `<tr><td colspan="${canEdit ? 7 : 6}"><div class="empty-state"><div class="empty-state-icon">${icon("boxes", 24)}</div><p class="empty-state-title">Sin productos</p><p class="empty-state-desc">No hay productos que coincidan con los filtros.</p></div></td></tr>` :
                  filtered.map((p) => {
                    const s = stockMap[p.id];
                    const qty = s?.quantity ?? 0;
                    const min = s?.minStock || p.minStock || 5;
                    const isLow = qty > 0 && qty <= min;
                    const isOut = qty === 0;
                    return `
                      <tr>
                        <td class="font-medium">${esc(p.name)}<div class="text-xs text-muted">${esc(p.sku || '')} ${p.viscosity ? '· ' + esc(p.viscosity) : ''}</div></td>
                        <td class="text-xs">${esc(p.brand)}</td>
                        ${isAdmin ? `<td class="text-right">${formatMoney(s?.localPrice || p.salePrice, "USD")}</td>` : ''}
                        <td class="text-center font-bold ${isOut ? 'text-danger' : isLow ? 'text-warning' : ''}">${qty}</td>
                        <td class="text-center text-muted">${min}</td>
                        <td class="text-center">
                          ${isOut ? `<span class="badge badge-danger">Agotado</span>` :
                            isLow ? `<span class="badge badge-warning">${icon("alertTriangle", 12)} Bajo</span>` :
                            `<span class="badge badge-accent">OK</span>`}
                        </td>
                        ${canEdit ? `<td class="text-right"><button class="btn btn-outline btn-sm" data-adjust="${esc(p.id)}">Ajustar</button></td>` : ''}
                      </tr>
                    `;
                  }).join('')
                }
              </tbody>
            </table>
          </div>
          ${filtered.length > 0 ? `<div class="text-xs text-muted text-center" style="padding:0.5rem">Mostrando ${filtered.length} de ${products.length} productos</div>` : ''}
        </div>

        ${!canEdit ? `
          <div class="card" style="background: color-mix(in oklab, var(--warning) 5%, transparent); border-color: color-mix(in oklab, var(--warning) 30%, transparent)">
            <div class="card-content text-sm text-center">
              ${icon("alertTriangle", 16)} Para ajustes de stock, contacta al administrador
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const exportBtn = container.querySelector("#export-csv-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const rows = filtered.map((p) => {
          const s = stockMap[p.id];
          const qty = s?.quantity ?? 0;
          const min = s?.minStock || p.minStock || 5;
          const isLow = qty > 0 && qty <= min;
          const isOut = qty === 0;
          return {
            codigo: p.sku || '',
            nombre: p.name,
            marca: p.brand,
            categoria: p.categoryName || '',
            viscosidad: p.viscosity || '',
            cantidad: qty,
            minimo: min,
            precio_local: s?.localPrice || p.salePrice || 0,
            estado: isOut ? 'Agotado' : isLow ? 'Bajo' : 'OK',
          };
        });
        exportToCSV(`inventario-${warehouse.code}-${new Date().toISOString().slice(0, 10)}`, rows);
        toast(`${rows.length} productos exportados`, "success");
      });
    }

    const searchInput = container.querySelector("#search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        search = e.target.value;
        render();
        const newInput = container.querySelector("#search-input");
        if (newInput) { newInput.focus(); newInput.setSelectionRange(search.length, search.length); }
      });
    }

    const catFilter = container.querySelector("#cat-filter");
    if (catFilter) catFilter.addEventListener("change", (e) => { filterCategory = e.target.value; render(); });
    const brandFilter = container.querySelector("#brand-filter");
    if (brandFilter) brandFilter.addEventListener("change", (e) => { filterBrand = e.target.value; render(); });
    const statusFilterEl = container.querySelector("#status-filter");
    if (statusFilterEl) statusFilterEl.addEventListener("change", (e) => { filterStatus = e.target.value; render(); });
    const clearBtn = container.querySelector("#clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        search = "";
        filterCategory = "";
        filterBrand = "";
        filterStatus = "all";
        render();
        const newInput = container.querySelector("#search-input");
        if (newInput) newInput.focus();
      });
    }

    container.querySelectorAll("[data-adjust]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = products.find((x) => x.id === btn.dataset.adjust);
        if (p) showAdjustDialog(p, warehouse);
      });
    });
  }

  function showAdjustDialog(product, warehouse) {
    const s = stock.find((x) => x.productId === product.id);
    const currentQty = s?.quantity ?? 0;
    const minStock = s?.minStock || product.minStock || 5;
    const localPrice = s?.localPrice || product.salePrice;
    const user = store.getState().currentUser;

    const close = showModal({
      title: `Ajustar stock · ${esc(product.name)}`,
      size: "lg",
      body: `
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="grid grid-cols-3 gap-2">
            <div class="stat-card" style="padding:0.75rem">
              <div class="text-xs text-muted">Cantidad actual</div>
              <div class="text-xl font-bold">${currentQty}</div>
            </div>
            <div class="stat-card" style="padding:0.75rem">
              <div class="text-xs text-muted">Mínimo</div>
              <div class="text-xl font-bold">${minStock}</div>
            </div>
            <div class="stat-card" style="padding:0.75rem">
              <div class="text-xs text-muted">Precio local</div>
              <div class="text-xl font-bold">${formatMoney(localPrice, "USD")}</div>
            </div>
          </div>

          <hr class="separator" />

          <div><label class="label label-xs">Nueva cantidad</label><input class="input" type="number" id="adj-qty" value="${currentQty}" /></div>
          <div><label class="label label-xs">Nuevo precio local (USD)</label><input class="input" type="number" step="0.01" id="adj-price" value="${localPrice}" /></div>
          <div><label class="label label-xs">Motivo del ajuste *</label>
            <select class="select" id="adj-reason">
              ${STOCK_REASONS.map((r) => `<option value="${esc(r)}">${STOCK_REASON_LABELS[r]}</option>`).join('')}
            </select>
          </div>
          <div><label class="label label-xs">Nota (opcional)</label><input class="input" id="adj-note" placeholder="Ej: Conteo físico de inventario" /></div>

          <div class="text-xs text-muted">El delta será: <strong id="adj-delta" style="color:var(--primary)">0</strong></div>
        </div>
      `,
      footer: `<button class="btn btn-outline" id="adj-cancel">Cancelar</button><button class="btn btn-primary" id="adj-save">Guardar ajuste</button>`,
    });

    const qtyInput = document.querySelector("#adj-qty");
    const deltaDisplay = document.querySelector("#adj-delta");
    qtyInput.addEventListener("input", () => {
      const newQty = parseInt(qtyInput.value) || 0;
      const delta = newQty - currentQty;
      deltaDisplay.textContent = `${delta > 0 ? '+' : ''}${delta}`;
      deltaDisplay.style.color = delta > 0 ? 'var(--accent-usd)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)';
    });

    document.querySelector("#adj-cancel").addEventListener("click", close);
    document.querySelector("#adj-save").addEventListener("click", async () => {
      const newQty = parseInt(document.querySelector("#adj-qty").value) || 0;
      const newPrice = parseFloat(document.querySelector("#adj-price").value) || localPrice;
      const reason = document.querySelector("#adj-reason").value;
      const note = document.querySelector("#adj-note").value.trim() || null;
      const delta = newQty - currentQty;

      if (delta === 0 && newPrice === localPrice) {
        toast("No hay cambios que guardar", "warning");
        return;
      }

      try {
        if (delta !== 0) {
          await adjustStock(warehouse.id, product.id, delta, reason, note, user?.id, user?.displayName);
        }
        if (newPrice !== localPrice) {
          const { setStock } = await import("../db.js");
          await setStock(warehouse.id, product.id, newQty, minStock);
        }
        toast(`Stock ajustado: ${delta > 0 ? '+' : ''}${delta} unidades`, "success");
        close();
        stock = stock.map((s) => s.productId === product.id ? { ...s, quantity: newQty, localPrice: newPrice } : s);
        render();
      } catch (err) {
        toast("Error al ajustar stock: " + err.message, "error");
      }
    });
  }

  const unsubProducts = subscribeProducts((items) => { products = items; isLoading = false; render(); });
  const warehouse = store.getState().currentWarehouse;
  const unsubStock = warehouse ? subscribeStock(warehouse.id, (items) => { stock = items; isLoading = false; render(); }) : () => {};

  if (warehouse) {
    Promise.all([listProducts(), listStock(warehouse.id), listCategories()]).then(([prods, stk, cats]) => {
      products = prods;
      stock = stk;
      categories = cats;
      isLoading = false;
      render();
    });
  }

  render();
  return () => { unsubProducts(); unsubStock(); };
}
