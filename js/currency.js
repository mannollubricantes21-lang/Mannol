// =====================================================
// Currency conversion helpers
// =====================================================

import { getStore } from "./store.js";

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

// Constants
export const CURRENCIES = ["USD", "MN", "EUR", "TRANSFERENCIA"];
export const CARD_BRANDS = ["BPA", "BANDEC", "BANMET"];
export const CURRENCY_LABELS = {
  USD: "USD (Dólar)",
  MN: "MN (Pesos Cubanos)",
  EUR: "EUR (Euro)",
  TRANSFERENCIA: "Transferencia",
  TRANSFER: "Transferencia",
};
export const STATUS_LABELS = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};
