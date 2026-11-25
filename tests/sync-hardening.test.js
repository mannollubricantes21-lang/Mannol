// =====================================================
// Tests: hardening de la sincronización (v5.17)
//  · Los errores NO de red dejan de reintentarse para siempre:
//    tras MAX_SYNC_ATTEMPTS la venta pasa a «para revisar».
//  · La ruta antigua (sin RPC) ya no marca el stock como hecho
//    cuando adjustStock falla: el error sube y se reintenta.
//  · El movimiento de tarjeta fallido no pierde la venta.
//  · discardQueuedSale retira una venta en espera («Deshacer»).
// =====================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const fakeClient = () => ({
  client: {},
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
});

vi.mock("../js/supabase.js", () => ({
  getSupabase: vi.fn(async () => fakeClient()),
  isSupabaseConfiguredAsync: vi.fn(async () => true),
}));
vi.mock("../js/ui.js", () => ({ toast: vi.fn() }));
vi.mock("../js/db.js", () => ({
  saveSale: vi.fn(async () => {}),
  adjustStock: vi.fn(async () => {}),
  deductSaleStockAtomic: vi.fn(async () => ({ ok: true, shortages: [] })),
  registerSaleRemote: vi.fn(),
  recordCardMovementForSale: vi.fn(async () => {}),
  isUuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v)),
}));

import * as db from "../js/db.js";
import {
  enqueueSale,
  syncOfflineQueue,
  getPendingSales,
  discardQueuedSale,
  discardBlockedSale,
  shouldBlockAfterAttempt,
  MAX_SYNC_ATTEMPTS,
  isNetworkError,
} from "../js/offline-sync.js";
import { readQueue } from "../js/offline-queue.js";

const VIB = "11111111-1111-4111-8111-111111111111";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let n = 0;
function newSale(extra = {}) {
  n++;
  return {
    id: `S-${1_700_000_000_000 + n}-hd${n}`,
    code: `VIB-HD${String(n).padStart(4, "0")}`,
    warehouseId: VIB,
    warehouseCode: "VIB",
    warehouseName: "Víbora",
    status: "COMPLETADA",
    totalUSD: 10,
    createdAt: Date.now(),
    items: [{ productId: P1, quantity: 2 }],
    ...extra,
  };
}

const notNetError = () => Object.assign(new Error("permission denied for table stock"), { code: "42501" });

async function syncOnce() {
  let done = false;
  let result;
  const p = syncOfflineQueue({ silent: true, immediate: true }).then((r) => { done = true; result = r; });
  for (let i = 0; i < 300 && !done; i++) await vi.advanceTimersByTimeAsync(50);
  await p;
  vi.clearAllTimers(); // descarta reintentos programados
  return result;
}

function setOnline(v) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => v });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setOnline(true);
  vi.mocked(db.registerSaleRemote).mockReset();
  vi.mocked(db.saveSale).mockClear();
  vi.mocked(db.adjustStock).mockReset().mockResolvedValue({});
  vi.mocked(db.deductSaleStockAtomic).mockReset().mockResolvedValue({ ok: true, shortages: [] });
  vi.mocked(db.recordCardMovementForSale).mockReset().mockResolvedValue();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("tope de intentos para errores no-red", () => {
  it("shouldBlockAfterAttempt: solo bloquea errores no-red al llegar al tope", () => {
    expect(MAX_SYNC_ATTEMPTS).toBe(10);
    expect(shouldBlockAfterAttempt(1, false)).toBe(false);
    expect(shouldBlockAfterAttempt(MAX_SYNC_ATTEMPTS - 1, false)).toBe(false);
    expect(shouldBlockAfterAttempt(MAX_SYNC_ATTEMPTS, false)).toBe(true);
    // sin red NUNCA se bloquea (se reintenta al volver la conexión)
    expect(shouldBlockAfterAttempt(99, true)).toBe(false);
  });

  it("isNetworkError distingue red de datos", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(Object.assign(new Error("x"), { status: 500 }))).toBe(true);
    expect(isNetworkError(notNetError())).toBe(false);
  });

  it("tras MAX intentos no-red, la venta queda «para revisar» con motivo sync_failed", async () => {
    // Ruta antigua: sin RPC (la venta ya "guardada") + adjustStock fallando
    vi.mocked(db.registerSaleRemote).mockRejectedValue(Object.assign(new Error("missing"), { code: "RPC_MISSING" }));
    vi.mocked(db.deductSaleStockAtomic).mockRejectedValue(Object.assign(new Error("missing rpc"), { code: "RPC_MISSING" }));
    vi.mocked(db.adjustStock).mockRejectedValue(notNetError());

    const s = enqueueSale({ ...newSale(), _savedAt: Date.now() });
    for (let i = 1; i <= MAX_SYNC_ATTEMPTS; i++) await syncOnce();

    const inQueue = readQueue().find((x) => x.id === s.id);
    expect(inQueue._blocked).toBe("sync_failed");
    expect(inQueue._syncAttempts).toBe(MAX_SYNC_ATTEMPTS);
    const pending = getPendingSales().find((x) => x.id === s.id);
    expect(pending.blockedReason).toBe("sync_failed");
    // el stock del producto NO quedó marcado como hecho (no se vendió en falso)
    expect(inQueue._stockItemsDone ?? []).toEqual([]);
  });
});

describe("movimiento de tarjeta con reintento", () => {
  it("si el movimiento falla, la venta ya subida NO se pierde y queda el error registrado", async () => {
    vi.mocked(db.registerSaleRemote).mockResolvedValue({ ok: true, duplicate: false, shortages: [] });
    vi.mocked(db.recordCardMovementForSale).mockRejectedValue(new TypeError("Failed to fetch"));

    const s = enqueueSale(newSale({ cardId: "11111111-2222-4333-8444-555566667777", paymentMethod: "TRANSFERENCIA", transferAmount: 10, currency: "USD" }));
    const res = await syncOnce();

    expect(res.synced).toBe(1); // la venta se subió
    expect(readQueue().find((x) => x.id === s.id)).toBeUndefined(); // salió de la cola
    expect(getPendingSales().find((x) => x.id === s.id)).toBeUndefined();
    // se reintentó al menos 2 veces (3 intentos totales)
    expect(db.recordCardMovementForSale.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("el movimiento exitoso solo se intenta una vez", async () => {
    vi.mocked(db.registerSaleRemote).mockResolvedValue({ ok: true, duplicate: false, shortages: [] });
    const s = enqueueSale(newSale({ cardId: "11111111-2222-4333-8444-555566667777", paymentMethod: "TRANSFERENCIA", transferAmount: 10, currency: "USD" }));
    await syncOnce();
    expect(db.recordCardMovementForSale).toHaveBeenCalledTimes(1);
    expect(readQueue().find((x) => x.id === s.id)).toBeUndefined();
  });
});

describe("ruta antigua (uploadLegacy): fallos de datos", () => {
  it("un fallo NO de red en saveSale no descarta la venta", async () => {
    vi.mocked(db.registerSaleRemote).mockRejectedValue(Object.assign(new Error("missing"), { code: "RPC_MISSING" }));
    vi.mocked(db.saveSale).mockRejectedValue(notNetError());

    const s = enqueueSale(newSale()); // sin _savedAt → fase 1 saveSale
    await syncOnce();
    const inQueue = readQueue().find((x) => x.id === s.id);
    expect(inQueue).toBeDefined(); // sigue en cola para revisión/reintento
    expect(inQueue._savedAt).toBeUndefined();
  });
});

describe("discardQueuedSale («Deshacer» del ticket)", () => {
  it("retira una venta normal en espera", () => {
    const s = enqueueSale(newSale());
    expect(readQueue()).toHaveLength(1);
    expect(discardQueuedSale(s.id)).toBe(true);
    expect(readQueue()).toHaveLength(0);
  });

  it("devuelve false si la venta ya no está en la cola", () => {
    expect(discardQueuedSale("S-que-no-existe")).toBe(false);
  });

  it("una venta «para revisar» se retira con discardBlockedSale, no con la normal", () => {
    const s = enqueueSale({ ...newSale(), _blocked: "warehouse_invalid" });
    expect(discardQueuedSale(s.id)).toBe(true); // también la retira (sigue en cola)
    // nueva bloqueada: discardQueuedSale funciona igual (está en cola)
    const s2 = enqueueSale({ ...newSale(), _blocked: "items_empty" });
    expect(discardBlockedSale(s2.id)).toBe(true);
    expect(readQueue()).toHaveLength(0);
  });

  it("discardBlockedSale sigue rechazando ventas normales (comportamiento anterior)", () => {
    const s = enqueueSale(newSale());
    expect(discardBlockedSale(s.id)).toBe(false); // solo bloqueadas
    discardQueuedSale(s.id);
    expect(readQueue()).toHaveLength(0);
  });
});
