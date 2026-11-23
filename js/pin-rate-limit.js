// =====================================================
// PIN rate limit — bloquea intentos excesivos en PIN de almacén
// =====================================================
// Guarda intentos fallidos en localStorage con TTL.
// Tras 5 intentos en 5 min, bloquea el warehouse por 5 minutos.
//
// Uso:
//   import { canAttemptPin, recordPinAttempt, clearPinAttempts } from "./pin-rate-limit.js";
//   if (!canAttemptPin(warehouseId)) { ... return; }
//   if (pinCorrect) clearPinAttempts(warehouseId);
//   else recordPinAttempt(warehouseId);
// =====================================================

const STORAGE_KEY = "almacen-pos-pin-attempts-v1";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // ventana de 5 minutos
const BLOCK_MS = 5 * 60 * 1000; // bloqueo de 5 minutos

// Auditoría remota de intentos fallidos (tabla pin_attempts,
// migration-v5.3-improvements.sql). Best-effort: si falla (sin
// conexión, RLS, tabla ausente) no afecta el flujo local.
function auditPinAttemptRemote(warehouseId, warehouseCode) {
  (async () => {
    try {
      const { getSupabase } = await import("./supabase.js");
      const s = await getSupabase();
      if (!s) return;
      await s.from("pin_attempts").insert({
        warehouse_id: warehouseId && /^[0-9a-f-]{36}$/i.test(warehouseId) ? warehouseId : null,
        warehouse_code: warehouseCode || null,
        ok: false,
        device: navigator.userAgent.slice(0, 120),
      });
    } catch (err) {
      console.warn("[PinAudit] no se pudo registrar el intento:", err?.message || err);
    }
  })();
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

/**
 * ¿El usuario puede intentar un PIN ahora?
 * @param {string} warehouseId
 * @returns {boolean} false si está bloqueado
 */
export function canAttemptPin(warehouseId) {
  const all = readAll();
  const entry = all[warehouseId];
  if (!entry) return true;
  if (entry.blockedUntil && Date.now() < entry.blockedUntil) return false;
  return true;
}

/**
 * ¿Cuánto tiempo falta para desbloquear? (en segundos, 0 si no está bloqueado)
 */
export function getPinBlockRemainingSec(warehouseId) {
  const all = readAll();
  const entry = all[warehouseId];
  if (!entry || !entry.blockedUntil) return 0;
  const remaining = entry.blockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Registra un intento fallido. Si supera el máximo, bloquea.
 * @param {string} warehouseId
 * @param {string} [warehouseCode] - código visible del almacén (para auditoría)
 */
export function recordPinAttempt(warehouseId, warehouseCode) {
  // Auditoría remota (1 registro por intento fallido)
  auditPinAttemptRemote(warehouseId, warehouseCode);

  const all = readAll();
  const now = Date.now();
  const entry = all[warehouseId] || { attempts: [], blockedUntil: 0 };

  // Limpiar intentos fuera de la ventana
  entry.attempts = (entry.attempts || []).filter((t) => now - t < WINDOW_MS);
  entry.attempts.push(now);

  if (entry.attempts.length >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_MS;
  }
  all[warehouseId] = entry;
  writeAll(all);
}

/**
 * Limpia el historial de intentos (llamar tras PIN correcto).
 */
export function clearPinAttempts(warehouseId) {
  const all = readAll();
  delete all[warehouseId];
  writeAll(all);
}
