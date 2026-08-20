// =====================================================
// Admin Panel bootstrap —独立的 panel admin
// =====================================================
// Este archivo se carga solo en admin.html, no en la app
// principal. Esto hace que la app de vendedores sea más
// ligera (no descargan el código de admin).
// =====================================================

import { getStore, applyTheme } from "./store.js";
import { getSupabase, isSupabaseConfiguredAsync, isSupabaseConfigured } from "./supabase.js";
import { logout } from "./auth.js";
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
    // Modo demo: verificar si hay un usuario admin en el store
    const user = store.getState().currentUser;
    if (!user || user.role !== "admin") {
      renderDemoNotice(container);
      return;
    }
    // Si hay admin demo, montar el panel
    mountAdminPanel(container, user);
    setupAdminShell(container, user);
    return;
  }

  // Supabase configurado: verificar sesión
  const s = await getSupabase();
  if (!s) {
    renderDemoNotice(container);
    return;
  }

  const { data: { session } } = await s.auth.getSession();
  if (!session?.user) {
    // No hay sesión → redirigir a login
    console.info("[Admin] No session, redirecting to login");
    window.location.href = "./index.html?view=login";
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

function renderDemoNotice(container) {
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
            <div class="empty-state-icon">${icon("shield", 32)}</div>
            <p class="empty-state-title">Acceso restringido</p>
            <p class="empty-state-desc">Este panel es solo para administradores.</p>
            <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; max-width: 24rem; margin-left: auto; margin-right: auto;">
              <p class="text-xs text-muted text-center">Para entrar en modo demo:</p>
              <ol style="font-size: 0.875rem; text-align: left; padding-left: 1.5rem; line-height: 1.8;">
                <li>Ve a la <a href="./index.html" style="color: var(--primary)">app principal</a></li>
                <li>Dale <strong>3 toques al logo MANNOL</strong></li>
                <li>Inicia sesión con <code style="background: var(--bg-soft); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.75rem">admin / admin123</code></li>
                <li>Vuelve aquí y recarga esta página</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

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
