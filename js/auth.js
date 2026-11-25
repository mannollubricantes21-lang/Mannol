// =====================================================
// Authentication helpers — Supabase Auth
// =====================================================
// Mirrors the previous Firebase-based auth.js API so views
// (user-login.js, dashboard.js) don't change.
// =====================================================

import { getSupabase, hasPersistedSupabaseSession, isSupabaseConfiguredAsync } from "./supabase.js";
import { getStore } from "./store.js";

// v5.13.0: sin conexión el token vencido no se puede renovar y getSession()
// devuelve null aunque el usuario NO cerró sesión. Mientras la sesión siga
// guardada en el equipo no se avisa "sin usuario": la app conserva el perfil
// guardado y el vendedor puede seguir trabajando sin internet.
const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
function keepLocalUser() {
  return hasPersistedSupabaseSession() && !!getStore().getState().currentUser;
}

async function sb() {
  return await getSupabase();
}

// Get settings (cached) for PIN validation
async function getSettingsForPin() {
  const store = getStore();
  const cached = store.getState().settings;
  if (cached && cached.pinCode) return cached;
  // Lazy-load db helpers
  const { getSettings } = await import("./db.js");
  return await getSettings();
}

// Validate PIN against settings
export async function validatePin(pin) {
  const settings = await getSettingsForPin();
  return pin === settings.pinCode;
}

// Login with email + password
export async function loginWithEmail(email, password) {
  const s = await sb();
  // v5.20.0: con la nube configurada, que no haya cliente NO es «modo demo»:
  // la librería no cargó (sin internet la 1ª vez, o navegador antiguo). Antes
  // se probaban las credenciales de demostración y salía «Credenciales
  // incorrectas» aunque el usuario y la contraseña estuvieran bien.
  if (!s && (await isSupabaseConfiguredAsync())) {
    throw new Error(
      navigator.onLine === false
        ? "Sin conexión. Para iniciar sesión por primera vez en este equipo necesitas internet."
        : "No se pudo conectar con el servidor. Revisa internet y actualiza el navegador (Chrome/Safari) a la última versión; luego recarga la página."
    );
  }
  if (!s) {
    // MODO DEMO: credenciales predefinidas
    const demoUsers = [
      { username: "admin", password: "admin123", profile: { id: "u-admin", username: "admin", displayName: "Administrador", email: "admin@mannol.cu", role: "admin", active: true, warehouseId: null, createdAt: Date.now() } },
      { username: "cen", password: "central2025", profile: { id: "u-cen", username: "cen", displayName: "Vendedor Central", email: "cen@mannol.cu", role: "warehouse", active: true, warehouseId: "wh-vibora", warehouseName: "Víbora", warehouseCode: "VIB", createdAt: Date.now() } },
      { username: "ved", password: "vedado2025", profile: { id: "u-ved", username: "ved", displayName: "Vendedor Vedado", email: "ved@mannol.cu", role: "warehouse", active: true, warehouseId: "wh-playa", warehouseName: "Playa", warehouseCode: "PLY", createdAt: Date.now() } },
    ];
    const user = email.toLowerCase().trim();
    const match = demoUsers.find((u) => u.username === user && u.password === password);
    if (!match) {
      throw new Error("Credenciales incorrectas. En modo demo: admin/admin123, cen/central2025, ved/vedado2025");
    }
    return match.profile;
  }

  // Supabase Auth
  // v5.20.0: se puede entrar con el NOMBRE DE USUARIO (no solo el email).
  const loginEmail = await resolveLoginEmail(s, email);
  const { data, error } = await s.auth.signInWithPassword({
    email: loginEmail,
    password,
  });
  if (error) {
    if (error.message?.includes("Invalid login credentials")) {
      throw new Error("Email o contraseña incorrectos.");
    }
    if (error.message?.includes("Email not confirmed")) {
      throw new Error("Tu email no está confirmado. Revisa tu correo.");
    }
    throw new Error(error.message || "Error al iniciar sesión");
  }

  // Fetch user profile from public.users
  const { getUserByEmail } = await import("./db.js");
  let profile = null;
  try {
    profile = await getUserByEmail(loginEmail, { throwOnError: true });
  } catch (err) {
    // v5.20.0: un fallo de red/permisos ya no se confunde con «no tienes perfil»
    await s.auth.signOut().catch(() => {});
    throw new Error("Se validó la contraseña pero no se pudo leer tu perfil (" + (err?.message || "error de red") + "). Inténtalo de nuevo.");
  }
  if (!profile) {
    await s.auth.signOut();
    throw new Error("Tu cuenta no tiene perfil en el sistema. Contacta al administrador.");
  }
  if (!profile.active) {
    await s.auth.signOut();
    throw new Error("Tu cuenta está inactiva. Contacta al administrador.");
  }
  return profile;
}

/**
 * v5.20.0: "usuario" o "email" → email para Supabase Auth.
 * Con "@" se usa tal cual. Sin "@" se busca el email del usuario con la RPC
 * email_for_username (supabase/instalar.sql); si la RPC no existe aún,
 * se prueba usuario@mannol.cu (el dominio de las cuentas creadas por defecto).
 */
async function resolveLoginEmail(s, input) {
  const v = String(input || "").trim().toLowerCase();
  if (v.includes("@")) return v;
  try {
    const { data, error } = await s.client.rpc("email_for_username", { p_username: v });
    if (!error && typeof data === "string" && data.includes("@")) return data.toLowerCase();
  } catch {}
  return `${v}@mannol.cu`;
}

// Logout
export async function logout() {
  const s = await sb();
  if (s) {
    try { await s.auth.signOut(); } catch {}
  }
  getStore().logout();
}

// Subscribe to auth state changes
export function subscribeAuth(cb) {
  let unsub = () => {};
  (async () => {
    const s = await sb();
    if (!s) { cb(null); return; }
    try {
      const { getUserByEmail } = await import("./db.js");
      // Supabase: onAuthStateChange fires on init + changes
      const { data } = s.auth.onAuthStateChange(async (_event, session) => {
        if (_event === "SIGNED_OUT") { cb(null); return; }
        if (!session?.user) {
          // Check if there's a persisted session we should restore
          let restored = null;
          try { ({ data: restored } = await s.auth.getSession()); } catch {}
          if (!restored?.session) {
            if (keepLocalUser()) return; // sin red: token sin renovar, sesión intacta
            cb(null);
            return;
          }
        }
        try {
          const email = session?.user?.email;
          if (!email) { if (!keepLocalUser()) cb(null); return; }
          const profile = await getUserByEmail(email);
          if (!profile && !isOnline()) return; // sin red: perfil no disponible, se conserva el local // perfil no disponible sin red
          cb(profile);
        } catch (err) {
          console.error("Profile load failed:", err);
          if (!isOnline() || keepLocalUser()) return;
          cb(null);
        }
      });
      unsub = () => { try { data.subscription.unsubscribe(); } catch {} };

      // Also trigger initial check
      let session = null;
      try { ({ data: session } = await s.auth.getSession()); } catch {}
      if (session?.session?.user?.email) {
        try {
          const profile = await getUserByEmail(session.session.user.email);
          if (!profile && !isOnline()) return; // sin red: perfil no disponible, se conserva el local
          cb(profile);
        } catch (err) {
          console.error("Initial profile load failed:", err);
          if (!isOnline() || keepLocalUser()) return;
          cb(null);
        }
      } else if (!keepLocalUser()) {
        cb(null);
      }
    } catch (err) {
      console.error("subscribeAuth failed:", err);
      cb(null);
    }
  })();
  return () => unsub();
}

// Helper: register a new user (admin only — used by users.js view via saveUser)
export async function registerUser(email, password, metadata = {}) {
  const s = await sb();
  if (!s) throw new Error("Supabase no está configurado");
  const { data, error } = await s.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  return data.user;
}

// Helper: change current user's password
export async function changePassword(newPassword) {
  const s = await sb();
  if (!s) throw new Error("Supabase no está configurado");
  const { error } = await s.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
