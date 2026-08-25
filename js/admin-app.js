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
import { toast, icon } from "./ui.js";
import { setupGlobalSearch } from "./global-search.js";
import { mountAdminPanel } from "./views/admin.js";

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

  // Setup global search (Ctrl+K)
  setupGlobalSearch(() => {});

  mountAdminPanel(container, profile);
  setupAdminShell(container, profile);

  console.info("[Admin] init done");
}

function setupAdminShell(container, user) {
  // The admin panel handles its own internal navigation,
  // but we add a top bar with logout + back to app.
  // This is done inside mountAdminPanel via the shell wrapper.
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
            <div class="brand-logo">${icon("droplet", 18)}</div>
            <h1 class="font-bold text-base" style="margin:0">MANNOL Admin</h1>
          </div>
          <a href="./index.html" class="btn btn-outline btn-sm">${icon("arrowLeft", 14)} Volver</a>
        </div>
        <div class="admin-content">
          <div class="empty-state" style="padding: 3rem 1.5rem">
            <div class="empty-state-icon" style="color: var(--primary)">${icon("droplet", 32)}</div>
            <p class="empty-state-title">Conectá Supabase en este dispositivo</p>
            <p class="empty-state-desc">Este navegador todavía no tiene las credenciales de tu Supabase. Conectá una sola vez y después entrás solo con tu email y contraseña.</p>
            <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; max-width: 24rem; margin-left: auto; margin-right: auto;">
              <a href="./setup.html" class="btn btn-primary" style="text-decoration:none">${icon("zap", 14)} Conectar Supabase (1 min)</a>
              <p class="text-xs text-muted text-center" style="margin-top:0.5rem">¿Ya lo conectaste antes? Tu navegador borró la configuración. Volvé a hacer el wizard paso 5 (pegar URL + key) y listo.</p>
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
            <div class="brand-logo">${icon("droplet", 18)}</div>
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
                    ${icon("alertTriangle", 14)} ${errorMessage}
                  </div>
                ` : ''}

                <form id="admin-login-form" style="display:flex;flex-direction:column;gap:0.75rem">
                  <div>
                    <label class="label" for="admin-email">Email</label>
                    <input class="input" type="email" id="admin-email" placeholder="admin@mannol.cu" autoComplete="username" required autofocus />
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
                  ¿No sos administrador? <a href="./index.html" style="color: var(--primary)">Volver a la app</a>
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

      // Setup global search + montar panel
      setupGlobalSearch(() => {});
      mountAdminPanel(container, profile);
      setupAdminShell(container, profile);
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
            <div class="brand-logo">${icon("droplet", 18)}</div>
            <h1 class="font-bold text-base" style="margin:0">MANNOL Admin</h1>
          </div>
          <a href="./index.html" class="btn btn-outline btn-sm">${icon("arrowLeft", 14)} Volver</a>
        </div>
        <div class="admin-content">
          <div class="empty-state" style="padding: 4rem 1.5rem">
            <div class="empty-state-icon" style="color: var(--danger)">${icon("ban", 32)}</div>
            <p class="empty-state-title" style="color: var(--danger)">Acceso denegado</p>
            <p class="empty-state-desc">${message}</p>
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
