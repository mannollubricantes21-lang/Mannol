// =====================================================
// PIN Login view — acceso a almacén específico
// =====================================================

import { getStore } from "../store.js";
import { getSettings, listWarehouses } from "../firestore.js";
import { toast, icon } from "../ui.js";

export function renderPinLoginView() {
  const store = getStore();
  const warehouse = store.getState()._selectedWarehouse;

  if (!warehouse) {
    return `
      <div class="mobile-shell">
        <div class="bg-diagonal"></div>
        <main class="mobile-main">
          <div class="empty-state">
            <p>No se seleccionó ningún almacén.</p>
            <button class="btn btn-primary mt-4" data-nav="home">${icon("arrowLeft", 14)} Volver al inicio</button>
          </div>
        </main>
      </div>
    `;
  }

  return `
    <div class="mobile-shell">
      <div class="bg-diagonal"></div>
      <main class="mobile-main" style="display:flex;flex-direction:column;gap:1rem">
        <button class="flex items-center gap-1.5 text-sm text-muted" style="background:transparent;border:none;cursor:pointer;width:fit-content" data-nav="home">
          ${icon("arrowLeft", 14)} Volver
        </button>

        <form id="pin-form" class="card" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">
          <div class="text-center">
            <div class="brand-logo brand-logo-lg mx-auto mb-3" style="background: var(--primary-tint); color: var(--primary)">
              ${icon("lock", 28)}
            </div>
            <h2 class="text-lg font-bold">Acceso protegido</h2>
            <p class="text-xs text-muted mt-1" style="max-width: 18rem; margin: 0.25rem auto 0">
              Ingresa el PIN del almacén <strong>${warehouse.code} · ${warehouse.name}</strong> para registrar ventas y ver el inventario.
            </p>
          </div>

          <div id="pin-error" class="hidden" style="background: color-mix(in oklab, var(--danger) 10%, transparent); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent); color: var(--danger); padding: 0.5rem 0.75rem; border-radius: var(--radius); font-size: 0.875rem;"></div>

          <div style="max-width: 18rem; margin: 0 auto; width: 100%;">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              class="pin-input-large"
              id="pin-input"
              placeholder="••••"
              autoFocus
            />
          </div>

          <div class="flex justify-center gap-2">
            <button type="button" class="btn btn-outline" data-nav="home">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="pin-submit" style="min-width: 8rem">
              ${icon("lock", 14)} Entrar
            </button>
          </div>
        </form>
      </main>
    </div>
  `;
}

export function mountPinLoginView(container, navigate) {
  container.innerHTML = renderPinLoginView();

  const form = container.querySelector("#pin-form");
  const input = container.querySelector("#pin-input");
  const errorBox = container.querySelector("#pin-error");
  const submit = container.querySelector("#pin-submit");

  if (input) input.focus();

  // Handle nav
  container.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.nav));
  });

  if (!form) return () => {};

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = input.value.trim();
    const store = getStore();
    const warehouse = store.getState()._selectedWarehouse;

    if (!pin) {
      errorBox.textContent = "Ingresa el PIN del almacén";
      errorBox.classList.remove("hidden");
      return;
    }

    submit.disabled = true;
    submit.innerHTML = `<div class="spinner spinner-sm"></div> Entrando...`;
    errorBox.classList.add("hidden");

    try {
      const settings = await getSettings();
      // PIN del almacén: si tiene su propio pin úsalo, si no usa el global (2025)
      const expectedPin = warehouse.pinCode || settings.pinCode;
      if (pin !== expectedPin) {
        errorBox.textContent = "PIN incorrecto. Inténtalo de nuevo.";
        errorBox.classList.remove("hidden");
        submit.disabled = false;
        submit.innerHTML = `${icon("lock", 14)} Entrar`;
        input.value = "";
        input.focus();
        return;
      }
      // PIN correcto: crear sesión empleado_pin
      const empleado = {
        id: `pin-${Date.now()}`,
        email: "",
        displayName: `Empleado · ${warehouse.code}`,
        role: "empleado_pin",
        active: true,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        createdAt: Date.now(),
      };
      store.setUser(empleado);
      store.setAuthMode("pin");
      store.setWarehouse(warehouse);
      toast(`Bienvenido a ${warehouse.name}`, "success");
      navigate("dashboard");
    } catch (err) {
      errorBox.textContent = "Error de conexión";
      errorBox.classList.remove("hidden");
      submit.disabled = false;
      submit.innerHTML = `${icon("lock", 14)} Entrar`;
    }
  });
}
