// =====================================================
// Dashboard view — Mobile shell with bottom nav + FAB + drawer
// Includes all views: dashboard, sales, stock, managers, commissions, transfers, admin, catalog, users, settings, history
// =====================================================

import { getStore } from "../store.js";
import { subscribeSales, listWarehouses, listManagers, listCards, listCategories } from "../firestore.js";
import { logout } from "../auth.js";
import { formatMoney, formatDate } from "../currency.js";
import { toast, icon } from "../ui.js";
import { mountSalesView } from "./sales.js";
import { mountStockView } from "./stock.js";
import { mountCommissionsView } from "./commissions.js";
import { mountTransfersView } from "./transfers.js";
import { mountCatalogView } from "./catalog.js";
import { mountUsersView } from "./users.js";
import { mountSettingsView } from "./settings.js";
import { mountSalesHistoryView } from "./sales-history.js";
import { mountManagersView } from "./managers.js";
import { mountAdminView } from "./admin.js";
import { mountWarehouseInterior } from "./warehouse-interior.js";
import { createSyncBanner } from "../components/sync-banner.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "Inicio", icon: "home" },
  { id: "sales", label: "Ventas", icon: "cart" },
  { id: "stock", label: "Inventario", icon: "boxes" },
  { id: "more", label: "Más", icon: "more" },
];

const DRAWER_ITEMS = [
  { id: "dashboard", label: "Inicio", icon: "home", roles: ["admin", "gestor", "vendedor", "warehouse", "empleado_pin"] },
  { id: "sales", label: "Ventas", icon: "cart", roles: ["admin", "gestor", "vendedor", "warehouse", "empleado_pin"] },
  { id: "stock", label: "Inventario", icon: "boxes", roles: ["admin", "gestor", "warehouse", "empleado_pin"] },
  { id: "managers", label: "Gestores", icon: "users", roles: ["admin", "gestor", "vendedor", "warehouse"] },
  { id: "history", label: "Historial", icon: "receipt", roles: ["admin", "gestor", "vendedor", "warehouse"] },
  { id: "catalog", label: "Catálogo", icon: "tags", roles: ["admin", "gestor"] },
];

const DRAWER_ADMIN_ITEMS = [
  { id: "commissions", label: "Comisiones", icon: "wallet", roles: ["admin"] },
  { id: "transfers", label: "Transferencias", icon: "creditCard", roles: ["admin", "warehouse"] },
  { id: "users", label: "Usuarios", icon: "userCog", roles: ["admin"] },
  { id: "admin", label: "Panel admin", icon: "settings", roles: ["admin"] },
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
              <button class="btn btn-ghost btn-icon" id="open-drawer-btn" aria-label="Menú">${icon("menu", 20)}</button>
              <div class="flex items-center gap-2 min-w-0">
                <div class="brand-logo">${icon("droplet", 18)}</div>
                <div class="min-w-0" style="line-height: 1.2;">
                  <h1 class="font-bold text-base truncate" style="margin:0">MANNOL</h1>
                  <p class="text-xs text-muted truncate" style="margin:0">${user.displayName} · ${warehouse?.code || user.role}</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button class="btn btn-ghost btn-icon" id="refresh-btn" aria-label="Refrescar">${icon("refresh", 18)}</button>
              <button class="btn btn-ghost btn-icon" id="theme-btn" aria-label="Cambiar tema">${state.theme === 'dark' ? icon("sun", 18) : icon("moon", 18)}</button>
            </div>
          </div>
        </header>

        <main class="mobile-main">
          <div id="sync-banner-mount"></div>
          <div id="dashboard-content"></div>
        </main>

        <nav class="bottom-nav">
          <div style="position:relative">
            <button class="fab" id="fab-sell" aria-label="Registrar venta">${icon("cart", 24)}</button>
            <div class="bottom-nav-bar">
              ${NAV_ITEMS.slice(0, 2).map((item) => `
                <button class="nav-btn ${activeView === item.id ? 'active' : ''}" data-nav="${item.id}">${icon(item.icon, 20)}<span class="nav-btn-label">${item.label}</span></button>
              `).join('')}
              <div class="flex items-center justify-center"></div>
              ${NAV_ITEMS.slice(2).map((item) => `
                <button class="nav-btn ${activeView === item.id ? 'active' : ''}" data-nav="${item.id}">${icon(item.icon, 20)}<span class="nav-btn-label">${item.label}</span></button>
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

    container.querySelector("#fab-sell").addEventListener("click", () => { activeView = "sales"; renderActiveView(); updateNavActive(); });
    container.querySelector("#open-drawer-btn").addEventListener("click", openDrawer);
    container.querySelector("#refresh-btn").addEventListener("click", () => {
      const btn = container.querySelector("#refresh-btn");
      btn.innerHTML = `<div class="spinner spinner-sm"></div>`;
      setTimeout(() => { btn.innerHTML = icon("refresh", 18); if (cleanup) try { cleanup(); } catch {} renderActiveView(); }, 500);
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
          <button class="btn btn-ghost btn-icon" id="close-drawer">${icon("x", 18)}</button>
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
          <button class="btn btn-ghost btn-block" id="logout-btn" style="justify-content:flex-start;color:var(--danger)">${icon("logout", 14)} Cerrar sesión</button>
          <p class="text-xs text-muted text-center mt-2" style="margin-top:0.5rem">MANNOL v10.2 · Acceso por PIN de almacén</p>
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
        case "admin": cleanup = mountAdminView(content, navigate); break;
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

          ${todaySales.length > 0 ? `
            <div class="card">
              <div class="card-header"><h2 class="card-title">Ventas de hoy por moneda</h2></div>
              <div class="card-content">
                <div class="grid grid-cols-2 gap-2">
                  ${Object.entries(byCurrency).filter(([_, v]) => v > 0).map(([curr, val]) => `
                    <div class="rate-card rate-card-usd">
                      <div class="text-xs text-muted">${curr}</div>
                      <div class="rate-value">${formatMoney(val, curr)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          ` : ''}

          <div class="card">
            <div class="card-header"><h2 class="card-title">Ventas recientes</h2></div>
            <div class="card-content">
              ${sales.length === 0 ? `<div class="empty-state">No hay ventas todavía</div>` : `
                <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:24rem;overflow-y:auto">
                  ${sales.slice(0, 10).map((s) => `
                    <div class="flex items-center justify-between border rounded p-2 text-sm" style="border-color:var(--border)">
                      <div>
                        <div class="font-medium">${s.code} · ${s.managerName || s.userName || '—'}</div>
                        <div class="text-xs text-muted">${s.items.length} items · ${formatDate(s.createdAt)}</div>
                      </div>
                      <div class="text-right">
                        <div class="font-bold">${formatMoney(s.totalAmount, "USD")}</div>
                        <span class="badge ${s.status === "COMPLETADA" ? "badge-accent" : s.status === "CANCELADA" ? "badge-danger" : "badge-warning"}" style="font-size:0.625rem">${s.status}</span>
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

    renderOverview();

    if (!warehouse) return () => {};
    const unsub = subscribeSales((items) => {
      sales = items;
      renderOverview();
    }, { warehouseId: warehouse.id });
    return unsub;
  }

  renderShell();
  return () => {
    if (cleanup) { try { cleanup(); } catch {} }
    if (bannerCleanup) { try { bannerCleanup(); } catch {} }
  };
}
