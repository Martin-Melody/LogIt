import { describe, expect, it } from "vitest";
import { computeIntegrity, isIntegrityString, verifyIntegrity } from "./integrity";

describe("integrity", () => {
  it("computes a sha256- prefixed base64 digest", async () => {
    const hash = await computeIntegrity("hello world");
    expect(hash.startsWith("sha256-")).toBe(true);
    // Known SHA-256 of "hello world" in base64.
    expect(hash).toBe("sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=");
  });

  it("verifies a matching artifact", async () => {
    const text = '{"formatVersion":1}';
    const hash = await computeIntegrity(text);
    expect(await verifyIntegrity(text, hash)).toBe(true);
  });

  it("rejects a tampered artifact", async () => {
    const hash = await computeIntegrity("original");
    expect(await verifyIntegrity("tampered", hash)).toBe(false);
  });

  it("rejects a malformed expected string instead of throwing", async () => {
    expect(await verifyIntegrity("x", "not-a-hash")).toBe(false);
    expect(await verifyIntegrity("x", "")).toBe(false);
  });

  it("classifies integrity strings", () => {
    expect(isIntegrityString("sha256-abc")).toBe(true);
    expect(isIntegrityString("sha512-abc")).toBe(false);
    expect(isIntegrityString("sha256-")).toBe(false);
    expect(isIntegrityString(42)).toBe(false);
  });
});

describe("the fallback SHA-256 (no Web Crypto on plain http)", () => {
  it("matches Web Crypto for empty, short, block-boundary and long input", async () => {
    const { sha256 } = await import("./integrity");
    for (const text of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "é plugin ✓ ".repeat(500)]) {
      const data = new TextEncoder().encode(text);
      const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
      expect(Array.from(sha256(data))).toEqual(Array.from(expected));
    }
  });

  it("is used when crypto.subtle is missing", async () => {
    const { computeIntegrity } = await import("./integrity");
    const real = await computeIntegrity("hello plugin");
    const desc = Object.getOwnPropertyDescriptor(globalThis.crypto, "subtle") ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(globalThis.crypto), "subtle")!;
    Object.defineProperty(globalThis.crypto, "subtle", { value: undefined, configurable: true });
    try {
      expect(await computeIntegrity("hello plugin")).toBe(real);
    } finally {
      delete (globalThis.crypto as { subtle?: unknown }).subtle;
      if (!globalThis.crypto.subtle) Object.defineProperty(globalThis.crypto, "subtle", desc);
    }
  });
});
