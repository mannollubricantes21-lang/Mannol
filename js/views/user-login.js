// =====================================================
// User Login view — admin / gestor / vendedor
// =====================================================

import { loginWithEmail } from "../auth.js";
import { listWarehouses } from "../firestore.js";
import { getStore } from "../store.js";
import { toast, icon } from "../ui.js";

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
      navigate("dashboard");
    } catch (err) {
      toast(err.message || "Error al iniciar sesión", "error");
      submit.disabled = false;
      submit.innerHTML = `${icon("shield", 16)} Entrar`;
    }
  });
}
