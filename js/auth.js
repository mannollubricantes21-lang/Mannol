// =====================================================
// Authentication helpers (async, lazy Firebase)
// =====================================================

import { getFirebase } from "./firebase.js";
import { getStore } from "./store.js";

async function fb() {
  return await getFirebase();
}

// Get settings (cached) for PIN validation
async function getSettingsForPin() {
  const store = getStore();
  const cached = store.getState().settings;
  if (cached && cached.pinCode) return cached;
  // Lazy-load firestore helpers
  const { getSettings } = await import("./firestore.js");
  return await getSettings();
}

// Validate PIN against settings
export async function validatePin(pin) {
  const settings = await getSettingsForPin();
  return pin === settings.pinCode;
}

// Login with email + password
export async function loginWithEmail(email, password) {
  const f = await fb();
  if (!f) {
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
  const cred = await f.signInWithEmailAndPassword(f.auth, email.toLowerCase(), password);
  const { getUserByEmail } = await import("./firestore.js");
  const profile = await getUserByEmail(cred.user.email || email);
  if (!profile) {
    await f.signOut(f.auth);
    throw new Error("Tu cuenta no tiene perfil en el sistema. Contacta al administrador.");
  }
  if (!profile.active) {
    await f.signOut(f.auth);
    throw new Error("Tu cuenta está inactiva. Contacta al administrador.");
  }
  return profile;
}

// Logout
export async function logout() {
  const f = await fb();
  if (f) {
    try { await f.signOut(f.auth); } catch {}
  }
  getStore().logout();
}

// Subscribe to auth state changes
export function subscribeAuth(cb) {
  let unsub = () => {};
  (async () => {
    const f = await fb();
    if (!f) { cb(null); return; }
    try {
      const { getUserByEmail } = await import("./firestore.js");
      unsub = f.onAuthStateChanged(f.auth, async (fbUser) => {
        if (!fbUser) { cb(null); return; }
        try {
          const profile = await getUserByEmail(fbUser.email || "");
          cb(profile);
        } catch (err) {
          console.error("Profile load failed:", err);
          cb(null);
        }
      });
    } catch (err) {
      console.error("subscribeAuth failed:", err);
      cb(null);
    }
  })();
  return () => unsub();
}
