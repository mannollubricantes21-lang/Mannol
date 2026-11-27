import { describe, it, expect } from "vitest";
import { extractRate, parseElToqueHtml, buildRateRows, changed, main } from "../scripts/tasa-eltoque.mjs";

describe("tasa elTOQUE (GitHub Actions, v5.34)", () => {
  it("lee USD y EUR (ECU) en las formas de respuesta conocidas", () => {
    expect(extractRate({ tasas: { USD: 470, ECU: 520, MLC: 400 } }, ["USD"])).toBe(470);
    expect(extractRate({ tasas: { USD: 470, ECU: 520 } }, ["EUR", "ECU"])).toBe(520);
    expect(extractRate({ USD: { median: "471,5" } }, ["USD"])).toBe(471.5);
    expect(extractRate([{ currency: "USD", rate: 469 }], ["USD"])).toBe(469);
    expect(Number.isNaN(extractRate({ tasas: { USD: 5 } }, ["USD"]))).toBe(true); // fuera de rango
  });
  it("lee la página pública (__NEXT_DATA__)", () => {
    const next = { props: { pageProps: { trmiExchange: { data: { api: { statistics: { USD: { median: 480 }, ECU: { median: 530 } } } } } } } };
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></html>`;
    expect(parseElToqueHtml(html)).toEqual({ usd: 480, eur: 530 });
  });
  it("aplica el margen fijo (+10) y arma las filas de rates", () => {
    const { rows, appliedUsd } = buildRateRows({ usd: 470, eur: 520 }, { markup_mode: "FIXED", markup_usd: 10, markup_eur: 10 }, "t");
    expect(appliedUsd).toBe(480);
    expect(rows.find((r) => r.currency === "MN").rate_usd).toBeCloseTo(1 / 480);
    expect(rows.find((r) => r.currency === "EUR").rate_usd).toBeCloseTo(530 / 480);
  });
  it("solo avisa si cambia el número entero", () => {
    expect(changed(470.2, 470.4)).toBe(false);
    expect(changed(470, 472)).toBe(true);
    expect(changed(null, 470)).toBe(true);
  });

  it("de punta a punta: API → Supabase → Telegram", async () => {
    const calls = [];
    const fetchFn = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
      const ok = (data, status = 200) => ({ ok: true, status, json: async () => data, text: async () => JSON.stringify(data) });
      if (String(url).startsWith("https://tasas.eltoque.com")) return ok({ tasas: { USD: 475, ECU: 525 } });
      if (String(url).includes("rate_config?id=eq.default")) return ok([{ markup_mode: "FIXED", markup_usd: 10, markup_eur: 10, last_usd_rate: 470, last_eur_rate: 520 }]);
      if (String(url).includes("/rest/v1/")) return { ok: true, status: 204, json: async () => null, text: async () => "" };
      if (String(url).includes("api.telegram.org")) return ok({ ok: true });
      throw new Error("inesperado " + url);
    };
    const env = { ELTOQUE_API_KEY: "k", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "s", TELEGRAM_BOT_TOKEN: "b", TELEGRAM_CHAT_ID: "c" };
    const files = {};
    const r = await main({ env, fetchFn, log: () => {}, readTasa: async () => null, writeTasa: async (p, d) => { files[p] = d; } });
    expect(r).toMatchObject({ usd: 475, eur: 525, appliedUsd: 485, changed: true });
    expect(files["tasa.json"]).toMatchObject({ usd: 475, eur: 525 });
    const cfgWrite = calls.find((c) => c.url.includes("rate_config?on_conflict"));
    expect(cfgWrite.body).toMatchObject({ id: "default", last_usd_rate: 475, last_eur_rate: 525 });
    expect(calls.find((c) => c.url.includes("rates?on_conflict")).body).toHaveLength(4);
    const tg = calls.find((c) => c.url.includes("api.telegram.org"));
    expect(tg.body.text).toContain("485 MN");
  });

  it("si elTOQUE no responde, no toca nada", async () => {
    const fetchFn = async (url) => {
      if (String(url).includes("/rest/v1/")) throw new Error("no debería escribir");
      return { ok: false, status: 503, json: async () => ({}), text: async () => "" };
    };
    const r = await main({ env: { ELTOQUE_API_KEY: "k", SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "s" }, fetchFn, log: () => {}, readTasa: async () => null, writeTasa: async () => { throw new Error("no debería escribir"); } });
    expect(r.skipped).toBe(true);
  });

  it("como TiendaMax: con SOLO el token de elTOQUE escribe tasa.json (sin Supabase)", async () => {
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(String(url));
      if (String(url).startsWith("https://tasas.eltoque.com")) return { ok: true, status: 200, json: async () => ({ tasas: { USD: 480, ECU: 530 } }) };
      throw new Error("no debería llamar a " + url);
    };
    const files = {};
    const r1 = await main({ env: { ELTOQUE_API_KEY: "k" }, fetchFn, log: () => {}, readTasa: async () => ({ usd: 470, eur: 520 }), writeTasa: async (p, d) => { files[p] = d; } });
    expect(r1.changed).toBe(true);
    expect(files["tasa.json"]).toMatchObject({ usd: 480, eur: 530 });
    expect(calls.some((c) => c.includes("supabase"))).toBe(false);
    // misma tasa → no reescribe (no hay commit)
    const files2 = {};
    const r2 = await main({ env: { ELTOQUE_API_KEY: "k" }, fetchFn, log: () => {}, readTasa: async () => ({ usd: 480, eur: 530 }), writeTasa: async (p, d) => { files2[p] = d; } });
    expect(r2.changed).toBe(false);
    expect(files2).toEqual({});
  });
});
