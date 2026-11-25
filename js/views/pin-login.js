// =====================================================
// PIN Login view — acceso a almacén específico
// =====================================================

import { getStore } from "../store.js";
import { getSettings, listWarehouses, verifyWarehousePin } from "../db.js";
import { isSupabaseConfigured } from "../supabase.js";
import { toast, icon } from "../ui.js";
import { canAttemptPin, recordPinAttempt, clearPinAttempts, getPinBlockRemainingSec } from "../pin-rate-limit.js";
import { resolveExpectedPin, pinMatches, normalizePin, savePinMeta, loadPinMeta, clearPinMeta, verifyPinHash } from "../pin-utils.js";

// v5.8 (móvil): puntos del PIN (mínimo 4, crecen hasta 8 si el PIN es más largo)
function renderPinDots(filled) {
  const total = Math.min(8, Math.max(4, filled));
  let html = "";
  for (let i = 0; i < total; i++) html += `<span class="pin-dot ${i < filled ? "filled" : ""}"></span>`;
  return html;
}

const isTouchDevice = () => {
  try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; }
};

export function renderPinLoginView() {
  const store = getStore();
  const warehouse = store.getState()._selectedWarehouse;
  // isSupabaseConfigured es síncrono después del primer loadConfig (que ocurre en init)
  const isDemo = !isSupabaseConfigured;

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
        <button class="flex items-center gap-1.5 text-sm text-muted pin-back" style="background:transparent;border:none;cursor:pointer;width:fit-content" data-nav="home">
          ${icon("arrowLeft", 16)} Volver
        </button>

        <form id="pin-form" class="card pin-card" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem" novalidate>
          <div class="text-center">
            <div class="brand-logo brand-logo-lg mx-auto mb-3" style="background: var(--primary-tint); color: var(--primary)">
              ${icon("lock", 28)}
            </div>
            <h2 class="text-lg font-bold">Acceso protegido</h2>
            <p class="text-xs text-muted mt-1" style="max-width: 18rem; margin: 0.25rem auto 0">
              Ingresa el PIN del almacén <strong>${warehouse.code} · ${warehouse.name}</strong> para registrar ventas y ver el inventario.
            </p>
          </div>

          ${isDemo ? `
            <div style="background: color-mix(in oklab, var(--primary) 5%, transparent); border: 1px dashed color-mix(in oklab, var(--primary) 30%, transparent); border-radius: var(--radius); padding: 0.5rem 0.75rem; text-align: center;">
              <p class="text-xs" style="color: var(--primary); margin: 0;">
                ${icon("key", 12)} <strong>Modo demo</strong> — PIN de este almacén: <code style="background:var(--bg-soft);padding:0.125rem 0.375rem;border-radius:var(--radius-sm);font-weight:700">${warehouse.pin || "2025"}</code>
              </p>
            </div>
          ` : ''}

          <div id="pin-error" class="hidden" role="alert" style="background: color-mix(in oklab, var(--danger) 10%, transparent); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent); color: var(--danger); padding: 0.5rem 0.75rem; border-radius: var(--radius); font-size: 0.875rem;"></div>

          <!-- v5.8 (móvil): indicador de dígitos + teclado numérico grande (estilo cajero) -->
          <div class="pin-dots" id="pin-dots" aria-hidden="true">${renderPinDots(0)}</div>

          <div class="pin-input-wrap" style="max-width: 18rem; margin: 0 auto; width: 100%;">
            <label for="pin-input" class="sr-only">PIN del almacén</label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              class="pin-input-large"
              id="pin-input"
              placeholder="••••"
              maxlength="8"
            />
          </div>

          <div class="pin-pad" role="group" aria-label="Teclado numérico">
            ${["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => `<button type="button" class="pin-key" data-key="${d}">${d}</button>`).join("")}
            <button type="button" class="pin-key pin-key-ghost" data-key="del" aria-label="Borrar último dígito">${icon("arrowLeft", 22)}</button>
            <button type="button" class="pin-key" data-key="0">0</button>
            <button type="submit" class="pin-key pin-key-ok" id="pin-ok" aria-label="Entrar">${icon("check", 24)}</button>
          </div>

          <div class="flex justify-center gap-2 pin-classic-actions">
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

  const dotsEl = container.querySelector("#pin-dots");
  const padKeys = container.querySelectorAll(".pin-pad .pin-key");

  // En táctil NO se enfoca el input: el teclado del sistema tapaba media pantalla.
  if (input && !isTouchDevice()) input.focus();

  // Handle nav
  container.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.nav));
  });

  if (!form) return () => {};

  // ===== v5.8 (móvil): teclado numérico =====
  const selectedWh = getStore().getState()._selectedWarehouse;
  // v5.17: el PIN ya no viene en los datos del almacén. Para el auto-envío
  // al completar los dígitos se usa la longitud guardada del último login.
  const pinMeta = loadPinMeta(selectedWh?.code);
  // Si el almacén tiene PIN propio, se envía solo al completar los dígitos
  const autoLen = pinMeta?.len || normalizePin(selectedWh?.pin).length || 0;

  function updateDots() {
    if (!dotsEl) return;
    dotsEl.classList.remove("error");
    dotsEl.innerHTML = renderPinDots(input.value.length);
  }

  function setPadDisabled(disabled) {
    padKeys.forEach((k) => { k.disabled = disabled; });
  }

  function pinFeedbackError() {
    if (!dotsEl) return;
    dotsEl.classList.remove("shake");
    void dotsEl.offsetWidth; // reinicia la animación
    dotsEl.classList.add("shake", "error");
    try { navigator.vibrate?.(140); } catch {}
  }

  function maybeAutoSubmit() {
    if (autoLen > 0 && input.value.length === autoLen && !submit._submitting) {
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }

  container.querySelectorAll(".pin-key[data-key]").forEach((key) => {
    key.addEventListener("click", () => {
      if (input.disabled || submit._submitting) return;
      const k = key.dataset.key;
      if (k === "del") {
        input.value = input.value.slice(0, -1);
      } else if (input.value.length < 8) {
        input.value += k;
      }
      errorBox.classList.add("hidden");
      updateDots();
      maybeAutoSubmit();
    });
  });

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 8);
    updateDots();
    maybeAutoSubmit();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = input.value.trim();
    const store = getStore();
    const warehouse = store.getState()._selectedWarehouse;

    if (!pin) {
      errorBox.textContent = "Ingresa el PIN del almacén";
      errorBox.classList.remove("hidden");
      pinFeedbackError();
      return;
    }

    // Rate limit: bloquear si hay muchos intentos
    if (!canAttemptPin(warehouse.id)) {
      const remaining = getPinBlockRemainingSec(warehouse.id);
      const min = Math.ceil(remaining / 60);
      errorBox.textContent = `Demasiados intentos. Intenta de nuevo en ~${min} minuto(s).`;
      errorBox.classList.remove("hidden");
      input.disabled = true;
      submit.disabled = true;
      setPadDisabled(true);
      pinFeedbackError();
      return;
    }

    // Guard local además de disabled, para evitar race en double-click
    if (submit._submitting) return;
    submit._submitting = true;
    submit.disabled = true;
    setPadDisabled(true);
    submit.innerHTML = `<div class="spinner spinner-sm"></div> Entrando...`;
    errorBox.classList.add("hidden");

    // ===== v5.17: el PIN se valida EN EL SERVIDOR =====
    // Antes la app comparaba el PIN contra la columna `pin` leída con la
    // clave pública (cualquiera podía ver todos los PIN). Ahora:
    //   · Con conexión → RPC verify_warehouse_pin (rate limit 5/10 min).
    //   · Sin conexión → hash guardado del último login (SHA-256, WebCrypto).
    //   · Modo demo (sin Supabase) → comparación local, como siempre.
    try {
      const isDemo = !isSupabaseConfigured;
      const cachedMeta = loadPinMeta(warehouse.code);
      const enterWarehouse = (whData) => {
        clearPinAttempts(warehouse.id);
        const empleado = {
          id: `pin-${Date.now()}`,
          email: "",
          displayName: `Empleado · ${warehouse.code}`,
          role: "empleado_pin",
          active: true,
          warehouseId: (whData || warehouse).id,
          warehouseCode: warehouse.code,
          createdAt: Date.now(),
        };
        store.setUser(empleado);
        store.setAuthMode("pin");
        store.setWarehouse({ ...warehouse, ...(whData || {}) });
        toast(`Bienvenido a ${warehouse.name}`, "success");
        navigate("dashboard");
        // No resetear _submitting aquí porque la vista se desmonta
      };

      if (isDemo) {
        // Modo demo: los almacenes son locales y traen su PIN
        const settings = await getSettings();
        const expectedPin = resolveExpectedPin(warehouse, settings);
        if (!expectedPin) {
          errorBox.textContent = "Este almacén de prueba no tiene PIN configurado.";
          errorBox.classList.remove("hidden");
          submit.disabled = false;
          submit._submitting = false;
          setPadDisabled(false);
          submit.innerHTML = `${icon("lock", 14)} Entrar`;
          return;
        }
        if (!pinMatches(pin, expectedPin)) {
          errorBox.textContent = "PIN incorrecto. Inténtalo de nuevo.";
          errorBox.classList.remove("hidden");
          submit.disabled = false;
          submit._submitting = false;
          submit.innerHTML = `${icon("lock", 14)} Entrar`;
          pinFeedbackError();
          input.value = "";
          setTimeout(() => updateDots(), 450);
          setPadDisabled(false);
          if (!isTouchDevice()) input.focus();
          return;
        }
        enterWarehouse();
        return;
      }

      // --- Con Supabase: primero la RPC (con conexión) ---
      if (navigator.onLine !== false) {
        try {
          const res = await verifyWarehousePin(warehouse.code, pin);
          if (res?.ok) {
            // Hash para revalidar SIN conexión la próxima vez
            savePinMeta(warehouse.code, { salt: res.pinSalt, hash: res.pinHash, len: res.pinLength });
            enterWarehouse(res.warehouse);
            return;
          }
          if (res?.reason === "rate_limited") {
            const min = Math.max(1, Math.ceil((res.retryAfterSec || 600) / 60));
            recordPinAttempt(warehouse.id, warehouse.code);
            errorBox.textContent = `Demasiados intentos fallidos. El almacén queda bloqueado ~${min} minuto(s).`;
            errorBox.classList.remove("hidden");
            input.disabled = true;
            submit.disabled = true;
            setPadDisabled(true);
            pinFeedbackError();
            return;
          }
          if (res?.reason === "warehouse_not_found") {
            errorBox.textContent = "Este almacén ya no existe en la nube. Actualiza la app (sal y vuelve a entrar).";
            errorBox.classList.remove("hidden");
            submit.disabled = false;
            submit._submitting = false;
            setPadDisabled(false);
            submit.innerHTML = `${icon("lock", 14)} Entrar`;
            return;
          }
          if (res?.reason === "no_pin_configured") {
            errorBox.textContent = "Este almacén no tiene PIN configurado. Defínelo en Admin → Almacenes (o el PIN global en Ajustes).";
            errorBox.classList.remove("hidden");
            submit.disabled = false;
            submit._submitting = false;
            setPadDisabled(false);
            submit.innerHTML = `${icon("lock", 14)} Entrar`;
            return;
          }
          // wrong_pin: mismo feedback que antes (bloqueo local tras 5)
          recordPinAttempt(warehouse.id, warehouse.code);
          const remaining = getPinBlockRemainingSec(warehouse.id);
          errorBox.textContent = remaining > 0
            ? `PIN incorrecto. Bloqueado por ${Math.ceil(remaining / 60)} minuto(s) tras demasiados intentos.`
            : "PIN incorrecto. Inténtalo de nuevo.";
          errorBox.classList.remove("hidden");
          submit.disabled = false;
          submit._submitting = false;
          submit.innerHTML = `${icon("lock", 14)} Entrar`;
          pinFeedbackError();
          input.value = "";
          setTimeout(() => updateDots(), 450);
          if (remaining > 0) { input.disabled = true; setPadDisabled(true); }
          else { setPadDisabled(false); if (!isTouchDevice()) input.focus(); }
          return;
        } catch (rpcErr) {
          // RPC ausente (migración sin ejecutar) o red caída a mitad → cae al
          // fallback con hash local. Nada se marca como error de datos aquí.
          console.warn("[PIN] RPC no disponible, uso validación local:", rpcErr?.message || rpcErr);
        }
      }

      // --- Sin conexión (o RPC caída): hash del último login correcto ---
      if (cachedMeta && (await verifyPinHash(pin, cachedMeta.salt, cachedMeta.hash))) {
        enterWarehouse();
        return;
      }

      // Compatibilidad mientras se ejecuta la migración v5.17: si los datos
      // del almacén aún traen el PIN (sesión admin / caché antigua), se usa.
      const legacyPin = normalizePin(warehouse.pin) || normalizePin((await getSettings())?.pinCode);
      if (legacyPin && pinMatches(pin, legacyPin)) {
        enterWarehouse();
        return;
      }

      if (navigator.onLine === false && !cachedMeta) {
        errorBox.textContent = "Sin conexión: la primera vez que entras a un almacén necesitas internet (una vez dentro, funciona sin conexión).";
      } else if (navigator.onLine === false) {
        errorBox.textContent = "PIN incorrecto o cambiado en la nube. Conéctate una vez para sincronizarlo.";
      } else {
        errorBox.textContent = "No se pudo validar el PIN. Ejecuta supabase/migration-v5.17-seguridad.sql y revisa la conexión.";
      }
      errorBox.classList.remove("hidden");
      submit.disabled = false;
      submit._submitting = false;
      submit.innerHTML = `${icon("lock", 14)} Entrar`;
      pinFeedbackError();
      setPadDisabled(false);
    } catch (err) {
      errorBox.textContent = "Error de conexión";
      errorBox.classList.remove("hidden");
      submit.disabled = false;
      submit._submitting = false;
      setPadDisabled(false);
      submit.innerHTML = `${icon("lock", 14)} Entrar`;
    }
  });
}
