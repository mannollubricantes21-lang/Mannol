// =====================================================
// Firebase SDK — lazy dynamic loading
// =====================================================
// IMPORTANT: This file uses DYNAMIC imports for the Firebase CDN
// modules. This way, the app shell loads immediately even if:
//   - The user is offline
//   - The CDN is blocked
//   - firebase-config.js doesn't exist yet
//
// Firebase is only loaded when actually needed (first call to
// getFirebase()), and the result is cached.
// =====================================================

const FIREBASE_VERSION = "10.12.2";
const CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

// Default placeholder config (used when firebase-config.js is missing)
const DEFAULT_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
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
    const mod = await import("./firebase-config.js");
    _config = mod.firebaseConfig || DEFAULT_CONFIG;
    _configured = !!mod.isFirebaseConfigured;
  } catch {
    console.warn("[Firebase] firebase-config.js no encontrado. Modo demo activo.");
    _configured = false;
  }
}

/**
 * Initialize Firebase (lazy, cached).
 * Returns null if:
 *   - Not configured (placeholder credentials)
 *   - firebase-config.js missing
 *   - CDN unreachable
 */
export async function getFirebase() {
  if (_cached) return _cached;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    await loadConfig();
    if (!_configured) return null;

    try {
      // Dynamic import from CDN — only runs if configured
      const [appMod, authMod, fsMod, storageMod] = await Promise.all([
        import(`${CDN_BASE}/firebase-app.js`),
        import(`${CDN_BASE}/firebase-auth.js`),
        import(`${CDN_BASE}/firebase-firestore.js`),
        import(`${CDN_BASE}/firebase-storage.js`),
      ]);

      const app = appMod.getApps().length > 0 ? appMod.getApp() : appMod.initializeApp(_config);
      const auth = authMod.getAuth(app);

      // Firestore with persistent cache (offline support)
      let db;
      try {
        db = fsMod.initializeFirestore(app, {
          localCache: fsMod.persistentLocalCache({
            tabManager: fsMod.persistentMultipleTabManager(),
          }),
        });
      } catch {
        db = fsMod.getFirestore(app);
      }

      const storage = storageMod.getStorage(app);

      _cached = {
        app,
        auth,
        db,
        storage,
        // Re-export all needed functions
        onAuthStateChanged: authMod.onAuthStateChanged,
        signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
        signOut: authMod.signOut,
        collection: fsMod.collection,
        doc: fsMod.doc,
        getDoc: fsMod.getDoc,
        getDocs: fsMod.getDocs,
        setDoc: fsMod.setDoc,
        updateDoc: fsMod.updateDoc,
        deleteDoc: fsMod.deleteDoc,
        query: fsMod.query,
        where: fsMod.where,
        orderBy: fsMod.orderBy,
        onSnapshot: fsMod.onSnapshot,
        writeBatch: fsMod.writeBatch,
      };
      console.info("[Firebase] initialized successfully");
      return _cached;
    } catch (err) {
      console.error("[Firebase] init failed:", err);
      return null;
    } finally {
      _initPromise = null;
    }
  })();

  return _initPromise;
}

/**
 * Async check: is Firebase configured?
 */
export async function isFirebaseConfiguredAsync() {
  await loadConfig();
  return _configured;
}

/**
 * Sync check based on loaded config (false until loadConfig resolves).
 * For backwards compat with code that doesn't await.
 */
export let isFirebaseConfigured = false;
loadConfig().then(() => {
  isFirebaseConfigured = _configured;
});
