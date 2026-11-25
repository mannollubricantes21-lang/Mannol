// =====================================================
// Admin Panel bootstrap —独立的 panel admin
// =====================================================
// Este archivo se carga solo en admin.html, no en la app
// principal. Esto hace que la app de vendedores sea más
// ligera (no descargan el código de admin).
//
// Flujo de acceso a admin.html:
//   1. Si Supabase NO está configurado en este navegador
//      → mensaje simple con botón al wizard
//   2. Si Supabase está configurado pero no hay sesión
//      → mostrar formulario de login (email + contraseña) directamente acá
//   3. Login exitoso + rol admin → montar panel admin
//   4. Login exitoso + rol no-admin → "Acceso denegado"
//   5. Sesión ya activa y válida → montar panel admin
// =====================================================

import { getStore, applyTheme } from "./store.js";
import { getSupabase, isSupabaseConfiguredAsync, isSupabaseConfigured } from "./supabase.js";
import { logout, loginWithEmail } from "./auth.js";
import { toast, icon, esc, setupTableCards, brandMark } from "./ui.js";
import { setupGlobalSearch } from "./global-search.js";
import { setupUpdateBanner } from "./update-banner.js";
import { notifyLowStock } from "./push-notify.js";
import { mountAdminPanel } from "./views/admin.js";

// Registro del service worker + banner "Nueva versión disponible".
// admin.html se puede abrir directo sin pasar por index — así el SW
// también se registra desde acá y el admin recibe las actualizaciones.
setupUpdateBanner({ register: true });

// ===== Bootstrap =====
async function init() {
  console.info("[Admin] init starting...");
  const store = getStore();

  // Apply initial theme
  applyTheme(store.getState().theme);

  const container = document.getElementById("admin-app");
  if (!container) {
    console.error("[Admin] #admin-app container not found");
    return;
  }
  setupTableCards(container); // v5.10.0: tablas como tarjetas en el móvil (etiquetas por columna)

  // Check if Supabase is configured
  const configured = await isSupabaseConfiguredAsync();
  console.info("[Admin] Supabase configured:", configured);

  if (!configured) {
    // Supabase no está configurado en este navegador.
    // Mostrar mensaje simple (no "Panel bloqueado") con botón al wizard.
    renderNeedsConfig(container);
    return;
  }

  // Supabase configurado: verificar sesión
  const s = await getSupabase();
  if (!s) {
    renderNeedsConfig(container);
    return;
  }

  const { data: { session } } = await s.auth.getSession();
  if (!session?.user) {
    // No hay sesión → mostrar formulario de login DIRECTAMENTE en admin.html
    // (no redirigir a index.html — el admin entra directo a /admin.html y ve el login)
    console.info("[Admin] No session, rendering login form in-place");
    renderAdminLogin(container, null);
    return;
  }

  // Verificar que el usuario sea admin
  const { getUserByEmail } = await import("./db.js");
  const profile = await getUserByEmail(session.user.email || "");
  if (!profile) {
    await s.auth.signOut();
    showError(container, "Tu cuenta no tiene perfil en el sistema. Contacta al administrador.");
    return;
  }
  if (!profile.active) {
    await s.auth.signOut();
    showError(container, "Tu cuenta está inactiva. Contacta al administrador.");
    return;
  }
  if (profile.role !== "admin") {
    showError(container, `Acceso denegado. Tu rol es "${profile.role}". Solo los administradores pueden acceder a este panel.`);
    return;
  }

  // Todo OK: montar el panel
  store.setUser(profile);
  store.setAuthMode("user");

  // Setup global search (Ctrl+K) + montar panel + alertas de stock bajo
  setupAdminSearch();
  mountAdminPanel(container, profile);
  setupAdminShell(container, profile);
  checkLowStockOnce();

  console.info("[Admin] init done");
}

function setupAdminShell(container, user) {
  // The admin panel handles its own internal navigation,
  // but we add a top bar with logout + back to app.
  // This is done inside mountAdminPanel via the shell wrapper.
}

// =====================================================
// Paleta de comandos (Ctrl+K) adaptada al admin:
// secciones reales del panel + acciones rápidas.
// =====================================================
function setupAdminSearch() {
  setupGlobalSearch((id) => {
    if (window.__adminNavigateTo) window.__adminNavigateTo(id);
    else window.location.href = "./admin.html";
  }, {
    navItems: [
      { id: "dashboard", label: "Dashboard", icon: "home" },
      { id: "users", label: "Usuarios", icon: "userCog" },
      { id: "products", label: "Productos", icon: "tags" },
      { id: "categories", label: "Categorías", icon: "tags" },
      { id: "warehouses", label: "Almacenes", icon: "store" },
      { id: "stock", label: "Stock general", icon: "boxes" },
      { id: "managers", label: "Gestores", icon: "users" },
      { id: "cards", label: "Tarjetas", icon: "creditCard" },
      { id: "warehouseCommissions", label: "Comisiones locales", icon: "wallet" },
      { id: "profit", label: "Ganancia/Inversión", icon: "trendingUp" },
      { id: "rates", label: "Tasas", icon: "trendingUp" },
      { id: "transfers", label: "Transferencias", icon: "arrowLeftRight" },
      { id: "movements", label: "Movimientos de stock", icon: "listTree" },
      { id: "storage", label: "Almacenamiento de imágenes", icon: "cloud" },
      { id: "weekend", label: "Regla de fin de semana", icon: "calendar" },
      { id: "audit", label: "Auditoría", icon: "receipt" },
    ],
    extraActions: [
      { label: "Precios en lote (ir a Productos)", icon: "dollar", run: () => window.__adminNavigateTo?.("products") },
      { label: "Comparar stock entre almacenes", icon: "boxes", run: () => window.__adminNavigateTo?.("stock") },
      { label: "Registrar venta (app vendedor)", icon: "cart", run: () => { window.location.href = "./index.html?view=dashboard"; } },
      { label: "Cambiar tema claro/oscuro", icon: "moon", run: () => document.querySelector("#admin-theme")?.click() },
      { label: "Refrescar datos", icon: "refresh", run: () => document.querySelector("#admin-refresh")?.click() },
    ],
  });
}

// =====================================================
// Alertas de stock bajo — al abrir el admin, revisa el inventario
// y avisa (toast + notificación) si hay productos en el mínimo.
// Se repite como máximo 1 vez por día (localStorage).
// =====================================================
async function checkLowStockOnce() {
  try {
    const { listProducts, listAllStockAcrossWarehouses } = await import("./db.js");
    const [products, stock] = await Promise.all([listProducts(), listAllStockAcrossWarehouses()]);
    const pMap = new Map(products.map((p) => [p.id, p]));
    const low = [];
    for (const st of stock) {
      const p = pMap.get(st.productId);
      if (!p || p.active === false) continue;
      const min = p.minStock ?? 0;
      if (min > 0 && st.quantity <= min) {
        low.push({
          productId: p.id,
          name: p.name,
          qty: st.quantity,
          minStock: min,
          warehouseName: st.warehouseName,
          warehouseId: st.warehouseId,
        });
      }
    }
    if (low.length === 0) return;

    // Throttle: máximo 1 aviso por día por dispositivo
    const today = new Date().toISOString().slice(0, 10);
    const KEY = "mannol-lowstock-notified";
    let last = {};
    try { last = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
    if (last.date === today) return;
    last.date = today;
    try { localStorage.setItem(KEY, JSON.stringify(last)); } catch {}

    // Toast (visible aunque la app esté en foco) + notificación push si hay permiso
    toast(`⚠️ Stock bajo en ${low.length} producto(s) — revisa Stock general`, "warning", 6000);
    notifyLowStock(low);
  } catch (err) {
    console.warn("[Admin] checkLowStockOnce falló:", err);
  }
}

// =====================================================
// Pantalla: necesita configurar Supabase en este dispositivo
// =====================================================
// Mensaje simple. NO es "Panel bloqueado" dramático — solo te dice
// "este dispositivo todavía no tiene configurado Supabase, hacé click
// acá para configurarlo (1 minuto)".
function renderNeedsConfig(container) {
  container.innerHTML = `
    <div class="admin-shell">
      <div class="admin-main">
        <div class="admin-topbar">
          <div class="flex items-center gap-2">
            <div class="brand-logo brand-logo--mark">${brandMark()}</div>
            <h1 class="font-bold text-base" style="margin:0">MANNOL Admin</h1>
          </div>
          <a href="./index.html" class="btn btn-outline btn-sm">${icon("arrowLeft", 14)} Volver</a>
        </div>
        <div class="admin-content">
          <div class="empty-state" style="padding: 3rem 1.5rem">
            <div class="empty-state-icon" style="color: var(--primary)">${icon("droplet", 32)}</div>
            <p class="empty-state-title">Conecta Supabase en este dispositivo</p>
            <p class="empty-state-desc">La app no encontró la conexión con Supabase. Revisa que <code>js/supabase-config.js</code> esté en el repositorio con la URL y la clave pública de tu proyecto, y recarga la página.</p>
            <div style="margin-top: 1.5rem; display: flex; justify-content: center;">
              <button type="button" class="btn btn-primary" onclick="location.reload()">${icon("refresh", 14)} Recargar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// =====================================================
// Pantalla: login directo en admin.html
// =====================================================
// Formulario simple de email + contraseña. Si el usuario no es admin,
// mostrar mensaje de "acceso denegado". Si es admin, montar el panel.
// errorMessage = string si vienes de un intento fallido.
function renderAdminLogin(container, errorMessage) {
  container.innerHTML = `
    <div class="admin-shell">
      <div class="admin-main">
        <div class="admin-topbar">
          <div class="flex items-center gap-2">
            <div class="brand-logo brand-logo--mark">${brandMark()}</div>
            <h1 class="font-bold text-base" style="margin:0">MANNOL Admin</h1>
          </div>
          <a href="./index.html" class="btn btn-outline btn-sm">${icon("arrowLeft", 14)} Volver a la app</a>
        </div>
        <div class="admin-content">
          <div style="max-width: 28rem; margin: 4rem auto 0; padding: 0 1rem;">
            <div class="card">
              <div class="card-content" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">
                <div class="text-center">
                  <div class="brand-logo brand-logo-lg mx-auto mb-3" style="background: var(--primary-tint); color: var(--primary)">
                    ${icon("shield", 28)}
                  </div>
                  <h2 class="text-lg font-bold">Acceso administrador</h2>
                  <p class="text-xs text-muted mt-1">
                    Ingresá tu email y contraseña de administrador.
                  </p>
                </div>

                ${errorMessage ? `
                  <div style="background: color-mix(in oklab, var(--danger) 10%, transparent); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent); border-radius: var(--radius); padding: 0.75rem; color: var(--danger); font-size: 0.8125rem; line-height: 1.4;">
                    ${icon("alertTriangle", 14)} ${esc(errorMessage)}
                  </div>
                ` : ''}

                <form id="admin-login-form" style="display:flex;flex-direction:column;gap:0.75rem">
                  <div>
                    <label class="label" for="admin-email">Email</label>
                    <input class="input" type="email" id="admin-email" placeholder="admin@mannol.cu" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus />
                  </div>
                  <div>
                    <label class="label" for="admin-password">Contraseña</label>
                    <input class="input" type="password" id="admin-password" placeholder="••••••••" autoComplete="current-password" required />
                  </div>
                  <button type="submit" class="btn btn-primary btn-block btn-lg" id="admin-login-submit">
                    ${icon("shield", 16)} Entrar
                  </button>
                </form>

                <p class="text-xs text-muted text-center mt-2">
                  ¿No eres administrador? <a href="./index.html" style="color: var(--primary)">Volver a la app</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector("#admin-login-form");
  const emailInput = container.querySelector("#admin-email");
  const passwordInput = container.querySelector("#admin-password");
  const submit = container.querySelector("#admin-login-submit");

  if (emailInput) emailInput.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      renderAdminLogin(container, "Ingresá email y contraseña.");
      return;
    }
    submit.disabled = true;
    submit.innerHTML = `<div class="spinner spinner-sm"></div> Entrando...`;
    try {
      // loginWithEmail viene de auth.js — valida contra Supabase Auth
      // y devuelve el perfil del usuario desde public.users.
      const profile = await loginWithEmail(email, password);

      // Verificar rol admin
      if (!profile || profile.role !== "admin") {
        // No es admin → cerrar sesión y mostrar error
        try { await logout(); } catch {}
        const roleLabel = profile?.role === "gestor" ? "gestor"
                        : profile?.role === "vendedor" ? "vendedor"
                        : profile?.role || "usuario";
        renderAdminLogin(container, `Acceso denegado. Tu rol es "${roleLabel}". Solo los administradores pueden entrar a este panel.`);
        return;
      }

      // Es admin → montar panel
      toast(`Bienvenido, ${profile.displayName || "Admin"}`, "success");
      const store = getStore();
      store.setUser(profile);
      store.setAuthMode("user");

      // Setup global search + montar panel + alertas de stock bajo
      setupAdminSearch();
      mountAdminPanel(container, profile);
      setupAdminShell(container, profile);
      checkLowStockOnce();
    } catch (err) {
      console.error("[Admin] login failed:", err);
      renderAdminLogin(container, err.message || "Error al iniciar sesión. Verificá tu email y contraseña.");
    }
  });
}

// =====================================================
// Pantalla de error (cuenta sin perfil / inactiva)
// =====================================================
function showError(container, message) {
  container.innerHTML = `
    <div class="admin-shell">
      <div class="admin-main">
        <div class="admin-topbar">
          <div class="flex items-center gap-2">
            <div class="brand-logo brand-logo--mark">${brandMark()}</div>
            <h1 class="font-bold text-base" style="margin:0">MANNOL Admin</h1>
          </div>
          <a href="./index.html" class="btn btn-outline btn-sm">${icon("arrowLeft", 14)} Volver</a>
        </div>
        <div class="admin-content">
          <div class="empty-state" style="padding: 4rem 1.5rem">
            <div class="empty-state-icon" style="color: var(--danger)">${icon("ban", 32)}</div>
            <p class="empty-state-title" style="color: var(--danger)">Acceso denegado</p>
            <p class="empty-state-desc">${esc(message)}</p>
            <a href="./index.html" class="btn btn-primary" style="margin-top: 1.5rem">${icon("arrowLeft", 14)} Volver a la app</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Run init
try {
  init();
} catch (err) {
  console.error("[Admin] init crashed:", err);
  const container = document.getElementById("admin-app");
  if (container) {
    showError(container, err.message || "Error al iniciar el panel admin");
  }
}
