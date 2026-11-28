// =====================================================
// v5.39.2 — Red global de errores (hallazgo 4 de la revisión)
// =====================================================
// Antes los fallos de promesas rechazadas y los errores de runtime morían
// sin rastro: el soporte recibía «la app se queda rara» y no había nada que
// consultar. Este módulo instala window.onerror / unhandledrejection y
// guarda un anillo de los últimos errores en memoria + localStorage, para
// poder reportarlos (viajan en la exportación de backup en la etapa B).
// =====================================================

const LOG_KEY = "mannol-error-log-v1";
const MAX_ERRORS = 30;
const MAX_MSG = 200;

const _recent = []; // anillo en memoria: { kind, message, source, line, at }
let _installed = false;

function safeMessage(err) {
  // Nunca ejecuta código del mensaje ni guarda objetos crudos
  try {
    return String(err?.message || err?.reason?.message || err || "Error desconocido").slice(0, MAX_MSG);
  } catch {
    return "Error desconocido";
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) return arr.slice(-MAX_ERRORS);
  } catch {}
  return [];
}

function persist() {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(_recent.slice(-MAX_ERRORS))); } catch {}
}

export function recordError(err, kind = "runtime", source = "", line = 0) {
  try {
    const entry = {
      kind: String(kind).slice(0, 20),
      message: safeMessage(err),
      source: String(source || "").slice(0, 120),
      line: Number(line) || 0,
      at: Date.now(),
    };
    // Dedupe: el mismo error repetido seguido (bucle de render) solo se
    // anota con timestamp nuevo una vez cada 2 s.
    const last = _recent[_recent.length - 1];
    if (last && last.message === entry.message && last.kind === entry.kind && entry.at - last.at < 2000) {
      last.at = entry.at;
      last.count = (last.count || 1) + 1;
    } else {
      _recent.push(entry);
      if (_recent.length > MAX_ERRORS) _recent.shift();
    }
    persist();
    return entry;
  } catch {}
  return null;
}

/** Últimos errores registrados (más antiguos primero). */
export function getRecentErrors() {
  return _recent.slice();
}

export function clearErrorLog() {
  _recent.length = 0;
  try { localStorage.removeItem(LOG_KEY); } catch {}
}

/**
 * Instala los manejadores globales. Idempotente: puede llamarse desde
 * index (app.js) y admin (admin-app.js); el segundo «install» no duplica.
 */
export function setupErrorReporting() {
  if (_installed || typeof window === "undefined") return;
  _installed = true;
  _recent.push(...loadPersisted());

  window.addEventListener("error", (event) => {
    // event.error puede faltar (errores de recursos: <img>, <script>)
    recordError(event.error || event.message, "error", event.filename || "", event.lineno || 0);
  });

  window.addEventListener("unhandledrejection", (event) => {
    recordError(event.reason, "promise", "", 0);
  });
}
