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

// =====================================================
// v5.17 — PIN validado en el servidor, con hash para sin conexión
// =====================================================
// El PIN en claro ya NO se lee de la base de datos (anon pierde el acceso a
// `pin`/`pin_code`). La RPC verify_warehouse_pin valida el PIN en el servidor
// y, si es correcto, devuelve { salt, hash } (SHA-256 de `pin + salt`).
// Con esos datos la app revalida SIN conexión usando WebCrypto.
// Sin el PIN correcto nadie obtiene el hash, así que no hay nada que
// romper a la fuerza desde fuera del equipo.

const pinMetaKey = (code) => `mannol-pin-meta-${String(code || "").toLowerCase()}`;

/** SHA-256 en hex (WebCrypto). null si el navegador no ofrece crypto.subtle. */
export async function sha256Hex(text) {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * ¿El PIN ingresado corresponde al hash+sal del almacén?
 * @param {string} pin
 * @param {string|null} salt
 * @param {string|null} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPinHash(pin, salt, hash) {
  const p = normalizePin(pin);
  const s = normalizePin(salt);
  const h = normalizePin(hash);
  if (!p || !s || !h) return false;
  const computed = await sha256Hex(p + s);
  if (!computed) return false; // sin WebCrypto no se puede validar offline
  return computed === h.toLowerCase();
}

/** Guarda {salt, hash, len} del último login correcto de ese almacén. */
export function savePinMeta(code, meta) {
  try {
    if (!code || !meta?.salt || !meta?.hash) return;
    localStorage.setItem(pinMetaKey(code), JSON.stringify({
      salt: String(meta.salt),
      hash: String(meta.hash).toLowerCase(),
      len: Math.max(0, Number(meta.len) || 0),
      ts: Date.now(),
    }));
  } catch {}
}

/** Recupera el hash guardado de ese almacén (para validar sin conexión). */
export function loadPinMeta(code) {
  try {
    const raw = localStorage.getItem(pinMetaKey(code));
    if (!raw) return null;
    const m = JSON.parse(raw);
    if (!m?.salt || !m?.hash) return null;
    return m;
  } catch {
    return null;
  }
}

/** Borra el hash guardado (p. ej. el PIN cambió y la RPC lo rechaza). */
export function clearPinMeta(code) {
  try { localStorage.removeItem(pinMetaKey(code)); } catch {}
}
