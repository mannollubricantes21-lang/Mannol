// =====================================================
// PIN helpers (puros) — v5.6.1
// Normaliza y compara PINs de forma robusta: el valor puede llegar
// como string o número (según cómo esté la columna en Supabase) y
// puede traer espacios por error de tipeo al configurarlo.
// =====================================================

/**
 * Normaliza un PIN: string, trim, sin nulls raros.
 * @param {string|number|null|undefined} v
 * @returns {string}
 */
export function normalizePin(v) {
  return String(v ?? "").trim();
}

/**
 * PIN esperado de un almacén: primero su propio pin, si no el global
 * (settings.pinCode). Devuelve null si no hay ninguno configurado —
 * en ese caso NINGÚN PIN es válido y hay que configurarlo, no mostrar
 * "PIN incorrecto" (que confunde).
 * @param {Object|null} warehouse - { pin }
 * @param {Object|null} settings - { pinCode }
 * @returns {string|null}
 */
export function resolveExpectedPin(warehouse, settings) {
  const wh = normalizePin(warehouse?.pin);
  if (wh) return wh;
  const global = normalizePin(settings?.pinCode);
  if (global) return global;
  return null;
}

/**
 * Compara el PIN ingresado contra el esperado (string/number-safe, trim).
 * @param {string|number} input
 * @param {string|number|null} expected
 * @returns {boolean}
 */
export function pinMatches(input, expected) {
  const exp = normalizePin(expected);
  if (!exp) return false; // sin PIN configurado → nada coincide
  return normalizePin(input) === exp;
}
