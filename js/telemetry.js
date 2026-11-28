// =====================================================
// Telemetría de campo (Etapa C) — Web Vitals: LCP, INP, CLS
// =====================================================
// La auditoría (docs/AUDITORIA-UX-WCAG-2026-11-28.md) pide p75 de
// LCP/INP/CLS REALES de los equipos de los vendedores antes de optimizar
// rendimiento (CrUX/RUM). Este módulo, sin dependencias externas:
//  · mide con PerformanceObserver (LCP, CLS e INP vía Event Timing),
//  · solo registra con sesión iniciada — la portada anónima no genera filas,
//  · encola en localStorage y sube en lote a public.web_vitals,
//  · expone listWebVitals()/getP75Summary() para el panel de rendimiento.
//
// Tabla + RLS: supabase/instalar.sql → sección «v5.40 · TELEMETRÍA».
// Umbrales Core Web Vitals: LCP ≤2.5 s · INP ≤200 ms · CLS ≤0.1.

import { getSupabase } from "./supabase.js";
import { APP_VERSION } from "./version.js";

const LS_QUEUE = "mannol-webvitals-queue";
const MAX_QUEUE = 60;
const FLUSH_EVERY_MS = 60000;

let _started = false;
let _timer = null;
let _inFlight = false;
let _lcpEntries = [];
let _clsValue = 0; // CLS acumulado de la página (sin reset por flush)
let _inpDurations = [];

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE) || "[]"); } catch { return []; }
}
function saveQueue(q) {
  try { localStorage.setItem(LS_QUEUE, JSON.stringify(q.slice(-MAX_QUEUE))); } catch {}
}

// p75 por Nearest-Rank: valor en la posición ceil(0.75·n) del arreglo ordenado.
export function __computeP75(values) {
  const sorted = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.75 * sorted.length) - 1)];
}

function currentView() {
  try { return localStorage.getItem("mannol-last-view") || "home"; } catch { return "home"; }
}

function ratingFor(metric, v) {
  if (metric === "LCP") return v < 2500 ? "good" : v < 4000 ? "needs-improvement" : "poor";
  if (metric === "INP") return v < 200 ? "good" : v < 500 ? "needs-improvement" : "poor";
  return v < 0.1 ? "good" : v < 0.25 ? "needs-improvement" : "poor"; // CLS
}

function record(metric, value) {
  if (!Number.isFinite(value) || value < 0) return;
  const q = loadQueue();
  q.push({
    metric,
    value: Math.round(value * 1000) / 1000,
    rating: ratingFor(metric, value),
    view: currentView(),
    build: APP_VERSION,
    createdAt: new Date().toISOString(),
  });
  saveQueue(q);
}

function startObservers() {
  if (typeof PerformanceObserver !== "function") return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) _lcpEntries.push(e);
    });
    po.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) _clsValue += e.value || 0;
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch {}
  // INP: la peor interacción desde el último flush (aprox. con Event Timing).
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.interactionId) _inpDurations.push(e.duration);
      }
    });
    po.observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch {}
}

// Vacía los acumuladores en cola. LCP: solo el último candidato (el definitivo).
export function __telemetrySnapshot() {
  if (_lcpEntries.length) {
    const last = _lcpEntries[_lcpEntries.length - 1];
    record("LCP", last.startTime);
    _lcpEntries = [];
  }
  if (_clsValue > 0) record("CLS", _clsValue);
  const worst = _inpDurations.length ? Math.max(..._inpDurations) : null;
  if (worst != null) record("INP", worst);
  _inpDurations = [];
  return { queue: loadQueue().length };
}

export async function __flushTelemetry() {
  if (_inFlight) return 0;
  let client;
  try { client = await getSupabase(); } catch { return 0; }
  if (!client) return 0;
  // Solo usuarios con sesión: anónimos/demo no escriben telemetría.
  try {
    const { data: sess } = await client.auth.getSession();
    if (!sess?.session?.user) return 0;
  } catch { return 0; }
  const q = loadQueue();
  if (q.length === 0) return 0;
  _inFlight = true;
  try {
    const rows = q.map((r) => ({
      metric: r.metric,
      value: r.value,
      rating: r.rating || null,
      view: r.view || null,
      build: r.build || null,
      created_at: r.createdAt,
    }));
    const { error } = await client.from("web_vitals").insert(rows);
    if (error) {
      console.warn("[Telemetry] insert rechazado:", error.message);
      return 0; // conserva la cola para el próximo intento
    }
    saveQueue([]);
    return rows.length;
  } catch {
    return 0;
  } finally {
    _inFlight = false;
  }
}

export async function listWebVitals(limit = 600) {
  let client;
  try { client = await getSupabase(); } catch { return []; }
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("web_vitals")
      .select("metric,value,rating,view,build,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) { console.warn("[Telemetry] lectura:", error.message); return []; }
    return data || [];
  } catch { return []; }
}

// p75 por métrica + n muestras + fecha de la última, a partir de filas listWebVitals().
export function getP75Summary(rows) {
  const by = {};
  for (const r of rows || []) {
    const v = Number(r.value);
    if (Number.isFinite(v)) (by[r.metric] ||= []).push(v);
  }
  const out = {};
  for (const m of ["LCP", "INP", "CLS"]) {
    const vals = by[m] || [];
    out[m] = {
      p75: __computeP75(vals),
      n: vals.length,
      last: (rows || []).find((r) => r.metric === m)?.created_at || null,
    };
  }
  return out;
}

export function initTelemetry() {
  if (_started) return;
  _started = true;
  startObservers();
  // Regla de Page Visibility: el snapshot sale al ocultar la pestaña o al minuto.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      __telemetrySnapshot();
      __flushTelemetry();
    }
  });
  _timer = setInterval(() => {
    __telemetrySnapshot();
    __flushTelemetry();
  }, FLUSH_EVERY_MS);
}

export function __stopTelemetry() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _started = false;
}
