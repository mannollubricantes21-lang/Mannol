// =====================================================
// Currency conversion helpers
// =====================================================
// Constantes se importan de types.js (fuente única de verdad).
// Esto evita desincronización entre currency.js y types.js.
// =====================================================

import { getStore } from "./store.js";
import {
  CURRENCIES as CURRENCIES_CONST,
  CARD_BRANDS as CARD_BRANDS_CONST,
  CURRENCY_LABELS as CURRENCY_LABELS_CONST,
  STATUS_LABELS as STATUS_LABELS_CONST,
} from "./types.js";

// Re-export constants for backwards compat (vistas siguen importándolas de currency.js)
export const CURRENCIES = CURRENCIES_CONST;
export const CARD_BRANDS = CARD_BRANDS_CONST;
export const CURRENCY_LABELS = CURRENCY_LABELS_CONST;
export const STATUS_LABELS = STATUS_LABELS_CONST;

// Format money
export function formatMoney(amount, currency = "USD") {
  const num = Number(amount) || 0;
  const symbol =
    currency === "USD" ? "$" :
    currency === "EUR" ? "€" :
    currency === "MN" ? "₱" :
    currency === "TRANSFER" || currency === "TRANSFERENCIA" ? "₱" : "";
  return `${symbol}${num.toFixed(2)}`;
}

/**
 * v5.10.0 — Convierte un monto entre USD, EUR y MN con las tasas del día.
 * `usdInMN` / `eurInMN` = pesos por 1 USD / 1 EUR (las mismas del inicio).
 * @param {number} amount
 * @param {"USD"|"EUR"|"MN"} from
 * @param {"USD"|"EUR"|"MN"} to
 * @param {{usdInMN: number, eurInMN: number}} rates
 */
export function convertAmount(amount, from, to, { usdInMN, eurInMN } = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const inMN = { MN: 1, USD: Number(usdInMN), EUR: Number(eurInMN) };
  if (!(inMN[from] > 0) || !(inMN[to] > 0)) return 0;
  return (n * inMN[from]) / inMN[to];
}

/** Lee un monto escrito a mano: "1234,5" · "1.234,50" · "1,234.50" · "  20 " → número (0 si no es válido). */
export function parseAmountInput(value) {
  let s = String(value ?? "").replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Monto con separador de miles para el conversor: $1,234.50 · ₱32,000.00 · €92.49 */
export function formatMoneyGrouped(amount, currency = "USD") {
  const num = Number(amount) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₱";
  return symbol + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format date
export function formatDate(ts, opts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-ES", opts || {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format date (short — only date, no time)
// v5.11.0: fecha corta y humana para las listas del móvil:
// "Hoy, 14:05" · "Ayer, 09:30" · "21 nov, 13:36" · "21 nov 2025" (otro año)
export function formatWhen(ts, now = Date.now()) {
  if (!ts) return "—";
  const d = new Date(ts), n = new Date(now);
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(n) - startOf(d)) / 86400000);
  if (days === 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  if (d.getFullYear() === n.getFullYear()) return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}, ${time}`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateShort(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Format period "YYYY-MM" → "Mes YYYY"
export function formatPeriod(period) {
  if (!period) return "—";
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

// Generate unique sale ID
export function generateSaleId() {
  return `S-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// =====================================================
// v5.13.0 — Código visible de la venta, único por almacén
// =====================================================
// Antes: "V-" + 5 dígitos del reloj + 1 dígito al azar → se repetía cada
// 100 segundos y dos almacenes podían tener la MISMA venta "V-482913".
// Ahora: código del almacén + segundos desde 2024 (base 32, 6 caracteres,
// alcanza hasta 2058 y crece con el tiempo) + 2 caracteres al azar (por si
// dos equipos del mismo almacén venden en el mismo segundo).
// Ej.: "VIB-2QK8ZT7M". Alfabeto Crockford: sin I, L, O ni U (no se confunden).
const SALE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SALE_CODE_EPOCH = Date.UTC(2024, 0, 1);

/** Código de almacén apto para el código de venta: A-Z/0-9, máx. 4. */
export function sanitizeWarehouseCode(code) {
  const c = String(code || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  return c || "V";
}

/**
 * @param {string} warehouseCode - p. ej. "VIB"
 * @param {number} [now=Date.now()]
 * @param {() => number} [rand=Math.random]
 * @returns {string} p. ej. "VIB-2QK8ZT7M"
 */
export function generateSaleCode(warehouseCode, now = Date.now(), rand = Math.random) {
  let secs = Math.max(0, Math.floor((Number(now) - SALE_CODE_EPOCH) / 1000));
  let t = "";
  for (let i = 0; i < 6; i++) {
    t = SALE_CODE_ALPHABET[secs % 32] + t;
    secs = Math.floor(secs / 32);
  }
  const pick = () => SALE_CODE_ALPHABET[Math.min(31, Math.max(0, Math.floor(rand() * 32)))];
  return `${sanitizeWarehouseCode(warehouseCode)}-${t}${pick()}${pick()}`;
}

// Generate generic ID
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Mask card number (keep last 4). v5.17: también acepta un valor YA recortado
// a los últimos 4 (las ventas y tarjetas ya no guardan/muestran el completo).
export function maskCard(num) {
  if (!num) return "****";
  const digits = String(num).replace(/\D/g, "");
  if (digits.length <= 4) return digits ? `···· ${digits}` : "****";
  return `**** ${digits.slice(-4)}`;
}

// Get current rate for currency from store
export function getRate(currency) {
  const store = getStore();
  return store.getState().rates[currency];
}

// =====================================================
// Skeleton loader helper — for async data fetches
// =====================================================
// Returns HTML string for a skeleton placeholder.
// Use while waiting for subscribe/list calls to resolve.

export function skeletonCard(count = 1) {
  return Array.from({ length: count }).map(() => `
    <div class="card skeleton-card" aria-hidden="true">
      <div class="skeleton-line" style="width: 40%; height: 1rem;"></div>
      <div class="skeleton-line" style="width: 80%; height: 0.875rem; margin-top: 0.5rem;"></div>
      <div class="skeleton-line" style="width: 60%; height: 0.75rem; margin-top: 0.25rem;"></div>
    </div>
  `).join("");
}

export function skeletonRow(count = 1, cols = 4) {
  return Array.from({ length: count }).map(() => `
    <tr aria-hidden="true">
      ${Array.from({ length: cols }).map(() => `<td><div class="skeleton-line" style="width: 80%; height: 0.75rem;"></div></td>`).join("")}
    </tr>
  `).join("");
}

export function skeletonStatCard(count = 1) {
  return Array.from({ length: count }).map(() => `
    <div class="stat-card" aria-hidden="true">
      <div class="skeleton-line" style="width: 50%; height: 0.625rem;"></div>
      <div class="skeleton-line" style="width: 70%; height: 1.5rem; margin-top: 0.5rem;"></div>
    </div>
  `).join("");
}
