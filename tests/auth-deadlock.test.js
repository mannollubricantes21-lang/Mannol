import { describe, it, expect, vi } from "vitest";

// v5.23.4: supabase-js espera al callback de onAuthStateChange con su candado
// tomado. Si el callback consulta la sesión, se bloquea («Entrando…» infinito).
let locked = null;
const listeners = [];
const auth = {
  onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
  async getSession() {
    if (locked) await locked;
    return { data: { session: null } };
  },
  async signInWithPassword() {
    let release;
    locked = new Promise((r) => { release = r; });
    await Promise.all(listeners.map((l) => l("SIGNED_IN", { user: { email: "admin@x.cu" } })));
    locked = null;
    release();
    return { data: {}, error: null };
  },
};

vi.mock("../js/supabase.js", async (orig) => ({
  ...(await orig()),
  getSupabase: async () => ({ client: {}, auth }),
  hasPersistedSupabaseSession: () => false,
}));
vi.mock("../js/db.js", () => ({
  // Como la real: para consultar la tabla necesita la sesión
  getUserByEmail: async (email) => { await auth.getSession(); return { email, role: "admin" }; },
}));

describe("subscribeAuth", () => {
  it("no bloquea el inicio de sesión (el trabajo va fuera del callback)", async () => {
    const { subscribeAuth } = await import("../js/auth.js");
    const seen = [];
    subscribeAuth((p) => seen.push(p));
    await new Promise((r) => setTimeout(r, 20)); // registro del listener
    const res = await Promise.race([
      auth.signInWithPassword().then(() => "ok"),
      new Promise((r) => setTimeout(() => r("bloqueado"), 500)),
    ]);
    expect(res).toBe("ok");
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.some((p) => p && p.role === "admin")).toBe(true);
  });
});
