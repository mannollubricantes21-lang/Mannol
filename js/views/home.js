// =====================================================
// Home view — MANNOL public landing
// Muestra: tasas del día, CTA login sutil, lista de almacenes
// =====================================================

import { getStore } from "../store.js";
import { listWarehouses, subscribeRates, syncElToqueRates, getSettings, getRateConfig, fetchPublishedTasa } from "../db.js";
import { formatMoney, formatDate, convertAmount, formatMoneyGrouped, parseAmountInput } from "../currency.js";
import { toast, icon, esc, showModal, brandMark, warehouseColor } from "../ui.js";
import { APP_LABEL } from "../version.js";
import { isSupabaseConfiguredAsync, getStoredSupabaseConfig, saveStoredSupabaseConfig, clearStoredSupabaseConfig } from "../supabase.js";

// v5.10.0: tasas del inicio en un solo sitio (vista + conversor)
function getHomeRates(state) {
  const mnRate = state.rates["MN"];
  const eurRate = state.rates["EUR"];
  // v5.39.0: sin tasa real se muestra «—» (antes salían 320 / 345 inventados)
  const usdInMN = mnRate && mnRate.rateUSD > 0 ? (1 / mnRate.rateUSD) : null;
  const eurInMN = (mnRate && mnRate.rateUSD > 0 && eurRate && eurRate.rateUSD > 0)
    ? (eurRate.rateUSD / mnRate.rateUSD)
    : null;
  const markupPct = state.settings?.elToqueMarkup > 0 ? state.settings.elToqueMarkup : 0;
  return { usdInMN, eurInMN, markupPct, mnRate, eurRate };
}

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
  // v5.4.0: banner de configuración descartable (persistido por dispositivo)
  const setupBannerDismissed = (() => {
    try { return localStorage.getItem("mannol_setup_banner_dismissed") === "1"; } catch { return false; }
  })();

  // Tasas en formato MANNOL: USD = X MN, EUR = Y MN
  // Si no hay rates cargados (modo demo sin sync, o Supabase vacío),
  // usamos defaults razonables en lugar de NaN.
  const { usdInMN, eurInMN } = getHomeRates(state);
  const usdSource = mnRate?.source || "manual";
  const eurSource = eurRate?.source || "manual";
  // v5.28.0: el margen real sale de Admin → Tasas (fijo en MN, p. ej. +10, o %)
  const rm = state._rateMarkup;
  // v5.39.0: el margen sobre la tasa oficial solo lo ve el admin
  const isAdminUser = state.currentUser?.role === "admin";
  const markupText = isAdminUser && rm && Number(rm.markupUsd) > 0
    ? (rm.markupMode === "FIXED" ? `+${Number(rm.markupUsd)} MN por USD` : `+${Number(rm.markupUsd)}%`)
    : "";

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
            <div class="brand-logo brand-logo--mark" id="home-logo" style="cursor: pointer; user-select: none;" title="MANNOL" role="button" tabindex="0" aria-label="Logo MANNOL">
              ${brandMark()}
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
        <!-- v5.8 (móvil): se quitó el hero "MANNOL POS" — repetía logo y nombre del header
             y empujaba los almacenes fuera de la primera pantalla. El estado sin conexión
             ya lo muestra el indicador .offline-badge. -->

        <!-- ===== Acceso rápido al panel admin (v5.1.4, solo admin) ===== -->
        ${user && user.role === 'admin' ? `
          <section class="premium-fade-in premium-fade-in-delay-1">
            <a href="./admin.html" class="premium-cta-btn" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;width:100%;text-decoration:none;font-weight:700">
              ${icon("shield", 16)}
              <span>Abrir panel admin</span>
              ${icon("arrowRight", 14)}
            </a>
          </section>
        ` : ''}

        <!-- ===== Setup banner (si Supabase no está configurado; descartable v5.4.0) ===== -->
        ${!supabaseConfigured && !setupBannerDismissed ? `
          <section class="premium-setup-banner premium-fade-in premium-fade-in-delay-1">
            <div class="premium-setup-banner-content">
              <div class="premium-setup-banner-header">
                <div class="premium-setup-banner-icon">${icon("droplet", 20)}</div>
                <div style="flex:1;min-width:0">
                  <h3 class="premium-setup-banner-title">Conecta Supabase en este dispositivo</h3>
                  <p class="premium-setup-banner-desc">
                    Estás en <strong>modo demo</strong>: los datos no se guardan en la nube.
                    Revisa que <code>js/supabase-config.js</code> tenga la URL y la clave de tu proyecto.
                  </p>
                </div>
                <button class="btn btn-ghost btn-sm" data-action="dismiss-setup" aria-label="Ocultar banner" title="Ocultar este banner">${icon("x", 16)}</button>
              </div>
              <p class="premium-setup-banner-hint"><button class="btn btn-ghost btn-sm" data-action="dismiss-setup" style="padding:0 0.25rem;font-size:0.6875rem;color:var(--text-muted)">No volver a mostrar</button></p>
            </div>
          </section>
        ` : ''}

        <!-- ===== Tasas del día ===== -->
        <section class="premium-fade-in premium-fade-in-delay-2">
          <div class="premium-section-header">
            <h3 class="premium-section-title">Tasas del día</h3>
            <div class="rates-header-right">
              <button type="button" class="rates-convert-btn" data-action="open-converter">${icon("calculator", 14)} Convertir</button>
              <span class="premium-source-badge ${usdSource === 'api' ? 'api' : 'manual'}">
                <span class="dot"></span>
                ${usdSource === 'api' ? 'elToque' : 'Manual'}
              </span>
            </div>
          </div>
          <div class="premium-rates">
            <!-- v5.39.4 (2.5.3): sin aria-label — el nombre accesible es el propio
                 contenido dinámico ("USD 455 MN 1 USD = 455 MN"), que siempre
                 coincide con lo visible aunque cambie la tasa -->
            <div class="premium-rate-tile premium-rate-tile-usd" role="button" tabindex="0" data-convert="USD">
              <div class="premium-rate-tile-currency">${icon("dollar", 14)} USD</div>
              <div class="premium-rate-tile-value">
                ${usdInMN ? usdInMN.toFixed(0) : "—"}<span style="font-size:0.6875rem;color:var(--text-muted);font-weight:600;margin-left:0.25rem">MN</span>
              </div>
              <div class="premium-rate-tile-sub">${usdInMN ? `1 USD = ${usdInMN.toFixed(0)} MN` : "Sin tasa real"}</div>
            </div>
            <div class="premium-rate-tile premium-rate-tile-eur" role="button" tabindex="0" data-convert="EUR">
              <div class="premium-rate-tile-currency">${icon("euro", 14)} EUR</div>
              <div class="premium-rate-tile-value">
                ${eurInMN ? eurInMN.toFixed(0) : "—"}<span style="font-size:0.6875rem;color:var(--text-muted);font-weight:600;margin-left:0.25rem">MN</span>
              </div>
              <div class="premium-rate-tile-sub">${eurInMN ? `1 EUR = ${eurInMN.toFixed(0)} MN` : "Sin tasa real"}</div>
            </div>
          </div>
          ${markupText ? `
            <p class="rates-footnote">${icon("trendingUp", 12)} Incluye <strong>${markupText}</strong> sobre la tasa oficial</p>
          ` : ''}
        </section>

        <!-- ===== Almacenes ===== -->
        <section class="premium-fade-in premium-fade-in-delay-3">
          <div class="premium-section-header">
            <h3 class="premium-section-title">Almacenes</h3>
            <span class="premium-section-count">${warehouses.length}</span>
          </div>
          ${warehouses.length > 0 ? `<p class="home-hint">Toca un almacén para entrar con su PIN</p>` : ''}
          ${warehouses.length > 0 && !isOnline && supabaseConfigured ? `<p class="home-hint home-hint-offline">${icon("wifiOff", 12)} Sin conexión · almacenes guardados en este equipo. Puedes entrar y vender: las ventas se suben solas al volver internet.</p>` : ''}
          ${warehouses.length === 0 ? (state._warehousesUnavailable ? `
            <div class="premium-card" style="padding:2rem 1rem;text-align:center">
              <div class="premium-empty-icon">${icon("wifiOff", 24)}</div>
              <p class="premium-empty-title">Sin conexión y sin datos guardados</p>
              <p class="premium-empty-desc">Abre la app <strong>una vez con internet</strong> en este equipo: se guardan los almacenes, productos y precios, y a partir de ahí funciona sin conexión.</p>
              <button class="btn btn-outline btn-sm mt-3" data-action="retry-warehouses" type="button">${icon("refresh", 14)} Reintentar</button>
            </div>
          ` : `
            <div class="premium-card" style="padding:2rem 1rem;text-align:center">
              <div class="premium-empty-icon">${icon("building", 24)}</div>
              <p class="premium-empty-title">Sin almacenes</p>
              <p class="premium-empty-desc">Iniciá sesión como admin para crear almacenes.</p>
            </div>
          `) : `
            <div class="wh-list">
              ${warehouses.map((w) => {
                const isOwn = user && user.role === 'warehouse' && user.warehouseId === w.id;
                const tel = (w.phone || "").replace(/[^\d+]/g, "");
                return `
                  <div class="wh-row ${isOwn ? 'wh-row-own' : ''}">
                    <div class="wh-row-icon" style="--wh:${warehouseColor(w)}">${esc(w.code || "")}</div>
                    <div class="wh-row-body">
                      <div class="wh-row-title">
                        <span class="wh-row-name">${esc(w.name)}</span>
                        ${isOwn ? `<span class="wh-row-tag">Tu local</span>` : ''}
                    </div>
                      ${w.address ? `<div class="wh-row-sub">${icon("mapPin", 12)}<span>${esc(w.address)}</span></div>` : ''}
                    </div>
                    <!-- v5.39.4 (WCAG 4.1.2/axe nested-interactive): botón real estirado en vez de
                         role=button en el contenedor, que anidaba el enlace de llamar -->
                    <button class="wh-row-enter" type="button" data-enter-warehouse="${esc(w.id)}" aria-label="Entrar al almacén ${esc(w.name)} con PIN"></button>
                    ${tel ? `<a class="wh-row-call" href="tel:${esc(tel)}" aria-label="Llamar a ${esc(w.name)} (${esc(w.phone)})">${icon("phone", 18)}</a>` : ''}
                    <span class="wh-row-chev" aria-hidden="true">${icon("chevronRight", 18)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          `}
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

  getRateConfig().then((cfg) => {
    if (!mounted || !cfg) return;
    store.setState({ _rateMarkup: { markupMode: cfg.markupMode, markupUsd: cfg.markupUsd } });
    render();
  }).catch(() => {});

  settingsPromise = getSettings().then((s) => {
    if (!mounted) return;
    store.setSettings(s);
    render();
  }).catch(() => {});

  warehousesPromise = listWarehouses().then(async (list) => {
    if (!mounted) return;
    // v5.13.0: con la nube configurada NUNCA se muestran almacenes de prueba.
    // Antes, sin conexión la lista llegaba vacía y aparecían "Víbora", "Lisa"…
    // de demostración (PIN 2025): las ventas hechas ahí subían sin almacén.
    if ((!list || list.length === 0) && (await isSupabaseConfiguredAsync().catch(() => false))) {
      if (!mounted) return;
      store.setState({ _warehouses: [], _warehousesUnavailable: navigator.onLine === false || !list });
      render();
      return;
    }
    store.setState({ _warehousesUnavailable: false });
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

    // v5.13.0: reintentar cargar los almacenes (sin conexión y sin datos guardados)
    container.querySelector('[data-action="retry-warehouses"]')?.addEventListener("click", () => location.reload());

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

    // Enter warehouse → PIN view (v5.8: toda la fila es táctil; el botón de llamar no la dispara)
    const enterWarehouse = (wid) => {
      const w = (store.getState()._warehouses || []).find((x) => x.id === wid);
      if (w) {
        store.setState({ _selectedWarehouse: w });
        navigate("pin");
      }
    };
    container.querySelectorAll("[data-enter-warehouse]").forEach((btn) => {
      // v5.39.4: [data-enter-warehouse] es ahora un <button> nativo (Enter/Espacio gratis)
      btn.addEventListener("click", () => enterWarehouse(btn.dataset.enterWarehouse));
    });

    // Menú ☰ (v5.8: antes disparaba un evento "open-drawer" que nadie escuchaba)
    // v5.10.0: conversor de monedas (botón "Convertir" o tocar una tasa)
    const convBtn = container.querySelector('[data-action="open-converter"]');
    if (convBtn) convBtn.addEventListener("click", () => openConverter());
    container.querySelectorAll("[data-convert]").forEach((tile) => {
      tile.addEventListener("click", () => openConverter(tile.dataset.convert));
      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openConverter(tile.dataset.convert); }
      });
    });

    const drawerBtn = container.querySelector('[data-action="open-drawer"]');
    if (drawerBtn) {
      drawerBtn.addEventListener("click", openHomeMenu);
    }

    // v5.4.0: ocultar el banner de configuración de forma persistente
    container.querySelectorAll('[data-action="dismiss-setup"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        try { localStorage.setItem("mannol_setup_banner_dismissed", "1"); } catch {}
        toast("Aviso ocultado", "info", 2500);
        render();
      });
    });
  }

  // v5.8 (móvil): menú del inicio como hoja inferior
  // v5.10.0: conversor USD / EUR / MN con las tasas del día (las mismas de las tarjetas)
  function openConverter(initialFrom) {
    const rates = getHomeRates(store.getState());
    if (!rates.usdInMN || !rates.eurInMN) { toast("Aún no hay una tasa real de elTOQUE. Avisa al admin.", "error", 4000); return; }
    const QUICK = { USD: [5, 10, 20, 50, 100], EUR: [5, 10, 20, 50, 100], MN: [500, 1000, 5000, 10000, 20000] };
    let from = initialFrom;
    if (!from) { try { from = localStorage.getItem("mannol_conv_from") || "USD"; } catch { from = "USD"; } }
    if (!QUICK[from]) from = "USD";
    showModal({
      title: `${icon("calculator", 18)} Conversor de monedas`,
      body: `
        <div class="converter">
          <div class="tabs-list" style="grid-template-columns:repeat(3,1fr);margin:0" role="group" aria-label="Moneda del monto">
            ${["USD", "EUR", "MN"].map((c) => `<button type="button" class="tabs-trigger" data-conv-from="${c}" aria-pressed="false">${c}</button>`).join("")}
          </div>
          <div class="converter-amount">
            <input class="input" id="conv-amount" type="text" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="Monto a convertir" />
            <span class="converter-amount-cur" id="conv-cur" aria-hidden="true"></span>
          </div>
          <div class="converter-quick" id="conv-quick"></div>
          <div class="converter-results" id="conv-results" aria-live="polite"></div>
          <p class="converter-note">1 USD = ${+rates.usdInMN.toFixed(2)} MN · 1 EUR = ${+rates.eurInMN.toFixed(2)} MN${rates.markupPct > 0 && store.getState().currentUser?.role === "admin" ? ` · incluye margen +${rates.markupPct}%` : ""}</p>
        </div>
      `,
    });
    const overlay = document.querySelector("#modal-container .modal-overlay:last-child");
    if (!overlay) return;
    const input = overlay.querySelector("#conv-amount");
    const update = () => {
      const n = parseAmountInput(input.value);
      overlay.querySelectorAll("[data-conv-from]").forEach((b) => {
        const on = b.dataset.convFrom === from;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      overlay.querySelector("#conv-cur").textContent = from;
      overlay.querySelector("#conv-quick").innerHTML = QUICK[from]
        .map((v) => `<button type="button" class="btn btn-outline btn-sm" data-conv-quick="${v}">${v.toLocaleString("en-US")}</button>`).join("");
      overlay.querySelector("#conv-results").innerHTML = ["USD", "EUR", "MN"].filter((c) => c !== from).map((c) => `
        <div class="converter-result">
          <span class="converter-result-label">${c === "MN" ? "Pesos (MN)" : c}</span>
          <span class="converter-result-value">${formatMoneyGrouped(convertAmount(n, from, c, rates), c)}</span>
        </div>`).join("");
    };
    overlay.addEventListener("click", (e) => {
      const fromBtn = e.target.closest("[data-conv-from]");
      if (fromBtn) {
        from = fromBtn.dataset.convFrom;
        try { localStorage.setItem("mannol_conv_from", from); } catch {}
        update();
        return;
      }
      const quick = e.target.closest("[data-conv-quick]");
      if (quick) { input.value = quick.dataset.convQuick; update(); }
    });
    input.addEventListener("input", update);
    update();
    setTimeout(() => { try { input.focus({ preventScroll: true }); } catch {} }, 90);
  }

  function openHomeMenu() {
    const st = store.getState();
    const canFs = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
    const close = showModal({
      title: "Menú",
      body: `
        <div class="home-menu">
          <button class="drawer-item" data-menu="rates">${icon("refresh", 18)}<span style="flex:1;text-align:left">Actualizar tasas del día</span></button>
          <button class="drawer-item" data-menu="rate-status">${icon("coins", 18)}<span style="flex:1;text-align:left">Estado de las tasas</span></button>
          <button class="drawer-item" data-menu="conexion">${icon("key", 18)}<span style="flex:1;text-align:left">Conexión de datos (Supabase)</span></button>
          <button class="drawer-item" data-menu="theme">${st.theme === "dark" ? icon("sun", 18) : icon("moon", 18)}<span style="flex:1;text-align:left">${st.theme === "dark" ? "Tema claro" : "Tema oscuro"}</span></button>
          ${canFs ? `<button class="drawer-item" data-menu="fullscreen">${icon("smartphone", 18)}<span style="flex:1;text-align:left">${document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa (kiosko)"}</span></button>` : ""}
          <p class="home-menu-version">${esc(APP_LABEL)}</p>
        </div>
      `,
    });
    document.querySelectorAll(".home-menu [data-menu]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.menu;
        close();
        if (action === "rates") handleSyncRates();
        else if (action === "rate-status") openRateStatusDialog();
        else if (action === "conexion") openConexionDialog();
        else if (action === "theme") {
          store.setTheme(store.getState().theme === "dark" ? "light" : "dark");
          render();
        } else if (action === "fullscreen") {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
          else document.exitFullscreen?.().catch(() => {});
        }
      });
    });
  }

  // v5.39.5: estado de la tasa publicada (tasa.json + elToque): valor, edad,
  // fuente y umbral de frescura — sin tener que abrir herramientas de desarrollo.
  function openRateStatusDialog() {
    const close = showModal({
      title: `${icon("coins", 16)} Estado de las tasas`,
      body: `<div id="rate-status-body" style="display:grid;gap:0.625rem"><p class="text-muted" style="margin:0;font-size:0.875rem">Leyendo tasa.json…</p></div>`,
      footer: `
        <button class="btn btn-outline" id="rs-reread" type="button">Releer tasa.json</button>
        <button class="btn btn-primary" id="rs-done" type="button">Cerrar</button>
      `,
    });
    const container = document.getElementById("modal-container");

    const hace = (ms) => {
      if (!Number.isFinite(ms) || ms < 0) return "—";
      const min = Math.round(ms / 60000);
      if (min < 60) return `${min} min`;
      const h = Math.round(min / 60);
      if (h < 48) return `${h} h`;
      return `${Math.round(h / 24)} días`;
    };
    // Colores con contraste AA medido (v5.39.3): blanco sobre primary 4.82:1,
    // warning-foreground sobre warning y blanco sobre danger 4.78:1.
    const chip = (edadMs) => {
      const base = "font-weight:700;font-size:0.75rem;padding:0.1875rem 0.625rem;border-radius:999px;white-space:nowrap";
      if (Number.isFinite(edadMs) && edadMs <= 48 * 3600000) return `<span style="background:var(--primary);color:#fff;${base}">Al día</span>`;
      if (Number.isFinite(edadMs) && edadMs <= 7 * 86400000) return `<span style="background:var(--warning);color:var(--warning-foreground);${base}">Desactualizada</span>`;
      return `<span style="background:var(--danger);color:#fff;${base}">Vencida</span>`;
    };

    const load = async () => {
      const body = container?.querySelector("#rate-status-body");
      if (!body) return;
      let t = null;
      try { t = await fetchPublishedTasa(); } catch {}
      if (!t || !(t.usd > 0)) {
        body.innerHTML = `
          <p style="margin:0;font-weight:700">Sin tasa publicada todavía</p>
          <p class="text-muted" style="margin:0;font-size:0.875rem">El script de publicación (secreto <code>ELTOQUE_API_KEY</code>) escribe <code>tasa.json</code> junto a la app y la app lo lee con respaldo local. En modo demo no hay datos que mostrar.</p>`;
        return;
      }
      const edad = Date.now() - (t.updatedAt || 0);
      body.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
          <span style="font-weight:700">Tasa publicada</span> ${chip(edad)}
        </div>
        <div style="display:flex;justify-content:space-between;gap:0.5rem"><span>USD → MN</span><strong>${esc(String(t.usd))} MN</strong></div>
        <div style="display:flex;justify-content:space-between;gap:0.5rem"><span>EUR → MN</span><strong>${t.eur > 0 ? `${esc(String(t.eur))} MN` : "—"}</strong></div>
        <div style="display:flex;justify-content:space-between;gap:0.5rem"><span>Publicada</span><span>${hace(edad)} atrás (${esc(new Date(t.updatedAt).toLocaleDateString("es"))})</span></div>
        <div style="display:flex;justify-content:space-between;gap:0.5rem"><span>Fuente</span><span>${esc(t.source || "elToque")} · tasa.json</span></div>
        <p class="text-muted" style="margin:0;font-size:0.8125rem">Las tasas salen de elToque y se publican en <code>tasa.json</code> al lado de la app; el POS las lee con respaldo local sin conexión. Sin publicar en más de 48 h se marcan «Desactualizada» y en más de 7 días «Vencida».</p>
      `;
    };
    load();
    container?.querySelector("#rs-reread")?.addEventListener("click", load);
    container?.querySelector("#rs-done")?.addEventListener("click", () => close());
  }

  // v5.39.5: la conexión Supabase vuelve a configurarse desde la app (el
  // antiguo asistente setup.html se retiró). La config va SOLO al
  // localStorage de este equipo; js/supabase-config.js ya no se publica en
  // el repo (está en .gitignore) — si el servidor lo tiene, ese archivo manda.
  function openConexionDialog() {
    const stored = getStoredSupabaseConfig();
    const close = showModal({
      title: `${icon("key", 16)} Conexión de datos (Supabase)`,
      body: `
        <p id="cx-status" class="text-muted" style="margin:0 0 0.75rem;font-size:0.875rem">Consultando…</p>
        <label for="cx-url" style="font-weight:600;font-size:0.875rem;display:block;margin-bottom:0.25rem">URL del proyecto</label>
        <input class="input" id="cx-url" type="url" inputmode="url" placeholder="https://xxxx.supabase.co" value="${esc(stored?.url || "")}" autocomplete="off" style="margin-bottom:0.75rem" />
        <label for="cx-key" style="font-weight:600;font-size:0.875rem;display:block;margin-bottom:0.25rem">Clave pública (anon / publishable)</label>
        <input class="input" id="cx-key" type="text" placeholder="sb_publishable_… o eyJhbGc…" value="${esc(stored?.anonKey || "")}" autocomplete="off" />
        <p class="text-muted" style="margin:0.5rem 0 0;font-size:0.8125rem">La clave pública va en el frontend por diseño de Supabase; la privada (service_role) NUNCA va aquí. Se guarda solo en este equipo — no se publica en el repositorio.</p>
      `,
      footer: `
        <button class="btn btn-outline" id="cx-clear" type="button">Borrar de este equipo</button>
        <button class="btn btn-primary" id="cx-save" type="button">Guardar y recargar</button>
      `,
    });
    const container = document.getElementById("modal-container");
    // Estado real: ¿el servidor publica un archivo de config?
    // (ruta relativa al módulo: home.js vive en js/views/)
    import("../supabase-config.js")
      .then((mod) => {
        const c = mod?.supabaseConfig;
        const el = container?.querySelector("#cx-status");
        if (el && c?.url) el.textContent = `Este servidor publica js/supabase-config.js conectado a ${c.url} — ese archivo tiene prioridad sobre lo guardado en el equipo.`;
      })
      .catch(() => {
        const el = container?.querySelector("#cx-status");
        if (el) el.textContent = stored
          ? "El servidor no publica js/supabase-config.js: se usa la configuración guardada en este equipo."
          : "El servidor no publica js/supabase-config.js y este equipo no tiene configuración guardada: la app corre en modo demo hasta que guardes una conexión.";
      });

    container?.querySelector("#cx-save")?.addEventListener("click", () => {
      const url = (container.querySelector("#cx-url")?.value || "").trim().replace(/\/+$/, "");
      const key = (container.querySelector("#cx-key")?.value || "").trim();
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
        toast("URL inválida: debe ser https://<proyecto>.supabase.co", "error");
        return;
      }
      if (!key) {
        toast("Falta la clave pública del proyecto", "error");
        return;
      }
      saveStoredSupabaseConfig(url, key);
      toast("Conexión guardada en este equipo — recargando…", "success");
      setTimeout(() => { try { location.reload(); } catch {} }, 700);
    });
    container?.querySelector("#cx-clear")?.addEventListener("click", () => {
      clearStoredSupabaseConfig();
      toast("Configuración de este equipo borrada — recargando…", "success");
      setTimeout(() => { try { location.reload(); } catch {} }, 700);
    });
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
