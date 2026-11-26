#!/usr/bin/env node
// =====================================================
// Tasa automática desde elTOQUE (v5.34.0) — corre en GitHub Actions
// (.github/workflows/tasa-eltoque.yml), igual que en TiendaMax.
//
// 1. Lee la tasa USD y EUR de elTOQUE: primero la API (con ELTOQUE_API_KEY);
//    si falla, la página pública; si elTOQUE bloquea, la copia de Wayback.
// 2. La guarda en Supabase (rate_config + rates), con el margen que pusiste en
//    Admin → Tasas (+10 / +20 MN). Todos los almacenes la ven al momento.
// 3. Si cambió, avisa por Telegram (opcional).
//
// Secretos del repositorio (Settings → Secrets and variables → Actions):
//   ELTOQUE_API_KEY            token de la API de elTOQUE
//   SUPABASE_URL               https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  clave service_role (NUNCA en la app)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   (opcionales) para el aviso
//   ELTOQUE_API_URL            (opcional) si elTOQUE te dio otra dirección
// Sin dependencias: Node 20 trae fetch.
// =====================================================

export const DEFAULT_API_URL = "https://tasas.eltoque.com/v1/trmi";
const WEB_URL = "https://eltoque.com/tasas-de-cambio-cuba";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36";
const MIN = 100, MAX = 3000;

const reasonable = (v) => Number.isFinite(v) && v > MIN && v < MAX;
const asNum = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const m = v.replace(/\s/g, "").match(/\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(",", ".")) : NaN; }
  return NaN;
};
const PREFERRED = ["median", "rate", "value", "tasa", "sell", "ema_value", "price"];

/**
 * Busca la tasa de una moneda en respuestas con formas distintas:
 * {tasas:{USD:470}} · {USD:{median:470}} · [{currency:"USD",rate:470}] · {…statistics:{USD:{median}}}
 * @param {any} data
 * @param {string[]} keys  p. ej. ["USD"] o ["EUR","ECU"] (elTOQUE llama ECU al euro)
 */
export function extractRate(data, keys) {
  if (Array.isArray(data)) {
    for (const it of data) { const v = extractRate(it, keys); if (reasonable(v)) return v; }
    return NaN;
  }
  if (!data || typeof data !== "object") return NaN;
  for (const k of keys) {
    for (const kk of [k, k.toLowerCase()]) {
      if (!(kk in data)) continue;
      const node = data[kk];
      const v = asNum(node);
      if (reasonable(v)) return v;
      if (node && typeof node === "object") for (const p of PREFERRED) { const x = asNum(node[p]); if (reasonable(x)) return x; }
    }
  }
  const cur = String(data.currency || data.code || data.moneda || "").toUpperCase();
  if (keys.includes(cur)) for (const p of PREFERRED) { const x = asNum(data[p]); if (reasonable(x)) return x; }
  for (const c of ["tasas", "rates", "data", "statistics", "api", "trmiExchange", "result", "props", "pageProps"]) {
    if (c in data) { const v = extractRate(data[c], keys); if (reasonable(v)) return v; }
  }
  return NaN;
}

/** Saca las tasas del HTML de elTOQUE (__NEXT_DATA__). */
export function parseElToqueHtml(html) {
  const m = String(html).match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("No se encontró __NEXT_DATA__ en la página de elTOQUE");
  const data = JSON.parse(m[1]);
  return { usd: extractRate(data, ["USD"]), eur: extractRate(data, ["EUR", "ECU"]) };
}

async function getJson(fetchFn, url, headers) {
  const r = await fetchFn(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

/** Tasa desde la API (prueba las formas de pasar el token). */
export async function fetchFromApi({ apiKey, apiUrl = DEFAULT_API_URL, fetchFn = fetch }) {
  if (!apiKey) throw new Error("Falta ELTOQUE_API_KEY");
  const base = { Accept: "application/json", "User-Agent": UA };
  const tries = [
    [apiUrl, { ...base, Authorization: `Bearer ${apiKey}` }],
    [apiUrl, { ...base, "X-API-Key": apiKey }],
    [`${apiUrl}${apiUrl.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(apiKey)}`, base],
  ];
  const errors = [];
  for (const [url, headers] of tries) {
    try {
      const data = await getJson(fetchFn, url, headers);
      const usd = extractRate(data, ["USD"]);
      if (reasonable(usd)) return { usd, eur: extractRate(data, ["EUR", "ECU"]), source: "elTOQUE API" };
      errors.push("respuesta sin USD");
    } catch (e) { errors.push(e.message); if (e.status && e.status !== 401 && e.status !== 403) break; }
  }
  throw new Error("API elTOQUE: " + errors.join(" | "));
}

/** Página pública de elTOQUE y, si bloquea, la copia de Wayback. */
export async function fetchFromWeb({ fetchFn = fetch } = {}) {
  try {
    const r = await fetchFn(WEB_URL, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    if (r.ok) { const t = parseElToqueHtml(await r.text()); if (reasonable(t.usd)) return { ...t, source: "elTOQUE Web" }; }
  } catch {}
  const av = await getJson(fetchFn, "https://archive.org/wayback/available?url=eltoque.com/tasas-de-cambio-cuba", { "User-Agent": UA });
  const snap = av?.archived_snapshots?.closest;
  if (!snap?.available) throw new Error("Wayback no tiene copia de elTOQUE");
  const r2 = await fetchFn(snap.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  const t = parseElToqueHtml(await r2.text());
  if (!reasonable(t.usd)) throw new Error("Wayback sin USD");
  return { ...t, source: `elTOQUE Web (copia ${String(snap.timestamp || "").slice(0, 8)})` };
}

/** Tasa al cliente: la de elTOQUE + el margen de Admin → Tasas. */
export function applyMarkup(raw, mode, markup) {
  if (!reasonable(raw)) return null;
  const m = Number(markup) || 0;
  return mode === "PERCENT" ? raw * (1 + m / 100) : raw + m;
}

/** Filas de la tabla rates (cuánto vale 1 unidad en USD), como las escribe la app. */
export function buildRateRows({ usd, eur }, cfg, nowIso) {
  const appliedUsd = applyMarkup(usd, cfg.markup_mode, cfg.markup_usd) || Number(cfg.manual_usd_rate) || 320;
  const appliedEur = applyMarkup(eur, cfg.markup_mode, cfg.markup_eur) || Number(cfg.manual_eur_rate) || 345;
  const row = (currency, rate_usd) => ({ currency, rate_usd, source: "api", updated_at: nowIso });
  return {
    appliedUsd, appliedEur,
    rows: [row("USD", 1), row("MN", 1 / appliedUsd), row("EUR", appliedEur / appliedUsd), row("TRANSFERENCIA", 1 / appliedUsd)],
  };
}

/** ¿Cambió la tasa de forma visible (en números enteros)? */
export const changed = (prev, next) => reasonable(next) && (!reasonable(Number(prev)) || Math.round(Number(prev)) !== Math.round(next));

async function supa(fetchFn, base, key, path, { method = "GET", body, prefer } = {}) {
  const r = await fetchFn(`${base.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Supabase ${method} ${path.split("?")[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function telegram(fetchFn, token, chatId, text) {
  if (!token || !chatId) return;
  try {
    await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch (e) { console.warn("⚠️ Telegram:", e.message); }
}

export async function main({ env = process.env, fetchFn = fetch, log = console.log } = {}) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en los secretos del repositorio");

  let t;
  try {
    t = await fetchFromApi({ apiKey: (env.ELTOQUE_API_KEY || "").trim(), apiUrl: (env.ELTOQUE_API_URL || "").trim() || DEFAULT_API_URL, fetchFn });
  } catch (e) {
    log(`⚠️ ${e.message} → probando la página pública`);
    try {
      t = await fetchFromWeb({ fetchFn });
    } catch (e2) {
      // Sin tasa nueva: se queda la última guardada (los almacenes siguen vendiendo)
      log(`⚠️ No se pudo leer elTOQUE (${e2.message}). Se mantiene la última tasa.`);
      return { skipped: true };
    }
  }
  log(`Tasa ${t.source}: USD ${t.usd}${reasonable(t.eur) ? ` · EUR ${t.eur}` : ""}`);

  const [cfg = {}] = (await supa(fetchFn, url, key, "rate_config?id=eq.default&select=markup_mode,markup_usd,markup_eur,manual_usd_rate,manual_eur_rate,last_usd_rate,last_eur_rate")) || [];
  const eur = reasonable(t.eur) ? t.eur : Number(cfg.last_eur_rate) || null;
  const nowIso = new Date().toISOString();
  const isNew = changed(cfg.last_usd_rate, t.usd) || (reasonable(t.eur) && changed(cfg.last_eur_rate, t.eur));

  await supa(fetchFn, url, key, "rate_config?on_conflict=id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { id: "default", last_usd_rate: t.usd, last_eur_rate: eur, last_sync_at: nowIso },
  });
  const { rows, appliedUsd, appliedEur } = buildRateRows({ usd: t.usd, eur }, cfg, nowIso);
  await supa(fetchFn, url, key, "rates?on_conflict=currency", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: rows });
  await supa(fetchFn, url, key, "settings?id=eq.global", { method: "PATCH", prefer: "return=minimal", body: { last_rate_sync: nowIso } }).catch((e) => log("⚠️ settings:", e.message));
  log(`Guardada. Al cliente: USD ${Math.round(appliedUsd)} MN · EUR ${Math.round(appliedEur)} MN`);

  if (isNew) {
    const prev = Number(cfg.last_usd_rate);
    const arrow = reasonable(prev) ? (t.usd > prev ? "⬆️" : "⬇️") : "💱";
    await telegram(fetchFn, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID,
      `${arrow} <b>Tasa MANNOL</b>\nelTOQUE: USD <b>${Math.round(t.usd)}</b>${reasonable(prev) ? ` (antes ${Math.round(prev)})` : ""}${reasonable(t.eur) ? ` · EUR <b>${Math.round(t.eur)}</b>` : ""}\nAl cliente: USD <b>${Math.round(appliedUsd)} MN</b> · EUR <b>${Math.round(appliedEur)} MN</b>`);
    log("Cambio de tasa: aviso enviado (si Telegram está configurado).");
  } else {
    log("Sin cambio visible de tasa.");
  }
  return { ...t, eur, appliedUsd, appliedEur, changed: isNew };
}

// Ejecutado directamente (no al importarlo en las pruebas)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.error("❌", e.message); process.exit(1); });
}
