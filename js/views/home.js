// =====================================================
// Home view — MANNOL public landing
// Muestra: tasas del día, CTA login sutil, lista de almacenes
// =====================================================

import { getStore } from "../store.js";
import { listWarehouses, subscribeRates, syncElToqueRates, getSettings } from "../firestore.js";
import { formatMoney, formatDate } from "../currency.js";
import { toast, icon } from "../ui.js";

export function renderHomeView(navigate) {
  const store = getStore();
  const state = store.getState();
  const settings = state.settings;
  const ratesMap = state.rates;
  const mnRate = ratesMap["MN"];
  const eurRate = ratesMap["EUR"];
  const warehouses = state._warehouses || [];
  const isOnline = navigator.onLine;
  const syncing = state._syncing;
  const user = state.currentUser;

  // Tasas en formato MANNOL: USD = X MN, EUR = Y MN
  const usdInMN = mnRate ? (1 / mnRate.rateUSD) : 320;
  const eurInMN = (mnRate && eurRate) ? (eurRate.rateUSD / mnRate.rateUSD) : 345;
  const usdSource = mnRate?.source || "manual";
  const eurSource = eurRate?.source || "manual";
  const usdMarkupPct = settings.elToqueMarkup > 0 ? settings.elToqueMarkup : 0;

  return `
    <div class="mobile-shell">
      <!-- Diagonal background -->
      <div class="bg-diagonal"></div>

      <!-- Top header -->
      <header class="app-header" style="background: color-mix(in oklab, var(--bg) 70%, transparent);">
        <div class="app-header-inner">
          <div class="flex items-center gap-2">
            <button class="btn btn-ghost btn-icon" data-action="open-drawer" aria-label="Menú">
              ${icon("menu", 20)}
            </button>
            <div class="flex items-center gap-2 min-w-0">
              <div class="brand-logo">
                ${icon("droplet", 18)}
              </div>
              <div class="min-w-0" style="leading-tight;">
                <h1 class="font-bold text-base truncate" style="margin:0">MANNOL</h1>
                <p class="text-xs text-muted truncate" style="margin:0">
                  ${user ? `${user.displayName} · ${user.role === 'admin' ? 'Admin' : 'Local'}` : 'Aceites y lubricantes'}
                </p>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button class="btn btn-ghost btn-icon" data-action="refresh" aria-label="Refrescar" ${syncing ? "disabled" : ""}>
              ${icon("refresh", 18)}${syncing ? '<span class="animate-spin" style="position:absolute"></span>' : ''}
            </button>
            <button class="btn btn-ghost btn-icon" data-action="toggle-theme" aria-label="Cambiar tema">
              ${state.theme === 'dark' ? icon("sun", 18) : icon("moon", 18)}
            </button>
          </div>
        </div>
      </header>

      <!-- Main content -->
      <main class="mobile-main" style="display:flex;flex-direction:column;gap:1.25rem">
        <!-- ===== Tasas del día ===== -->
        <section class="card" style="background: var(--bg-elevated);">
          <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
            <h2 class="card-title text-sm flex items-center gap-2" style="color: var(--primary)">
              ${icon("trendingUp", 16)} Tasas del día
            </h2>
            <span class="badge ${usdSource === 'api' ? 'badge-accent' : 'badge-warning'}" style="font-size: 0.625rem">
              ${usdSource === 'api' ? icon("check", 12) : icon("alertTriangle", 12)}
              ${usdSource === 'api' ? 'elToque' : 'Manual'}
            </span>
          </div>
          <div class="card-content">
            ${usdMarkupPct > 0 ? `
              <div class="mb-3" style="background: color-mix(in oklab, var(--warning) 10%, transparent); border: 1px solid color-mix(in oklab, var(--warning) 30%, transparent); border-radius: var(--radius); padding: 0.375rem 0.75rem; text-align: center;">
                <p class="text-xs font-medium" style="color: var(--warning);">
                  Margen aplicado: <strong>+${usdMarkupPct}%</strong> sobre tasa oficial
                </p>
              </div>
            ` : ''}
            <div class="grid grid-cols-2 gap-3">
              <div class="rate-card rate-card-usd">
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-1 text-xs text-muted">
                    ${icon("dollar", 14)} USD
                  </div>
                  ${usdMarkupPct > 0 ? `
                    <span class="badge badge-warning" style="font-size:0.5625rem;height:1rem;padding:0 0.25rem">+${usdMarkupPct}%</span>
                  ` : ''}
                </div>
                <p class="rate-value">
                  ${usdInMN.toFixed(0)}
                  <span class="text-xs font-normal text-muted ml-1">MN</span>
                </p>
                <p class="rate-sub">1 USD = ${usdInMN.toFixed(0)} MN</p>
              </div>
              <div class="rate-card rate-card-eur">
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-1 text-xs text-muted">
                    ${icon("euro", 14)} EUR
                  </div>
                  ${usdMarkupPct > 0 ? `
                    <span class="badge badge-warning" style="font-size:0.5625rem;height:1rem;padding:0 0.25rem">+${usdMarkupPct}%</span>
                  ` : ''}
                </div>
                <p class="rate-value">
                  ${eurInMN.toFixed(0)}
                  <span class="text-xs font-normal text-muted ml-1">MN</span>
                </p>
                <p class="rate-sub">1 EUR = ${eurInMN.toFixed(0)} MN</p>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== CTA login sutil ===== -->
        ${!user ? `
          <div class="text-center">
            <button class="text-xs text-muted underline" style="background:transparent;border:none;cursor:pointer" data-nav="login">
              ¿Eres administrador o gestor? Inicia sesión
            </button>
          </div>
        ` : ''}

        <!-- ===== Lista de almacenes ===== -->
        <section style="display:flex;flex-direction:column;gap:0.75rem">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-sm font-semibold text-on-dark flex items-center gap-1.5">
              ${icon("building", 16)} Almacenes (${warehouses.length})
            </h2>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.625rem">
            ${warehouses.length === 0 ? `
              <div class="card-dark empty-state text-on-dark">
                No hay almacenes configurados. Inicia sesión como admin para crearlos.
              </div>
            ` : warehouses.map((w) => {
              const isOwn = user && user.role === 'warehouse' && user.warehouseId === w.id;
              return `
                <div class="warehouse-card ${isOwn ? 'warehouse-card-own' : ''}">
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="min-w-0" style="flex:1">
                      <div class="flex items-center gap-2">
                        <span class="badge badge-dark font-mono" style="font-size: 0.625rem">${w.code}</span>
                        <h3 class="font-semibold text-sm truncate text-on-dark" style="margin:0">${w.name}</h3>
                        ${isOwn ? '<span class="badge badge-accent" style="font-size: 0.5625rem">Tu local</span>' : ''}
                      </div>
                      ${w.address ? `
                        <p class="text-xs text-muted-on-dark flex items-start gap-1 mt-1" style="margin:0.25rem 0 0">
                          ${icon("mapPin", 12)}
                          <span>${w.address}</span>
                        </p>
                      ` : ''}
                      ${w.phone ? `
                        <p class="text-xs text-muted-on-dark flex items-center gap-1" style="margin:0.125rem 0 0">
                          ${icon("phone", 12)}
                          ${w.phone}
                        </p>
                      ` : ''}
                    </div>
                  </div>
                  <button class="btn btn-primary btn-block btn-sm" data-enter-warehouse="${w.id}" style="height:2.5rem;font-size:0.75rem">
                    ${icon("lock", 14)}
                    Entrar al almacén
                    ${icon("arrowRight", 14)}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      </main>

      <!-- Bottom navigation placeholder (filled by app.js) -->
      <nav class="bottom-nav" id="bottom-nav"></nav>

      <!-- Drawer placeholder -->
      <div id="drawer-mount"></div>
    </div>
  `;
}

export function mountHomeView(container, navigate) {
  const store = getStore();

  // Load settings + warehouses + rates
  getSettings().then((s) => {
    store.setSettings(s);
    render();
  });

  listWarehouses().then((list) => {
    // Si no hay Firebase configurado o no hay almacenes, usar datos demo
    if (!list || list.length === 0) {
      const demoWarehouses = [
        { id: "demo-1", name: "Víbora", code: "VIB", address: "Obispo #45, Habana Vieja", phone: "+53 7 866-2020", active: true, pinCode: "2025", hasPin: true },
        { id: "demo-2", name: "Lisa", code: "LIS", address: "Av. 51 #7308, La Lisa", phone: "+53 7 855-3030", active: true, pinCode: "2025", hasPin: true },
        { id: "demo-3", name: "Playa", code: "PLY", address: "Calle 70 #1108, Miramar", phone: "+53 7 855-4040", active: true, pinCode: "2025", hasPin: true },
        { id: "demo-4", name: "Centro Habana", code: "CHB", address: "Galiano #258, Centro Habana", phone: "+53 7 866-5050", active: true, pinCode: "2025", hasPin: true },
      ];
      store.setState({ _warehouses: demoWarehouses });
    } else {
      store.setState({ _warehouses: list.filter((w) => w.active !== false) });
    }
    render();
  });

  const unsubRates = subscribeRates((rates) => {
    store.setRates(rates);
    render();
  });

  function render() {
    container.innerHTML = renderHomeView(navigate);
    wireEvents();
  }

  function wireEvents() {
    // Navigation buttons
    container.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.nav));
    });

    // Refresh button
    const refreshBtn = container.querySelector('[data-action="refresh"]');
    if (refreshBtn) {
      refreshBtn.addEventListener("click", handleSyncRates);
    }

    // Theme toggle
    const themeBtn = container.querySelector('[data-action="toggle-theme"]');
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const current = store.getState().theme;
        const next = current === 'dark' ? 'light' : 'dark';
        store.setTheme(next);
        render();
      });
    }

    // Enter warehouse → PIN view
    container.querySelectorAll("[data-enter-warehouse]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wid = btn.dataset.enterWarehouse;
        const w = (store.getState()._warehouses || []).find((x) => x.id === wid);
        if (w) {
          // Stash selected warehouse, navigate to pin
          store.setState({ _selectedWarehouse: w });
          navigate("pin");
        }
      });
    });

    // Drawer
    const drawerBtn = container.querySelector('[data-action="open-drawer"]');
    if (drawerBtn) {
      drawerBtn.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("open-drawer"));
      });
    }
  }

  async function handleSyncRates() {
    const store = getStore();
    store.setState({ _syncing: true });
    render();
    try {
      const fresh = await syncElToqueRates(store.getState().settings.elToqueMarkup);
      store.setRates(fresh);
      store.setSettings({ lastRateSync: Date.now() });
      toast(`Tasas sincronizadas (${fresh.length} monedas)`, "success");
    } catch (err) {
      toast("No se pudieron sincronizar las tasas de elToque", "error");
    } finally {
      store.setState({ _syncing: false });
      render();
    }
  }

  // Initial render
  render();

  return () => {
    unsubRates();
  };
}
