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

const SUPABASE_VERSION = "2.45.4";
const ESM_CDN = `https://esm.sh/@supabase/supabase-js@${SUPABASE_VERSION}`;

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

// Lazy-load the config file (optional — falls back to demo mode)
async function loadConfig() {
  if (_configLoaded) return;
  _configLoaded = true;
  try {
    const mod = await import("./supabase-config.js");
    _config = mod.supabaseConfig || DEFAULT_CONFIG;
    _configured = !!mod.isSupabaseConfigured;
  } catch {
    console.warn("[Supabase] supabase-config.js no encontrado. Modo demo activo.");
    _configured = false;
  }
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

export function camelToSnake(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(camelToSnake);
  if (typeof obj !== "object" || obj instanceof Date) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(CAMEL_TO_SNAKE_RE, "_$1").toLowerCase();
    out[snakeKey] = camelToSnake(v);
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
    out[camelKey] = snakeToCamel(v);
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
