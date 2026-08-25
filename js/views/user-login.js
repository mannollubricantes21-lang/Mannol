// =====================================================
// User Login view — admin / gestor / vendedor
// =====================================================

import { loginWithEmail } from "../auth.js";
import { listWarehouses } from "../db.js";
import { getStore } from "../store.js";
import { toast, icon, esc } from "../ui.js";

export function renderUserLoginView() {
  return `
    <div class="mobile-shell">
      <div class="bg-diagonal"></div>
      <main class="mobile-main" style="display:flex;flex-direction:column;gap:1rem;align-items:center;justify-content:center;min-height:70vh">
        <button class="flex items-center gap-1.5 text-sm text-muted" style="background:transparent;border:none;cursor:pointer;position:absolute;top:1rem;left:1rem" data-nav="home">
          ${icon("arrowLeft", 14)} Volver
        </button>

        <div class="card w-full" style="max-width: 28rem;">
          <div class="card-content" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">
            <div class="text-center">
              <div class="brand-logo brand-logo-lg mx-auto mb-3" style="background: var(--primary-tint); color: var(--primary)">
                ${icon("shield", 28)}
              </div>
              <h2 class="text-lg font-bold">Acceso administrador</h2>
              <p class="text-xs text-muted mt-1">
                Ingresa tus credenciales para acceder al panel de control.
              </p>
            </div>

            <form id="login-form" style="display:flex;flex-direction:column;gap:0.75rem">
              <div>
                <label class="label" for="email">Usuario / Email</label>
                <input class="input" type="text" id="email" placeholder="admin" autoComplete="username" required autofocus />
              </div>
              <div>
                <label class="label" for="password">Contraseña</label>
                <input class="input" type="password" id="password" placeholder="••••••" autoComplete="current-password" required />
              </div>
              <button type="submit" class="btn btn-primary btn-block btn-lg" id="login-submit">
                ${icon("shield", 16)} Entrar
              </button>
            </form>

            <p class="text-xs text-muted text-center mt-2">
              ¿No tienes cuenta? Pídele al administrador que te cree una.
            </p>

            <div id="demo-creds" style="margin-top: 0.5rem; padding: 0.75rem; background: color-mix(in oklab, var(--primary) 5%, transparent); border: 1px dashed color-mix(in oklab, var(--primary) 30%, transparent); border-radius: var(--radius);">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
                <p class="text-xs font-semibold" style="color: var(--primary); margin:0;">
                  ${icon("key", 12)} Modo demo — credenciales
                </p>
                <button type="button" class="btn btn-ghost btn-sm" id="toggle-demo-creds" style="padding: 0.125rem 0.5rem; font-size: 0.625rem; min-height: auto;">
                  Mostrar
                </button>
              </div>
              <div id="demo-creds-list" style="display:none;flex-direction:column;gap:0.375rem;font-size:0.75rem;">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span class="text-muted">Administrador:</span>
                  <code style="background:var(--bg-soft);padding:0.125rem 0.375rem;border-radius:var(--radius-sm);font-size:0.6875rem">admin / admin123</code>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span class="text-muted">Vendedor Central:</span>
                  <code style="background:var(--bg-soft);padding:0.125rem 0.375rem;border-radius:var(--radius-sm);font-size:0.6875rem">cen / central2025</code>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span class="text-muted">Vendedor Vedado:</span>
                  <code style="background:var(--bg-soft);padding:0.125rem 0.375rem;border-radius:var(--radius-sm);font-size:0.6875rem">ved / vedado2025</code>
                </div>
                <button type="button" class="btn btn-outline btn-sm" id="fill-admin-creds" style="margin-top:0.25rem;font-size:0.6875rem;min-height:auto">
                  Autocompletar admin
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;
}

export function mountUserLoginView(container, navigate) {
  container.innerHTML = renderUserLoginView();

  const form = container.querySelector("#login-form");
  const emailInput = container.querySelector("#email");
  const passwordInput = container.querySelector("#password");
  const submit = container.querySelector("#login-submit");

  // Handle nav
  container.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.nav));
  });

  // Demo creds toggle
  const toggleBtn = container.querySelector("#toggle-demo-creds");
  const credsList = container.querySelector("#demo-creds-list");
  if (toggleBtn && credsList) {
    toggleBtn.addEventListener("click", () => {
      const isHidden = credsList.style.display === "none";
      credsList.style.display = isHidden ? "flex" : "none";
      toggleBtn.textContent = isHidden ? "Ocultar" : "Mostrar";
    });
  }

  // Fill admin creds button
  const fillBtn = container.querySelector("#fill-admin-creds");
  if (fillBtn && emailInput && passwordInput) {
    fillBtn.addEventListener("click", () => {
      emailInput.value = "admin";
      passwordInput.value = "admin123";
      passwordInput.focus();
      toast("Credenciales admin autocompletadas", "info", 1500);
    });
  }

  if (emailInput) emailInput.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      toast("Ingresa usuario y contraseña", "error");
      return;
    }
    submit.disabled = true;
    submit.innerHTML = `<div class="spinner spinner-sm"></div> Entrando...`;
    try {
      const profile = await loginWithEmail(email, password);
      const store = getStore();
      store.setUser(profile);
      store.setAuthMode("user");
      try {
        const list = await listWarehouses();
        const accessible = profile.warehouseIds && profile.warehouseIds.length > 0
          ? list.filter((w) => profile.warehouseIds.includes(w.id))
          : list;
        store.setWarehouse(accessible.find((w) => w.active) || null);
      } catch {}
      toast(`Bienvenido, ${profile.displayName}`, "success");
      // Si el usuario es admin, redirigir al panel admin dedicado (admin.html).
      // Para todos los demás, ir al dashboard de vendedor.
      if (profile.role === "admin") {
        // Limpiar la URL antes de redirigir para que no quede ?view=login pegado
        try {
          const cleanUrl = new URL("./admin.html", window.location.href);
          window.history.replaceState({}, "", cleanUrl.toString());
        } catch {}
        window.location.replace("./admin.html");
        return;
      }
      // Limpiar el ?view=login de la URL para que no se reabra acá en recargas
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("view");
        window.history.replaceState({}, "", url.toString());
      } catch {}
      navigate("dashboard");
    } catch (err) {
      toast(err.message || "Error al iniciar sesión", "error");
      submit.disabled = false;
      submit.innerHTML = `${icon("shield", 16)} Entrar`;
    }
  });
}
