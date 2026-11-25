// =====================================================
// Supabase client — lazy dynamic loading (mirrors firebase.js)
// =====================================================
// Loads @supabase/supabase-js v2 from ESM CDN on first use.
// App shell loads immediately; Supabase is fetched only when
// actually needed (first DB call). Result is cached.
//
// Mirrors the firebase.js pattern so existing code that uses
// isSupabaseConfiguredAsync() / isSupabaseConfigured works
// without changes.
// =====================================================

const SUPABASE_VERSION = "2.108.2";
const ESM_CDN = `https://esm.sh/@supabase/supabase-js@${SUPABASE_VERSION}`;
// v5.13.0: copia LOCAL de la librería (mismo número de versión), guardada
// por el service worker → la app abre y funciona SIN CONEXIÓN. El CDN
// queda solo como respaldo si la copia local no se pudiera cargar.
const LOCAL_MODULE = "./supabase-js.min.js";

// Última configuración válida leída de js/supabase-config.js. Respaldo
// para abrir sin conexión si ese archivo no estuviera en caché.
const LAST_GOOD_CONFIG_KEY = "mannol-supabase-config-lastgood-v1";

// En los tests (vitest) NUNCA se crea un cliente real: js/supabase-config.js
// apunta a la base de datos de PRODUCCIÓN.
function isTestEnv() {
  try {
    return typeof process !== "undefined" && !!process.env && (!!process.env.VITEST || process.env.NODE_ENV === "test");
  } catch {
    return false;
  }
}

async function loadSupabaseModule() {
  if (isTestEnv()) throw new Error("tests: sin cliente real de Supabase");
  try {
    const mod = await import(LOCAL_MODULE);
    if (mod && typeof mod.createClient === "function") return mod;
    throw new Error("la copia local no exporta createClient");
  } catch (localErr) {
    console.warn("[Supabase] copia local no disponible, probando el CDN:", localErr);
    return await import(/* @vite-ignore */ ESM_CDN);
  }
}

/**
 * ¿Queda una sesión de Supabase (email + contraseña) guardada en este
 * equipo? Sin conexión el token puede estar vencido y no renovarse, pero
 * mientras siga guardado el usuario NO cerró sesión.
 */
export function hasPersistedSupabaseSession() {
  try {
    if (typeof localStorage === "undefined") return false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token$/.test(k)) return true;
    }
  } catch {}
  return false;
}

// localStorage key used by the in-app Setup Wizard (setup.html).
// The wizard writes { url, anonKey } here so users don't need to
// manually create js/supabase-config.js — they can configure the
// app entirely from the UI.
export const SUPABASE_CONFIG_STORAGE_KEY = "mannol-supabase-config-v1";

// Default placeholder config (used when supabase-config.js is missing)
const DEFAULT_CONFIG = {
  url: "",
  anonKey: "",
};

let _config = DEFAULT_CONFIG;
let _configured = false;
let _configLoaded = false;
let _cached = null;
let _initPromise = null;

/**
 * Read Supabase config from localStorage.
 * Returns null if no config is stored.
 * Used by setup.html wizard AND by loadConfig() as a fallback.
 */
export function getStoredSupabaseConfig() {
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.url && parsed.anonKey) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Save Supabase config to localStorage.
 * Used by setup.html wizard.
 */
export function saveStoredSupabaseConfig(url, anonKey) {
  try {
    localStorage.setItem(
      SUPABASE_CONFIG_STORAGE_KEY,
      JSON.stringify({ url, anonKey })
    );
    // Invalidate cached client so next getSupabase() re-initializes
    _cached = null;
    _initPromise = null;
    _configLoaded = false;
    return true;
  } catch (err) {
    console.error("[Supabase] Failed to save config to localStorage:", err);
    return false;
  }
}

/**
 * Remove Supabase config from localStorage.
 */
export function clearStoredSupabaseConfig() {
  try {
    localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY);
    _cached = null;
    _initPromise = null;
    _configLoaded = false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a config object looks "real" (not placeholders).
 */
function _isValidConfig(cfg) {
  return (
    !!cfg &&
    typeof cfg.url === "string" &&
    cfg.url.startsWith("https://") &&
    !cfg.url.includes("TU-PROYECTO") &&
    !cfg.url.includes("TU_PROYECTO") &&
    !!cfg.anonKey &&
    typeof cfg.anonKey === "string" &&
    !cfg.anonKey.startsWith("TU-")
  );
}

// Lazy-load the config file (optional — falls back to localStorage, then to demo mode)
// Uses a single inflight promise so parallel callers wait for the same load.
let _loadPromise = null;

async function loadConfig() {
  // If a load is already in-flight, wait for it (avoids race condition where
  // a second caller sees _configLoaded=true but _configured is still the old value)
  if (_loadPromise) return _loadPromise;
  // If load already completed, return immediately
  if (_configLoaded) return;

  _loadPromise = (async () => {
    try {
      // v5.20.0: el ARCHIVO js/supabase-config.js manda (está publicado en
      // el repo y es igual para todos los equipos). Antes ganaba la config
      // guardada por el asistente en ESTE equipo: un dispositivo que alguna
      // vez se configuró con otros datos quedaba apuntando a otra base y no
      // podía iniciar sesión.
      let fileFailed = false;
      try {
        const mod = await import("./supabase-config.js");
        const fileCfg = mod.supabaseConfig || DEFAULT_CONFIG;
        if (_isValidConfig(fileCfg)) {
          _config = fileCfg;
          _configured = true;
          try {
            localStorage.setItem(LAST_GOOD_CONFIG_KEY, JSON.stringify({ url: fileCfg.url, anonKey: fileCfg.anonKey }));
          } catch {}
          return;
        }
      } catch {
        fileFailed = true; // no existe o no se pudo leer sin conexión
      }

      // 2) Config del asistente (setup.html) guardada en este equipo
      const stored = getStoredSupabaseConfig();
      if (stored && _isValidConfig(stored)) {
        _config = stored;
        _configured = true;
        return;
      }

      // Respaldo sin conexión: la última configuración que funcionó aquí
      if (fileFailed) {
        try {
          const last = JSON.parse(localStorage.getItem(LAST_GOOD_CONFIG_KEY) || "null");
          if (last && _isValidConfig(last)) {
            console.info("[Supabase] supabase-config.js no disponible: usando la última configuración guardada");
            _config = last;
            _configured = true;
            return;
          }
        } catch {}
      }

      // 3) No config found — demo mode.
      console.warn("[Supabase] No config found (localStorage or file). Modo demo activo.");
      _configured = false;
    } finally {
      _configLoaded = true;
      _loadPromise = null;
    }
  })();

  return _loadPromise;
}

/**
 * v5.12.0: URL del proyecto de Supabase configurado (o null en modo demo).
 * Solo se usa para armar el enlace "Abrir el editor SQL" del admin.
 */
export async function getSupabaseProjectUrl() {
  await loadConfig();
  return _configured && _config && _config.url ? String(_config.url) : null;
}

// =====================================================
// v5.13.0 — Lecturas disponibles sin conexión desde la 1ª visita
// =====================================================
// El service worker (sw.js) guarda las lecturas de Supabase en la caché
// "mannol-pos-data-v1"... pero solo cuando ya controla la página. En la
// primera visita tras instalar/actualizar, las primeras consultas salen
// antes de que tome el control y no se guardaban. Mientras la página NO
// esté controlada, este fetch hace lo mismo que el SW: guarda cada lectura
// correcta en esa caché y, si falla la red, responde con la copia.
// La clave DEBE coincidir con sw.js#dataKey.
const DATA_CACHE = "mannol-pos-data-v1";

function headerValue(headers, name) {
  if (!headers) return "";
  try {
    if (typeof headers.get === "function") return headers.get(name) || "";
    const k = Object.keys(headers).find((x) => x.toLowerCase() === name);
    return k ? String(headers[k]) : "";
  } catch {
    return "";
  }
}

function authScopeOf(headers) {
  const token = headerValue(headers, "authorization").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return "none";
  try {
    const json = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return `${json.role || "?"}:${json.sub || ""}`;
  } catch {
    return "none";
  }
}

/** Misma clave que sw.js#dataKey (URL + tipo de respuesta + quién pregunta). */
export function offlineDataKey(url, headers) {
  const u = new URL(url, typeof location !== "undefined" ? location.href : undefined);
  if (headerValue(headers, "accept").includes("vnd.pgrst.object")) u.searchParams.set("__mannol_accept", "object");
  u.searchParams.set("__mannol_scope", authScopeOf(headers));
  return u.toString();
}

function isCacheableRead(method, url) {
  return method === "GET" && url.includes("/rest/v1/") && !url.includes("/rest/v1/rpc/") && !url.includes("client_ref=");
}

async function offlineAwareFetch(input, init = {}) {
  const method = String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
  const url = typeof input === "string" ? input : String(input?.url || input);
  const headers = init?.headers || (typeof input === "object" ? input?.headers : null);
  const canCache = typeof caches !== "undefined" && isCacheableRead(method, url);
  const controlled = typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;
  if (!canCache || controlled) return fetch(input, init); // el SW ya se encarga
  try {
    const res = await fetch(input, init);
    if (res && res.status === 200) {
      const copy = res.clone(); // antes de que la app lea el cuerpo
      caches.open(DATA_CACHE).then((c) => c.put(offlineDataKey(url, headers), copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await caches.open(DATA_CACHE).then((c) => c.match(offlineDataKey(url, headers))).catch(() => null);
    if (cached) return cached;
    throw err;
  }
}

/**
 * Initialize Supabase client (lazy, cached).
 * Returns null if:
 *   - Not configured (placeholder credentials)
 *   - supabase-config.js missing
 *   - la librería no se pudo cargar (ni la copia local ni el CDN)
 * v5.13.0: que devuelva null NO significa "modo demo" — db.js decide el
 * modo demo solo por la configuración (isSupabaseConfiguredAsync).
 */
export async function getSupabase() {
  if (_cached) return _cached;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    await loadConfig();
    if (!_configured) return null;

    try {
      // v5.13.0: copia local primero (funciona sin conexión), CDN de respaldo
      const supabaseMod = await loadSupabaseModule();
      const { createClient } = supabaseMod;

      const client = createClient(_config.url, _config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        realtime: {
          params: { eventsPerSecond: 10 },
        },
        global: {
          fetch: (input, init) => offlineAwareFetch(input, init),
        },
      });

      _cached = {
        client,
        // Convenience re-exports for callers that prefer destructuring
        auth: client.auth,
        from: (table) => client.from(table),
        channel: (name) => client.channel(name),
        storage: client.storage,
      };

      console.info("[Supabase] initialized successfully");
      return _cached;
    } catch (err) {
      console.error("[Supabase] init failed:", err);
      return null;
    } finally {
      _initPromise = null;
    }
  })();

  return _initPromise;
}

/**
 * Async check: is Supabase configured?
 */
export async function isSupabaseConfiguredAsync() {
  await loadConfig();
  return _configured;
}

/**
 * Sync check based on loaded config (false until loadConfig resolves).
 * For backwards compat with code that doesn't await.
 */
export let isSupabaseConfigured = false;
loadConfig().then(() => {
  isSupabaseConfigured = _configured;
});

// =====================================================
// Helper: snake_case ↔ camelCase conversion
// =====================================================
// Postgres is idiomatic snake_case; JS code uses camelCase.
// These helpers convert at the db.js layer so views don't change.

const CAMEL_TO_SNAKE_RE = /([A-Z])/g;
const SNAKE_TO_CAMEL_RE = /_([a-z])/g;

export function camelToSnake(obj, isNestedJson = false) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((v) => camelToSnake(v, isNestedJson));
  if (typeof obj !== "object" || obj instanceof Date) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    // wholesale_tiers es un JSONB: preservar claves camelCase dentro de sus items
    const isJsonbField = (k === "wholesale_tiers" || k === "wholesaleTiers");
    const snakeKey = k.replace(CAMEL_TO_SNAKE_RE, "_$1").toLowerCase();
    out[snakeKey] = isJsonbField ? v : camelToSnake(v, isNestedJson);
  }
  return out;
}

export function snakeToCamel(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (typeof obj !== "object" || obj instanceof Date) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const camelKey = k.replace(SNAKE_TO_CAMEL_RE, (_, c) => c.toUpperCase());
    // wholesale_tiers es un JSONB: preservar estructura original (camelCase dentro)
    if (k === "wholesale_tiers" || k === "wholesaleTiers") {
      out[camelKey] = v;
    } else {
      out[camelKey] = snakeToCamel(v);
    }
  }
  return out;
}

// Convert JS timestamps (ms number) → ISO string for Postgres timestamptz
export function msToIso(ms) {
  if (ms == null) return null;
  if (typeof ms === "string") return ms;
  return new Date(ms).toISOString();
}

// Convert Postgres timestamptz → JS ms number
export function isoToMs(iso) {
  if (iso == null) return null;
  if (typeof iso === "number") return iso;
  return new Date(iso).getTime();
}
