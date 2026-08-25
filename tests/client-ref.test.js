// =====================================================
// Tests: offline-sync.js idempotency + UUID generation
// =====================================================
import { describe, it, expect } from "vitest";
import { generateClientRef } from "../js/offline-sync.js";

describe("generateClientRef", () => {
  it("genera un UUID v4 válido", () => {
    const ref = generateClientRef();
    // Formato: 8-4-4-4-12 hex chars
    expect(ref).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("dos UUIDs son distintos", () => {
    const a = generateClientRef();
    const b = generateClientRef();
    expect(a).not.toBe(b);
  });

  it("1000 UUIDs no colisionan", () => {
    const set = new Set();
    for (let i = 0; i < 1000; i++) {
      set.add(generateClientRef());
    }
    expect(set.size).toBe(1000);
  });
});
