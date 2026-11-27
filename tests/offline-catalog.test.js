// =====================================================
// v5.35.0: sin conexión el catálogo, el stock y la tasa salen de la última
// copia guardada en el equipo (antes quedaban vacíos → no se podía vender).
// =====================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

let online = true;
const DATA = {
  products: [{ id: "p1", name: "Aceite 5W-30", sale_price: 20, created_at: "2026-01-01T00:00:00Z" }],
  categories: [{ id: "c1", name: "Aceites", sort_order: 1 }],
  stock: [{ warehouse_id: "w1", product_id: "p1", quantity: 12 }],
  rate_config: { id: "default", markup_mode: "FIXED", markup_usd: 10, markup_eur: 10, last_usd_rate: 471, last_eur_rate: 520 },
};
function fakeFrom(table) {
  const api = {
    select() { return api; }, order() { return api; }, eq() { return api; }, maybeSingle() { api._one = true; return api; },
    then(res, rej) {
      if (!online) return Promise.reject(new TypeError("Failed to fetch")).then(res, rej);
      const data = table === "rate_config" ? DATA.rate_config : DATA[table] || [];
      return Promise.resolve({ data, error: null }).then(res, rej);
    },
  };
  return api;
}
const fakeClient = {
  from: fakeFrom,
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  client: { removeChannel() {} },
};
vi.mock("../js/supabase.js", async (orig) => ({
  ...(await orig()),
  getSupabase: async () => fakeClient,
  isSupabaseConfiguredAsync: async () => true,
}));

import { subscribeProducts, subscribeStock, subscribeCategories, listProducts, getRateConfig } from "../js/db.js";

const first = (subscribe, ...args) => new Promise((resolve) => {
  let stop = () => {};
  stop = subscribe(...args, (v) => { setTimeout(() => stop(), 0); resolve(v); });
});

beforeEach(() => { online = true; });

describe("sin conexión: última copia del equipo", () => {
  it("con red se guarda; sin red se usa la copia", async () => {
    localStorage.clear();
    expect((await first(subscribeProducts)).map((p) => p.name)).toEqual(["Aceite 5W-30"]);
    expect((await first(subscribeStock, "w1"))[0].quantity).toBe(12);
    expect((await first(subscribeCategories)).length).toBe(1);
    expect((await getRateConfig()).lastUsdRate).toBe(471);

    online = false;
    expect((await first(subscribeProducts)).map((p) => p.name)).toEqual(["Aceite 5W-30"]);
    expect((await first(subscribeStock, "w1"))[0].quantity).toBe(12);
    expect((await first(subscribeCategories)).length).toBe(1);
    expect((await listProducts()).length).toBe(1);
    const cfg = await getRateConfig();
    expect(cfg).toMatchObject({ lastUsdRate: 471, markupMode: "FIXED", markupUsd: 10 });
  });

  it("sin red y sin copia: lista vacía (no se inventan datos)", async () => {
    localStorage.clear();
    online = false;
    expect(await first(subscribeProducts)).toEqual([]);
    expect(await first(subscribeStock, "w9")).toEqual([]);
  });
});
