// =====================================================
// Authentication helpers — Supabase Auth
// =====================================================
// Mirrors the previous Firebase-based auth.js API so views
// (user-login.js, dashboard.js) don't change.
// =====================================================

import { getSupabase } from "./supabase.js";
import { getStore } from "./store.js";

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
  const { data, error } = await s.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
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
  const profile = await getUserByEmail(email.toLowerCase().trim());
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
        if (!session?.user) {
          // Check if there's a persisted session we should restore
          const { data: restored } = await s.auth.getSession();
          if (!restored?.session) {
            cb(null);
            return;
          }
        }
        try {
          const email = session?.user?.email;
          if (!email) { cb(null); return; }
          const profile = await getUserByEmail(email);
          cb(profile);
        } catch (err) {
          console.error("Profile load failed:", err);
          cb(null);
        }
      });
      unsub = () => { try { data.subscription.unsubscribe(); } catch {} };

      // Also trigger initial check
      const { data: session } = await s.auth.getSession();
      if (session?.session?.user?.email) {
        try {
          const profile = await getUserByEmail(session.session.user.email);
          cb(profile);
        } catch (err) {
          console.error("Initial profile load failed:", err);
          cb(null);
        }
      } else {
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
