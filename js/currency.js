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

// Generate generic ID
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Mask card number (keep last 4)
export function maskCard(num) {
  if (!num) return "****";
  const digits = String(num).replace(/\D/g, "");
  if (digits.length <= 4) return "****";
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
