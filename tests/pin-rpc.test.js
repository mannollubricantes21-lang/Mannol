import { describe, it, expect, vi } from "vitest";

// v5.23.3: verifyWarehousePin llamaba a s.rpc (no existe en el envoltorio)
const rpc = vi.fn(async () => ({ data: { ok: true, pinLength: 4 }, error: null }));
vi.mock("../js/supabase.js", async (orig) => {
  const real = await orig();
  return { ...real, getSupabase: async () => ({ client: { rpc } }), isSupabaseConfiguredAsync: async () => true };
});

describe("verifyWarehousePin", () => {
  it("usa client.rpc y devuelve el resultado del servidor", async () => {
    const { verifyWarehousePin } = await import("../js/db.js");
    const res = await verifyWarehousePin("VIB", "2611");
    expect(rpc).toHaveBeenCalledWith("verify_warehouse_pin", { p_code: "VIB", p_pin: "2611" });
    expect(res.ok).toBe(true);
  });
});
