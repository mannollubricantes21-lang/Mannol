// =====================================================
// Tests: js/pin-utils.js — PIN con hash (v5.17)
// El PIN se valida en el servidor; offline se revalida con
// SHA-256(pin + sal) usando WebCrypto. Estas pruebas cubren
// la generación/comparación del hash y el guardado local.
// =====================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizePin,
  sha256Hex,
  verifyPinHash,
  savePinMeta,
  loadPinMeta,
  clearPinMeta,
} from "../js/pin-utils.js";

const SALT = "a1b2c3d4e5f6a7b8";
const PIN = "2025";

beforeEach(() => {
  localStorage.clear();
});

describe("sha256Hex", () => {
  it("calcula el SHA-256 conocido de una cadena", async () => {
    // echo -n "abc" | sha256sum
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("devuelve null si WebCrypto no está disponible", async () => {
    const subtle = globalThis.crypto?.subtle;
    const hadCrypto = "crypto" in globalThis;
    if (hadCrypto) {
      // Simular un navegador sin crypto.subtle (contexto no seguro)
      const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
      Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
      expect(await sha256Hex("abc")).toBe(null);
      if (desc) Object.defineProperty(globalThis, "crypto", desc);
    } else {
      expect(await sha256Hex("abc")).toBe(null);
    }
    expect(subtle === undefined || !!subtle).toBe(true);
  });
});

describe("verifyPinHash", () => {
  it("acepta el PIN correcto para su sal", async () => {
    const hash = await sha256Hex(PIN + SALT);
    expect(await verifyPinHash(PIN, SALT, hash)).toBe(true);
  });

  it("rechaza un PIN incorrecto", async () => {
    const hash = await sha256Hex(PIN + SALT);
    expect(await verifyPinHash("0000", SALT, hash)).toBe(false);
  });

  it("rechaza si la sal no coincide", async () => {
    const hash = await sha256Hex(PIN + SALT);
    expect(await verifyPinHash(PIN, "00ff00ff00ff00ff", hash)).toBe(false);
  });

  it("rechaza datos ausentes (sin hash, sin sal, sin pin)", async () => {
    const hash = await sha256Hex(PIN + SALT);
    expect(await verifyPinHash(PIN, SALT, null)).toBe(false);
    expect(await verifyPinHash(PIN, null, hash)).toBe(false);
    expect(await verifyPinHash("", SALT, hash)).toBe(false);
  });
});

describe("meta de PIN por almacén (localStorage)", () => {
  it("guarda y recupera sal/hash/longitud", () => {
    savePinMeta("VIB", { salt: SALT, hash: "ab".repeat(32), len: 4 });
    const meta = loadPinMeta("vib"); // clave insensible a mayúsculas
    expect(meta).not.toBeNull();
    expect(meta.salt).toBe(SALT);
    expect(meta.hash).toBe("ab".repeat(32));
    expect(meta.len).toBe(4);
    expect(meta.ts).toBeGreaterThan(0);
  });

  it("ignora metas incompletas", () => {
    savePinMeta("VIB", { salt: SALT, hash: null, len: 4 });
    expect(loadPinMeta("VIB")).toBeNull();
    savePinMeta("", { salt: SALT, hash: "ab".repeat(32) });
    expect(loadPinMeta("")).toBeNull();
  });

  it("clearPinMeta borra la entrada", () => {
    savePinMeta("LIS", { salt: SALT, hash: "cd".repeat(32), len: 6 });
    expect(loadPinMeta("LIS")).not.toBeNull();
    clearPinMeta("LIS");
    expect(loadPinMeta("LIS")).toBeNull();
  });

  it("sobrevive a localStorage roto sin lanzar", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("QuotaExceeded"); };
    expect(() => savePinMeta("PLY", { salt: SALT, hash: "ef".repeat(32) })).not.toThrow();
    Storage.prototype.setItem = orig;
  });
});

describe("normalización", () => {
  it("normalizePin recorta espacios y pasa números a string", () => {
    expect(normalizePin(" 2025 ")).toBe("2025");
    expect(normalizePin(1234)).toBe("1234");
    expect(normalizePin(null)).toBe("");
  });
});
