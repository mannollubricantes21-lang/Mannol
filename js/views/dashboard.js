// =====================================================
// Dashboard view — Mobile shell with bottom nav + FAB + drawer
// Includes all views: dashboard, sales, stock, managers, commissions, transfers, admin, catalog, users, settings, history
// =====================================================

import { getStore } from "../store.js";
import { APP_LABEL } from "../version.js";
import { subscribeSales, listWarehouses, listManagers, listCards, listCategories } from "../db.js";
import { logout } from "../auth.js";
import { formatMoney, formatDate, formatDateShort, skeletonCard, skeletonStatCard } from "../currency.js";
import { toast, icon, esc } from "../ui.js";
import { barChart, donutChart, legend, COLORS } from "../charts.js";
import { mountSalesView } from "./sales.js";
import { mountStockView } from "./stock.js";
import { mountCommissionsView } from "./commissions.js";
import { mountTransfersView } from "./transfers.js";
import { mountCatalogView } from "./catalog.js";
import { mountUsersView } from "./users.js";
import { mountSettingsView } from "./settings.js";
import { mountSalesHistoryView } from "./sales-history.js";
import { mountManagersView } from "./managers.js";
import { mountWarehouseInterior } from "./warehouse-interior.js";
import { createSyncBanner } from "../components/sync-banner.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "Inicio", icon: "home" },
  { id: "sales", label: "Ventas", icon: "cart", hideForRoles: ["admin"] },
  { id: "stock", label: "Inventario", icon: "boxes" },
  { id: "more", label: "Más", icon: "more" },
];

const DRAWER_ITEMS = [
  { id: "dashboard", label: "Inicio", icon: "home", roles: ["admin", "gestor", "vendedor", "warehouse", "empleado_pin"] },
  { id: "sales", label: "Ventas", icon: "cart", roles: ["gestor", "vendedor", "warehouse", "empleado_pin"] },
  { id: "stock", label: "Inventario", icon: "boxes", roles: ["admin", "gestor", "warehouse", "empleado_pin"] },
  { id: "managers", label: "Gestores", icon: "users", roles: ["admin", "gestor", "vendedor", "warehouse"] },
  { id: "history", label: "Historial", icon: "receipt", roles: ["admin", "gestor", "vendedor", "warehouse"] },
  { id: "catalog", label: "Catálogo", icon: "tags", roles: ["admin", "gestor"] },
];

// El admin no debería ver este drawer (es redirigido a admin.html automáticamente).
// Se mantiene la lista por compatibilidad con el type-check, pero en la práctica
// DRAWER_ADMIN_ITEMS ya no incluye el botón "Panel admin" — el admin va a admin.html directo.
const DRAWER_ADMIN_ITEMS = [
  { id: "commissions", label: "Comisiones", icon: "wallet", roles: ["admin"] },
  { id: "transfers", label: "Transferencias", icon: "creditCard", roles: ["admin", "warehouse"] },
  { id: "users", label: "Usuarios", icon: "userCog", roles: ["admin"] },
];

export function mountDashboardView(container, navigate) {
  const store = getStore();
  let activeView = "dashboard";
  let cleanup = null;
  let drawerOpen = false;
  let bannerCleanup = null;

  const params = new URLSearchParams(window.location.search);
  const urlView = params.get("view");
  const urlTab = params.get("tab");
  if (urlTab) activeView = urlTab;
  else if (urlView) activeView = urlView;

  // Pre-load catalogs
  Promise.all([listWarehouses(), listManagers(), listCards(), listCategories()]).then(([wh, mg, cards, cats]) => {
    store.setState({ _warehouses: wh, managers: mg, cards: cards, categories: cats });
  }).catch(() => {});

  function renderShell() {
    const state = store.getState();
    const user = state.currentUser;
    if (!user) { navigate("home"); return; }

    const warehouse = state.currentWarehouse;

    container.innerHTML = `
      <div class="mobile-shell">
        <div class="bg-diagonal"></div>

        <header class="app-header" style="background: color-mix(in oklab, var(--bg) 70%, transparent);">
          <div class="app-header-inner">
            <div class="flex items-center gap-2">
              <button class="btn btn-ghost btn-icon" id="open-drawer-btn" aria-label="Abrir menú lateral" title="Menú">${icon("menu", 20)}</button>
              <div class="flex items-center gap-2 min-w-0">
                <div class="brand-logo">${icon("droplet", 18)}</div>
                <div class="min-w-0" style="line-height: 1.2;">
                  <h1 class="font-bold text-base truncate" style="margin:0">MANNOL</h1>
                  <p class="text-xs text-muted truncate" style="margin:0">${user.displayName} · ${warehouse?.code || user.role}</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1">
              ${false ? `<a href="./admin.html" class="admin-quick-btn" aria-label="Panel admin" title="Panel admin">${icon("shield", 14)} Admin</a>` : ''}
              <button class="btn btn-ghost btn-icon" id="search-trigger-btn" aria-label="Búsqueda global (Ctrl+K)" title="Buscar (Ctrl+K)">${icon("search", 18)}</button>
              <button class="btn btn-ghost btn-icon" id="refresh-btn" aria-label="Refrescar datos" title="Refrescar">${icon("refresh", 18)}</button>
              <button class="btn btn-ghost btn-icon" id="theme-btn" aria-label="Cambiar tema claro/oscuro" title="Tema">${state.theme === 'dark' ? icon("sun", 18) : icon("moon", 18)}</button>
            </div>
          </div>
        </header>

        <main class="mobile-main">
          <div id="sync-banner-mount"></div>
          <div id="dashboard-content"></div>
        </main>

        <nav class="bottom-nav" aria-label="Navegación principal">
          <div style="position:relative">
            ${user.role !== "admin" ? `<button class="fab" id="fab-sell" aria-label="Registrar nueva venta" title="Registrar venta">${icon("cart", 24)}</button>` : ''}
            <div class="bottom-nav-bar">
              ${NAV_ITEMS
                .filter((item) => !item.hideForRoles || !item.hideForRoles.includes(user.role))
                .slice(0, 2)
                .map((item) => `
                <button class="nav-btn ${activeView === item.id ? 'active' : ''}" data-nav="${item.id}" aria-label="${item.label}" aria-current="${activeView === item.id ? 'page' : 'false'}">${icon(item.icon, 20)}<span class="nav-btn-label">${item.label}</span></button>
              `).join('')}
              <div class="flex items-center justify-center"></div>
              ${NAV_ITEMS
                .filter((item) => !item.hideForRoles || !item.hideForRoles.includes(user.role))
                .slice(2)
                .map((item) => `
                <button class="nav-btn ${activeView === item.id ? 'active' : ''}" data-nav="${item.id}" aria-label="${item.label}" aria-current="${activeView === item.id ? 'page' : 'false'}">${icon(item.icon, 20)}<span class="nav-btn-label">${item.label}</span></button>
              `).join('')}
            </div>
          </div>
        </nav>

        <div id="drawer-container"></div>
      </div>
    `;

    container.querySelectorAll(".nav-btn[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.nav;
        if (v === "more") openDrawer();
        else { activeView = v; renderActiveView(); updateNavActive(); }
      });
    });

    container.querySelector("#fab-sell")?.addEventListener("click", () => { activeView = "sales"; renderActiveView(); updateNavActive(); });
    container.querySelector("#open-drawer-btn").addEventListener("click", openDrawer);
    container.querySelector("#refresh-btn").addEventListener("click", () => {
      const btn = container.querySelector("#refresh-btn");
      btn.innerHTML = `<div class="spinner spinner-sm"></div>`;
      setTimeout(() => { btn.innerHTML = icon("refresh", 18); if (cleanup) try { cleanup(); } catch {} renderActiveView(); }, 500);
    });
    container.querySelector("#search-trigger-btn").addEventListener("click", () => {
      if (window.__openGlobalSearch) window.__openGlobalSearch();
    });
    container.querySelector("#theme-btn").addEventListener("click", () => {
      const current = store.getState().theme;
      const next = current === 'dark' ? 'light' : 'dark';
      store.setTheme(next);
      renderShell();
    });

    renderActiveView();

    // Inicializar sync banner (estado de cola offline)
    // Limpiar el anterior si existe (evita memory leak de subscriptions)
    const bannerMount = container.querySelector("#sync-banner-mount");
    if (bannerMount) {
      if (bannerCleanup) { try { bannerCleanup(); } catch {} }
      bannerCleanup = createSyncBanner(bannerMount);
    }
  }

  function updateNavActive() {
    container.querySelectorAll(".nav-btn[data-nav]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.nav === activeView);
    });
  }

  function openDrawer() { drawerOpen = true; renderDrawer(); }
  function closeDrawer() { drawerOpen = false; renderDrawer(); }

  function renderDrawer() {
    const dc = container.querySelector("#drawer-container");
    if (!dc) return;
    const state = store.getState();
    const user = state.currentUser;
    if (!drawerOpen) { dc.innerHTML = ""; return; }
    const warehouse = state.currentWarehouse;
    const allowedDrawer = DRAWER_ITEMS.filter((i) => i.roles.includes(user.role));
    const allowedAdmin = DRAWER_ADMIN_ITEMS.filter((i) => i.roles.includes(user.role));

    dc.innerHTML = `
      <div class="drawer-overlay" id="drawer-overlay"></div>
      <aside class="drawer">
        <div class="drawer-header">
          <div class="brand-logo">${icon("droplet", 18)}</div>
          <div class="min-w-0" style="flex:1">
            <p class="font-bold" style="margin:0">MANNOL</p>
            <p class="text-xs text-muted truncate" style="margin:0">${user.displayName}</p>
          </div>
          <button class="btn btn-ghost btn-icon" id="close-drawer" aria-label="Cerrar menú" title="Cerrar">${icon("x", 18)}</button>
        </div>
        <div class="drawer-body">
          <div class="card-dark" style="background: var(--bg-soft); color: var(--text); border-color: var(--border); border-radius: var(--radius-lg); padding: 0.75rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.75rem;">
            <div class="brand-logo" style="background: var(--primary-tint); color: var(--primary)">${user.role === 'admin' ? icon("shield", 18) : icon("store", 18)}</div>
            <div style="flex:1; min-width: 0;">
              <p class="text-sm font-semibold truncate" style="margin:0">${user.displayName}</p>
              <p class="text-xs text-muted" style="margin:0">${user.role === 'admin' ? 'Administrador' : (warehouse?.code || 'Local')}</p>
            </div>
            <span class="badge badge-outline" style="font-size: 0.5625rem">${user.role.toUpperCase()}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.25rem">
            ${allowedDrawer.map((item) => `<button class="drawer-item ${activeView === item.id ? 'active' : ''}" data-drawer-nav="${item.id}">${icon(item.icon, 16)}<span style="flex:1;text-align:left">${item.label}</span></button>`).join('')}
          </div>
          ${allowedAdmin.length > 0 ? `
            <div class="separator"></div>
            <p class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;padding:0 0.75rem;margin-bottom:0.5rem">Administración</p>
            <div style="display:flex;flex-direction:column;gap:0.25rem">
              ${allowedAdmin.map((item) => `<button class="drawer-item ${activeView === item.id ? 'active' : ''}" data-drawer-nav="${item.id}">${icon(item.icon, 16)}<span style="flex:1;text-align:left">${item.label}</span></button>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="drawer-footer">
          <button class="btn btn-ghost btn-block" id="logout-btn" aria-label="Cerrar sesión" style="justify-content:flex-start;color:var(--danger)">${icon("logout", 14)} Cerrar sesión</button>
          <p class="text-xs text-muted text-center mt-2" style="margin-top:0.5rem">${esc(APP_LABEL)} · Acceso por PIN de almacén</p>
          <div style="margin-top:0.75rem;padding:0.5rem 0.75rem;background:var(--bg-soft);border-radius:var(--radius);font-size:0.625rem;color:var(--text-muted);display:flex;flex-direction:column;gap:0.25rem">
            <div style="font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.25rem">Atajos</div>
            <div style="display:flex;justify-content:space-between"><span>Buscar</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd></span></div>
            <div style="display:flex;justify-content:space-between"><span>Nueva venta</span><kbd>N</kbd></div>
            <div style="display:flex;justify-content:space-between"><span>Dashboard</span><kbd>H</kbd></div>
            <div style="display:flex;justify-content:space-between"><span>Inventario</span><kbd>I</kbd></div>
            <div style="display:flex;justify-content:space-between"><span>Historial</span><kbd>V</kbd></div>
            <div style="display:flex;justify-content:space-between"><span>Gestores</span><kbd>G</kbd></div>
          </div>
        </div>
      </aside>
    `;

    dc.querySelector("#drawer-overlay").addEventListener("click", closeDrawer);
    dc.querySelector("#close-drawer").addEventListener("click", closeDrawer);
    dc.querySelector("#logout-btn").addEventListener("click", async () => {
      await logout();
      toast("Sesión cerrada", "info");
      navigate("home");
    });
    dc.querySelectorAll("[data-drawer-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeView = btn.dataset.drawerNav;
        closeDrawer();
        renderActiveView();
        updateNavActive();
      });
    });
  }

  function renderActiveView() {
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    const content = container.querySelector("#dashboard-content");
    if (!content) return;

    try {
      // Si es empleado_pin, mostrar interior del almacén en lugar del overview
      const user = store.getState().currentUser;
      const isPinEmployee = user?.role === "empleado_pin";
      const viewToRender = (activeView === "dashboard" && isPinEmployee) ? "warehouse-interior" : activeView;

      switch (viewToRender) {
        case "dashboard": cleanup = mountOverview(content, navigate); break;
        case "warehouse-interior": cleanup = mountWarehouseInterior(content, navigate); break;
        case "sales": cleanup = mountSalesView(content, navigate); break;
        case "history": cleanup = mountSalesHistoryView(content, navigate); break;
        case "stock": cleanup = mountStockView(content, navigate); break;
        case "managers": cleanup = mountManagersView(content, navigate); break;
        case "commissions": cleanup = mountCommissionsView(content, navigate); break;
        case "transfers": cleanup = mountTransfersView(content, navigate); break;
        case "catalog": cleanup = mountCatalogView(content, navigate); break;
        case "users": cleanup = mountUsersView(content, navigate); break;
        case "admin":
          // Admin se abre en su propio HTML (admin.html) para no cargar
          // todo el código de admin en la app de vendedores.
          window.location.href = "./admin.html";
          break;
        case "settings": cleanup = mountSettingsView(content, navigate); break;
        default: content.innerHTML = '<div class="empty-state">Vista no encontrada</div>';
      }
    } catch (err) {
      console.error("renderActiveView failed:", err);
      content.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  function mountOverview(content, navigate) {
    const store = getStore();
    const user = store.getState().currentUser;
    const warehouse = store.getState().currentWarehouse;
    let sales = [];
    let isLoading = true;

    function renderOverview() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      const todaySales = sales.filter((s) => s.createdAt >= todayStart && s.status === "COMPLETADA");
      const todayTotal = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
      const todayUnits = todaySales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
      const monthSales = sales.filter((s) => s.createdAt >= monthStart && s.status === "COMPLETADA");
      const monthTotal = monthSales.reduce((sum, s) => sum + s.totalAmount, 0);

      // By currency
      const byCurrency = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
      for (const s of todaySales) {
        if (s.currency) byCurrency[s.currency] = (byCurrency[s.currency] || 0) + s.totalAmount;
      }

      if (isLoading) {
        content.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div>
              <h1 class="text-2xl font-bold">Hola, ${user.displayName}</h1>
              <p class="text-sm text-muted" style="margin-top:0.25rem">
                Rol: <span class="badge badge-outline">${user.role}</span>
                ${warehouse ? ` · Almacén: <span class="badge badge-accent">${warehouse.name}</span>` : ""}
              </p>
            </div>
            <div class="grid md:grid-cols-2 gap-3">
              ${skeletonStatCard(2)}
            </div>
            <div class="card">
              <div class="card-header"><h2 class="card-title">Cargando ventas…</h2></div>
              <div class="card-content">
                ${skeletonCard(3)}
              </div>
            </div>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <div class="overview-grid">
          <div class="overview-header" style="grid-column: 1 / -1">
            <h1>Hola, ${user.displayName}</h1>
            <div class="meta">
              <span>Rol: <strong>${user.role}</strong></span>
              ${warehouse ? `<span>· Almacén: <strong>${warehouse.name}</strong></span>` : ""}
            </div>
          </div>

          <div class="kpi-row" style="grid-column: 1 / -1">
            <div class="stat-card">
              <div class="stat-label">${icon("receipt", 16)} Ventas de hoy</div>
              <div class="stat-value">${formatMoney(todayTotal, "USD")}</div>
              <div class="stat-sub">${todaySales.length} transacciones · ${todayUnits} unidades</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">${icon("trendingUp", 16)} Ventas del mes</div>
              <div class="stat-value">${formatMoney(monthTotal, "USD")}</div>
              <div class="stat-sub">${monthSales.length} transacciones</div>
            </div>
          </div>

          ${sales.length > 0 ? `
            <div class="charts-row" style="grid-column: 1 / -1">
              <div class="card">
                <div class="card-header"><h2 class="card-title">${icon("trendingUp", 14)} Ventas últimos 7 días</h2></div>
                <div class="card-content">
                  <div class="bar-chart-wrap">${barChart(buildLast7DaysData(sales), { height: 180, formatValue: (v) => formatMoney(v, "USD") })}</div>
                </div>
              </div>
              <div class="card">
                <div class="card-header"><h2 class="card-title">${icon("wallet", 14)} Hoy por moneda</h2></div>
                <div class="card-content">
                  <div class="donut-wrap">${buildCurrencyDonut(todaySales)}</div>
                </div>
              </div>
            </div>

            <div class="card top-products-card" style="grid-column: 1 / -1">
              <div class="card-header"><h2 class="card-title">${icon("tags", 14)} Top 5 productos más vendidos (30 días)</h2></div>
              <div class="card-content">
                ${buildTopProducts(sales, 30)}
              </div>
            </div>
          ` : ''}

          <div class="card" style="grid-column: 1 / -1">
            <div class="card-header"><h2 class="card-title">${icon("receipt", 14)} Ventas recientes</h2></div>
            <div class="card-content">
              ${sales.length === 0 ? `
                <div class="empty-state">
                  <div class="empty-state-icon">${icon("receipt", 24)}</div>
                  <p class="empty-state-title">No hay ventas todavía</p>
                  <p class="empty-state-desc">Cuando registres una venta, aparecerá aquí automáticamente.</p>
                </div>
              ` : `
                <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:24rem;overflow-y:auto">
                  ${sales.slice(0, 10).map((s) => `
                    <div class="flex items-center justify-between border rounded p-2 text-sm" style="border-color:var(--border)">
                      <div>
                        <div class="font-medium">${esc(s.code)} · ${esc(s.managerName || s.userName || '—')}</div>
                        <div class="text-xs text-muted">${s.items.length} items · ${formatDate(s.createdAt)}</div>
                      </div>
                      <div class="text-right">
                        <div class="font-bold">${formatMoney(s.totalAmount, "USD")}</div>
                        <span class="badge ${s.status === "COMPLETADA" ? "badge-accent" : s.status === "CANCELADA" ? "badge-danger" : "badge-warning"}" style="font-size:0.625rem">${esc(s.status)}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }

    function buildLast7DaysData(sales) {
      const days = [];
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now);
        day.setDate(day.getDate() - i);
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        const total = sales
          .filter((s) => s.createdAt >= day.getTime() && s.createdAt < next.getTime() && s.status === "COMPLETADA")
          .reduce((sum, s) => sum + s.totalAmount, 0);
        days.push({
          label: day.toLocaleDateString("es-ES", { weekday: "short" }).charAt(0).toUpperCase() + day.toLocaleDateString("es-ES", { weekday: "short" }).slice(1, 3),
          value: total,
        });
      }
      return days;
    }

    function buildCurrencyDonut(todaySales) {
      const byCurrency = { USD: 0, MN: 0, EUR: 0, TRANSFERENCIA: 0 };
      for (const s of todaySales) {
        if (s.currency) byCurrency[s.currency] = (byCurrency[s.currency] || 0) + s.totalAmount;
      }
      const data = [
        { label: "USD", value: byCurrency.USD, color: COLORS.usd },
        { label: "MN", value: byCurrency.MN, color: COLORS.mn },
        { label: "EUR", value: byCurrency.EUR, color: COLORS.eur },
        { label: "Transferencia", value: byCurrency.TRANSFERENCIA, color: COLORS.transfer },
      ].filter((d) => d.value > 0);
      const total = data.reduce((s, d) => s + d.value, 0);
      if (total === 0) return `<p class="text-xs text-muted">Sin ventas hoy</p>`;
      return `
        <div style="flex-shrink:0">
          ${donutChart(data, { size: 140, thickness: 16, centerLabel: formatMoney(total, "USD").replace('$', ''), centerSubLabel: "total" })}
        </div>
        <div style="flex:1;min-width:8rem">
          ${legend(data.map((d) => ({ label: d.label, value: formatMoney(d.value, d.label), color: d.color })))}
        </div>
      `;
    }

    function buildTopProducts(sales, daysBack) {
      const cutoff = Date.now() - daysBack * 86400000;
      const productCounts = {};
      for (const s of sales) {
        if (s.status !== "COMPLETADA") continue;
        if (s.createdAt < cutoff) continue;
        for (const item of s.items) {
          const key = item.productId;
          if (!productCounts[key]) {
            productCounts[key] = { name: item.productName, brand: item.brand, units: 0, revenue: 0 };
          }
          productCounts[key].units += item.quantity;
          productCounts[key].revenue += item.subtotal || (item.unitPrice * item.quantity);
        }
      }
      const top = Object.values(productCounts)
        .sort((a, b) => b.units - a.units)
        .slice(0, 5);
      if (top.length === 0) return `<p class="text-xs text-muted">Sin ventas completadas en los últimos ${daysBack} días</p>`;
      return top.map((p, i) => `
        <div class="top-product-item">
          <div class="top-product-rank ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}">${i + 1}</div>
          <div style="flex:1; min-width: 0;">
            <div class="text-sm font-medium truncate">${p.name}</div>
            <div class="text-xs text-muted">${p.brand || ''} · ${p.units} unidades</div>
          </div>
          <div class="text-right">
            <div class="text-sm font-bold">${formatMoney(p.revenue, "USD")}</div>
          </div>
        </div>
      `).join('');
    }

    renderOverview();

    if (!warehouse) {
      isLoading = false;
      renderOverview();
      return () => {};
    }
    const unsub = subscribeSales((items) => {
      sales = items;
      isLoading = false;
      renderOverview();
    }, { warehouseId: warehouse.id });
    return unsub;
  }

  renderShell();

  // ===== Keyboard shortcuts =====
  function onKeydown(e) {
    // Ignore if typing in an input
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return;
    if (e.target.isContentEditable) return;
    // Ignore if modifier keys other than Alt are pressed
    if (e.ctrlKey || e.metaKey) return;

    const key = e.key.toLowerCase();
    const shortcuts = {
      "n": () => { activeView = "sales"; renderActiveView(); updateNavActive(); },
      "h": () => { activeView = "dashboard"; renderActiveView(); updateNavActive(); },
      "i": () => { activeView = "stock"; renderActiveView(); updateNavActive(); },
      "v": () => { activeView = "history"; renderActiveView(); updateNavActive(); },
      "g": () => { activeView = "managers"; renderActiveView(); updateNavActive(); },
    };
    if (shortcuts[key]) {
      e.preventDefault();
      shortcuts[key]();
    }
  }
  document.addEventListener("keydown", onKeydown);

  return () => {
    if (cleanup) { try { cleanup(); } catch {} }
    if (bannerCleanup) { try { bannerCleanup(); } catch {} }
    document.removeEventListener("keydown", onKeydown);
  };
}
