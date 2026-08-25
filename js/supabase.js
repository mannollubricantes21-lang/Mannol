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
async function loadConfig() {
  if (_configLoaded) return;
  _configLoaded = true;

  // 1) Try localStorage first (set by the in-app Setup Wizard).
  //    This takes precedence over the file because if the user has
  //    gone through the wizard, that's their most recent intent.
  const stored = getStoredSupabaseConfig();
  if (stored && _isValidConfig(stored)) {
    _config = stored;
    _configured = true;
    return;
  }

  // 2) Fall back to js/supabase-config.js (manual file)
  try {
    const mod = await import("./supabase-config.js");
    const fileCfg = mod.supabaseConfig || DEFAULT_CONFIG;
    if (_isValidConfig(fileCfg) || mod.isSupabaseConfigured === true) {
      _config = fileCfg;
      _configured = true;
      return;
    }
  } catch {
    // File doesn't exist — that's OK, fall through to demo mode.
  }

  // 3) No config found — demo mode.
  console.warn("[Supabase] No config found (localStorage or file). Modo demo activo.");
  _configured = false;
}

/**
 * Initialize Supabase client (lazy, cached).
 * Returns null if:
 *   - Not configured (placeholder credentials)
 *   - supabase-config.js missing
 *   - CDN unreachable
 */
export async function getSupabase() {
  if (_cached) return _cached;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    await loadConfig();
    if (!_configured) return null;

    try {
      // Dynamic import from ESM CDN
      const supabaseMod = await import(ESM_CDN);
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
