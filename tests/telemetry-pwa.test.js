// =====================================================
// Tests v5.40 — Etapa C (telemetría LCP/INP/CLS) + instalación PWA
// =====================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

// getSupabase es el único contacto de telemetry.js con la red: se mockea.
vi.mock("../js/supabase.js", () => ({ getSupabase: vi.fn() }));
vi.mock("../js/version.js", () => ({ APP_VERSION: "5.40.0-test" }));

import { __computeP75, __flushTelemetry, __telemetrySnapshot, getP75Summary, listWebVitals, initTelemetry, __stopTelemetry } from "../js/telemetry.js";
import { initPwaInstall, canPromptInstall, promptInstall, isStandalone, isIosSafari, onInstallAvailability } from "../js/pwa-install.js";
import { getSupabase } from "../js/supabase.js";

const LS_QUEUE = "mannol-webvitals-queue";

function fakeClient({ user = true, insertError = null } = {}) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const select = vi.fn(async () => ({ data: [], error: null }));
  return {
    auth: { getSession: async () => ({ data: { session: user ? { user: { id: "u1" } } : null } }) },
    from: vi.fn(() => ({ insert, select, order() { return this; }, limit() { return this; } })),
    __insert: insert,
  };
}

describe("Etapa C: p75 y resumen", () => {
  it("p75 por Nearest-Rank: ceil(0.75·n)-ésimo del arreglo ordenado", () => {
    expect(__computeP75([1, 2, 3, 4, 5, 6, 7, 8])).toBe(6);
    expect(__computeP75([4000, 1800, 2500, 3200])).toBe(3200); // ordenado: [1800,2500,3200,4000] → ceil(3)=3 → 3200
    expect(__computeP75([])).toBeNull();
    expect(__computeP75(null)).toBeNull();
    expect(__computeP75([120])).toBe(120);
  });

  it("getP75Summary agrupa por métrica con n y última fecha", () => {
    // Orden DESC por created_at — como devuelve listWebVitals()
    const rows = [
      { metric: "LCP", value: 3000, created_at: "2026-11-28T11:00:00Z" },
      { metric: "LCP", value: 2000, created_at: "2026-11-28T10:00:00Z" },
      { metric: "INP", value: 150, created_at: "2026-11-28T11:00:00Z" },
    ];
    const s = getP75Summary(rows);
    expect(s.LCP.p75).toBe(3000);
    expect(s.LCP.n).toBe(2);
    expect(s.LCP.last).toBe("2026-11-28T11:00:00Z");
    expect(s.INP.p75).toBe(150);
    expect(s.CLS.p75).toBeNull();
  });
});

describe("Etapa C: cola y flush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(LS_QUEUE);
  });

  it("sin cliente supabase (demo/portada) no sube nada", async () => {
    getSupabase.mockRejectedValue(new Error("sin config"));
    localStorage.setItem(LS_QUEUE, JSON.stringify([{ metric: "LCP", value: 1800, createdAt: new Date().toISOString() }]));
    expect(await __flushTelemetry()).toBe(0);
    expect(JSON.parse(localStorage.getItem(LS_QUEUE)).length).toBe(1); // conserva
  });

  it("sin sesión iniciada no sube nada (portada anónima)", async () => {
    const client = fakeClient({ user: false });
    getSupabase.mockResolvedValue(client);
    localStorage.setItem(LS_QUEUE, JSON.stringify([{ metric: "CLS", value: 0.05, createdAt: new Date().toISOString() }]));
    expect(await __flushTelemetry()).toBe(0);
    expect(client.__insert).not.toHaveBeenCalled();
  });

  it("con sesión: inserta en lote y vacía la cola", async () => {
    const client = fakeClient();
    getSupabase.mockResolvedValue(client);
    const now = new Date().toISOString();
    localStorage.setItem(LS_QUEUE, JSON.stringify([
      { metric: "LCP", value: 1800.1234, rating: "good", view: "sales", build: "5.40.0-test", createdAt: now },
      { metric: "INP", value: 90, rating: "good", view: "sales", build: "5.40.0-test", createdAt: now },
    ]));
    expect(await __flushTelemetry()).toBe(2);
    expect(client.__insert).toHaveBeenCalledTimes(1);
    const rows = client.__insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ metric: "LCP", value: 1800.1234, created_at: now });
    expect(rows[0].user_id).toBeUndefined(); // user_id lo completa la DB con auth.uid()
    expect(localStorage.getItem(LS_QUEUE)).toBe("[]");
  });

  it("si Supabase rechaza el insert, la cola se conserva para reintentar", async () => {
    const client = fakeClient({ insertError: { message: "RLS" } });
    getSupabase.mockResolvedValue(client);
    localStorage.setItem(LS_QUEUE, JSON.stringify([{ metric: "CLS", value: 0.02, createdAt: new Date().toISOString() }]));
    expect(await __flushTelemetry()).toBe(0);
    expect(JSON.parse(localStorage.getItem(LS_QUEUE))).toHaveLength(1);
  });

  it("listWebVitals devuelve [] si no hay cliente o falla", async () => {
    getSupabase.mockRejectedValue(new Error("sin config"));
    expect(await listWebVitals()).toEqual([]);
    getSupabase.mockResolvedValue(fakeClient());
    expect(await listWebVitals()).toEqual([]);
  });

  it("initTelemetry es idempotente y snapshot vacío no encola", () => {
    initTelemetry();
    initTelemetry();
    expect(__telemetrySnapshot().queue).toBe(0);
    __stopTelemetry();
  });
});

describe("PWA: instalar la app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(LS_QUEUE);
  });

  it("sin beforeinstallprompt, promptInstall devuelve no-disponible", async () => {
    expect(await promptInstall()).toBe("no-disponible");
    expect(canPromptInstall()).toBe(false);
  });

  it("captura beforeinstallprompt y lanza el prompt nativo", async () => {
    initPwaInstall();
    const notified = vi.fn();
    onInstallAvailability(notified);
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = vi.fn(() => Promise.resolve());
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
    expect(canPromptInstall()).toBe(true);
    expect(notified).toHaveBeenCalledWith(true);
    expect(await promptInstall()).toBe("aceptada");
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(canPromptInstall()).toBe(false); // consumido
    expect(notified).toHaveBeenLastCalledWith(false);
  });

  it("isStandalone es false en jsdom (navegador normal)", () => {
    expect(isStandalone()).toBe(false);
  });

  it("isIosSafari: Safari iOS sí, Chrome iOS (CriOS) no", () => {
    const real = navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", configurable: true });
    expect(isIosSafari()).toBe(true);
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1", configurable: true });
    expect(isIosSafari()).toBe(false);
    Object.defineProperty(window.navigator, "userAgent", { value: real, configurable: true });
  });
});
