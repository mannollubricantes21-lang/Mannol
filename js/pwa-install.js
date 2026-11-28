// =====================================================
// Instalación de la PWA (v5.40)
// =====================================================
// Los vendedores usan la app a diario desde el navegador móvil: instalarla
// le da icono propio, pantalla completa y arranque directo. Este módulo
// captura el evento beforeinstallprompt (Chromium/Android) y expone el
// estado para que el menú de home muestre «Instalar la app» solo cuando
// aplica. En iOS Safari no hay evento: se muestran las instrucciones de
// Compartir → «Añadir a pantalla de inicio».

let _deferredPrompt = null;
const _listeners = new Set();

function notify() {
  for (const fn of _listeners) {
    try { fn(canPromptInstall()); } catch {}
  }
}

export function initPwaInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // impedimos el mini-infobar; el botón es del menú
    _deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    _deferredPrompt = null;
    notify();
  });
}

export function isStandalone() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  } catch { return false; }
}

// iOS Safari (excluye navegadores alternativos, que no instalan)
export function isIosSafari() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function canPromptInstall() {
  return !!_deferredPrompt;
}

// callback(available:boolean) → para refrescar el menú; devuelve la baja.
export function onInstallAvailability(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// "aceptada" | "rechazada" | "no-disponible"
export async function promptInstall() {
  if (!_deferredPrompt) return "no-disponible";
  try {
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    _deferredPrompt = null;
    notify();
    return outcome === "accepted" ? "aceptada" : "rechazada";
  } catch {
    return "no-disponible";
  }
}
