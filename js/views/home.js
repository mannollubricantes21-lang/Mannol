// =====================================================
// Home view — MANNOL public landing
// Muestra: tasas del día, CTA login sutil, lista de almacenes
// =====================================================

import { getStore } from "../store.js";
import { listWarehouses, subscribeRates, syncElToqueRates, getSettings } from "../db.js";
import { formatMoney, formatDate } from "../currency.js";
import { toast, icon, esc } from "../ui.js";
import { isSupabaseConfiguredAsync } from "../supabase.js";

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
  const supabaseConfigured = state._supabaseConfigured;

  // Tasas en formato MANNOL: USD = X MN, EUR = Y MN
  // Si no hay rates cargados (modo demo sin sync, o Supabase vacío),
  // usamos defaults razonables en lugar de NaN.
  const DEFAULT_USD_IN_MN = 320;
  const DEFAULT_EUR_IN_MN = 345;
  const usdInMN = mnRate && mnRate.rateUSD > 0 ? (1 / mnRate.rateUSD) : DEFAULT_USD_IN_MN;
  const eurInMN = (mnRate && mnRate.rateUSD > 0 && eurRate && eurRate.rateUSD > 0)
    ? (eurRate.rateUSD / mnRate.rateUSD)
    : DEFAULT_EUR_IN_MN;
  const usdSource = mnRate?.source || "manual";
  const eurSource = eurRate?.source || "manual";
  const usdMarkupPct = settings.elToqueMarkup > 0 ? settings.elToqueMarkup : 0;

  return `
    <div class="mobile-shell">
      <!-- Diagonal background (mantenemos el estilo MANNOL de zona inferior oscura) -->
      <div class="bg-diagonal"></div>

      <!-- ===== Premium header ===== -->
      <header class="premium-header">
        <div class="premium-header-inner">
          <button class="premium-header-btn" data-action="open-drawer" aria-label="Menú">
            ${icon("menu", 20)}
          </button>
          <div class="flex items-center gap-2 min-w-0">
            <div class="brand-logo" id="home-logo" style="cursor: pointer; user-select: none;" title="MANNOL" role="button" tabindex="0" aria-label="Logo MANNOL">
              ${icon("droplet", 18)}
            </div>
            <div class="min-w-0">
              <h1 class="font-bold text-base truncate" style="margin:0;line-height:1.2;letter-spacing:-0.01em">MANNOL</h1>
              <p class="text-xs text-muted truncate" style="margin:0;line-height:1.2">
                ${user ? `${esc(user.displayName)}` : 'Aceites y lubricantes'}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button class="premium-header-btn" data-action="refresh" aria-label="Refrescar" ${syncing ? "disabled" : ""}>
              ${syncing ? `<span class="animate-spin" style="display:inline-block">${icon("refresh", 18)}</span>` : icon("refresh", 18)}
            </button>
            <button class="premium-header-btn" data-action="toggle-theme" aria-label="Cambiar tema">
              ${state.theme === 'dark' ? icon("sun", 18) : icon("moon", 18)}
            </button>
          </div>
        </div>
      </header>

      <!-- ===== Premium main ===== -->
      <main class="premium-home-main">
        <!-- ===== Hero section ===== -->
        <section class="home-hero premium-fade-in">
          <div class="home-hero-bg"></div>
          ${user ? `
            <div class="home-hero-badge">
              <span class="dot"></span>
              ${user.role === 'admin' ? 'Panel admin' : user.role === 'gestor' ? 'Gestor' : 'Vendedor'}
            </div>
          ` : `
            <div class="home-hero-badge">
              <span class="dot"></span>
              En línea
            </div>
          `}
          <div class="home-hero-logo">${icon("droplet", 32)}</div>
          <h2 class="home-hero-title">MANNOL POS</h2>
          <p class="home-hero-subtitle">Aceites y lubricantes · Control de ventas y stock</p>
        </section>

        <!-- ===== Setup banner (si Supabase no está configurado) ===== -->
        ${!supabaseConfigured ? `
          <section class="premium-setup-banner premium-fade-in premium-fade-in-delay-1">
            <div class="premium-setup-banner-content">
              <div class="premium-setup-banner-header">
                <div class="premium-setup-banner-icon">${icon("droplet", 20)}</div>
                <div style="flex:1;min-width:0">
                  <h3 class="premium-setup-banner-title">Conectá Supabase en este dispositivo</h3>
                  <p class="premium-setup-banner-desc">
                    Estás en <strong>modo demo</strong>. Los datos no se guardan en la nube.
                    Conectá tu base de datos Supabase con el asistente — 10 minutos, sin tocar código.
                  </p>
                </div>
              </div>
              <a href="./setup.html" class="premium-setup-banner-btn" style="align-self:stretch">
                ${icon("zap", 16)} Configurar Supabase ahora
              </a>
              <p class="premium-setup-banner-hint">¿Ya tenés Supabase? Solo necesitás tu URL y tu anon key.</p>
            </div>
          </section>
        ` : ''}

        <!-- ===== Tasas del día ===== -->
        <section class="premium-fade-in premium-fade-in-delay-2">
          <div class="premium-section-header">
            <h3 class="premium-section-title">Tasas del día</h3>
            <span class="premium-source-badge ${usdSource === 'api' ? 'api' : 'manual'}">
              <span class="dot"></span>
              ${usdSource === 'api' ? 'elToque' : 'Manual'}
            </span>
          </div>
          ${usdMarkupPct > 0 ? `
            <div class="premium-markup-notice">
              ${icon("trendingUp", 12)} Margen aplicado: <strong>+${usdMarkupPct}%</strong> sobre tasa oficial
            </div>
          ` : ''}
          <div class="premium-rates">
            <div class="premium-rate-tile premium-rate-tile-usd">
              <div class="premium-rate-tile-currency">
                ${icon("dollar", 14)} USD
                ${usdMarkupPct > 0 ? `<span class="premium-rate-tile-markup">+${usdMarkupPct}%</span>` : ''}
              </div>
              <div class="premium-rate-tile-value">
                ${usdInMN.toFixed(0)}<span style="font-size:0.625rem;color:var(--text-muted);font-weight:600;margin-left:0.25rem">MN</span>
              </div>
              <div class="premium-rate-tile-sub">1 USD = ${usdInMN.toFixed(0)} MN</div>
            </div>
            <div class="premium-rate-tile premium-rate-tile-eur">
              <div class="premium-rate-tile-currency">
                ${icon("euro", 14)} EUR
                ${usdMarkupPct > 0 ? `<span class="premium-rate-tile-markup">+${usdMarkupPct}%</span>` : ''}
              </div>
              <div class="premium-rate-tile-value">
                ${eurInMN.toFixed(0)}<span style="font-size:0.625rem;color:var(--text-muted);font-weight:600;margin-left:0.25rem">MN</span>
              </div>
              <div class="premium-rate-tile-sub">1 EUR = ${eurInMN.toFixed(0)} MN</div>
            </div>
          </div>
        </section>

        <!-- ===== Almacenes ===== -->
        <section class="premium-fade-in premium-fade-in-delay-3">
          <div class="premium-section-header">
            <h3 class="premium-section-title">Almacenes</h3>
            <span class="premium-section-count">${warehouses.length}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            ${warehouses.length === 0 ? `
              <div class="premium-card" style="padding:2rem 1rem;text-align:center">
                <div class="premium-empty-icon">${icon("building", 24)}</div>
                <p class="premium-empty-title">Sin almacenes</p>
                <p class="premium-empty-desc">Iniciá sesión como admin para crear almacenes.</p>
              </div>
            ` : warehouses.map((w, i) => {
              const isOwn = user && user.role === 'warehouse' && user.warehouseId === w.id;
              return `
                <div class="premium-warehouse ${isOwn ? 'warehouse-card-own' : ''}" data-enter-warehouse="${esc(w.id)}" style="cursor:pointer">
                  <div class="premium-warehouse-header">
                    <div class="premium-warehouse-icon">${icon("building", 22)}</div>
                    <div style="flex:1;min-width:0">
                      <div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:wrap">
                        <h4 class="premium-warehouse-name">${esc(w.name)}</h4>
                        ${isOwn ? `<span class="premium-warehouse-own-tag">Tu local</span>` : ''}
                      </div>
                      <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.25rem">
                        <span class="premium-warehouse-code">${esc(w.code)}</span>
                        ${w.address ? `
                          <span class="premium-warehouse-meta" style="min-width:0;flex:1">
                            ${icon("mapPin", 12)}
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.address)}</span>
                          </span>
                        ` : ''}
                      </div>
                      ${w.phone ? `
                        <div class="premium-warehouse-meta" style="margin-top:0.25rem">
                          ${icon("phone", 12)}
                          ${esc(w.phone)}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  <button class="premium-cta-btn" style="width:100%" aria-label="Entrar al almacén ${esc(w.name)} con PIN">
                    ${icon("lock", 14)}
                    <span>Entrar al almacén</span>
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

  // Load settings + warehouses + rates + supabase status
  // Track subscriptions/promises for cleanup to avoid memory leaks on re-mount
  let settingsPromise = null;
  let warehousesPromise = null;
  let mounted = true;

  // Check Supabase config status (async) and re-render when known
  isSupabaseConfiguredAsync().then((configured) => {
    if (!mounted) return;
    store.setState({ _supabaseConfigured: configured });
    render();
  }).catch(() => {
    if (!mounted) return;
    store.setState({ _supabaseConfigured: false });
    render();
  });

  settingsPromise = getSettings().then((s) => {
    if (!mounted) return;
    store.setSettings(s);
    render();
  }).catch(() => {});

  warehousesPromise = listWarehouses().then((list) => {
    if (!mounted) return;
    // Si Supabase no está configurado o no hay almacenes, usar datos demo
    if (!list || list.length === 0) {
      const demoWarehouses = [
        { id: "demo-1", name: "Víbora", code: "VIB", address: "Obispo #45, Habana Vieja", phone: "+53 7 866-2020", active: true, pin: "2025", hasPin: true },
        { id: "demo-2", name: "Lisa", code: "LIS", address: "Av. 51 #7308, La Lisa", phone: "+53 7 855-3030", active: true, pin: "2025", hasPin: true },
        { id: "demo-3", name: "Playa", code: "PLY", address: "Calle 70 #1108, Miramar", phone: "+53 7 855-4040", active: true, pin: "2025", hasPin: true },
        { id: "demo-4", name: "Centro Habana", code: "CHB", address: "Galiano #258, Centro Habana", phone: "+53 7 866-5050", active: true, pin: "2025", hasPin: true },
      ];
      store.setState({ _warehouses: demoWarehouses });
    } else {
      store.setState({ _warehouses: list.filter((w) => w.active !== false) });
    }
    render();
  }).catch(() => {});

  const unsubRates = subscribeRates((rates) => {
    if (!mounted) return;
    store.setRates(rates);
    render();
  });

  function render() {
    container.innerHTML = renderHomeView(navigate);
    wireEvents();
  }

  function wireEvents() {
    // ===== Easter egg: 3 clicks en el logo → acceso admin =====
    const logo = container.querySelector("#home-logo");
    if (logo) {
      let clickCount = 0;
      let clickTimer = null;
      const handleLogoClick = () => {
        clickCount++;
        if (clickTimer) clearTimeout(clickTimer);
        if (clickCount >= 3) {
          clickCount = 0;
          // Pequeña animación de confirmación
          logo.style.transform = "scale(1.2)";
          logo.style.transition = "transform 0.2s";
          setTimeout(() => { logo.style.transform = ""; }, 200);
          toast("Acceso admin", "info", 1000);
          navigate("login");
        } else {
          clickTimer = setTimeout(() => { clickCount = 0; }, 800);
        }
      };
      logo.addEventListener("click", handleLogoClick);
      logo.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleLogoClick();
        }
      });
    }

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

    // Enter warehouse → PIN view (click en toda la card o en el botón)
    container.querySelectorAll("[data-enter-warehouse]").forEach((card) => {
      card.addEventListener("click", (e) => {
        // Evitar doble disparo si el click fue en el botón interno
        if (e.target.closest("button")) return;
        const wid = card.dataset.enterWarehouse;
        const w = (store.getState()._warehouses || []).find((x) => x.id === wid);
        if (w) {
          store.setState({ _selectedWarehouse: w });
          navigate("pin");
        }
      });
    });
    // Click directo en el botón "Entrar al almacén" (cuando el click fue en el botón)
    container.querySelectorAll(".premium-warehouse button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = btn.closest("[data-enter-warehouse]");
        if (!card) return;
        const wid = card.dataset.enterWarehouse;
        const w = (store.getState()._warehouses || []).find((x) => x.id === wid);
        if (w) {
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
    mounted = false;
    if (unsubRates) {
      try { unsubRates(); } catch {}
    }
  };
}
