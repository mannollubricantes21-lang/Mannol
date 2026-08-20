// =====================================================
// Domain constants — MANNOL POS (vanilla JS, no TS types)
// =====================================================

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
export const STOCK_REASONS = [
  "AJUSTE_MANUAL", "INVENTARIO", "MERMA", "DEVOLUCION",
];
export const STOCK_REASON_LABELS = {
  AJUSTE_MANUAL: "Ajuste manual",
  INVENTARIO: "Inventario",
  MERMA: "Merma",
  DEVOLUCION: "Devolución",
  VENTA: "Venta",
  CANCELACION: "Cancelación",
  REABRIR: "Reabrir",
};
export const CATEGORY_COLORS = [
  "slate", "amber", "blue", "emerald", "cyan", "violet",
  "rose", "orange", "teal", "indigo", "pink", "lime",
];

export const DEFAULT_SETTINGS = {
  pinCode: "2025",
  elToqueEnabled: true,
  elToqueMarkup: 5,
  businessName: "MANNOL",
  lastRateSync: null,
};

export const DEFAULT_RATE_CONFIG = {
  id: "default",
  apiUrl: "https://api.elToque.com/v1/currency/rates",
  apiToken: null,
  markupMode: "PERCENT",
  markupUsd: 5,
  markupEur: 5,
  manualUsdRate: 320,
  manualEurRate: 345,
  lastSyncAt: null,
  lastUsdRate: null,
  lastEurRate: null,
  cacheTtlMinutes: 60,
  autoSync: true,
};
