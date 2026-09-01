/**
 * Subresource-style integrity for plugin artifacts. Format: `sha256-<base64>`,
 * matching the HTML `integrity` attribute so hashes can be generated with
 * standard tooling (`openssl dgst -sha256 -binary file | openssl base64`).
 *
 * Uses Web Crypto, available in browsers and Node 18+.
 */

const PREFIX = "sha256-";

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]!);
  // btoa exists in browsers and modern Node globals.
  return btoa(binary);
}

/** Compute the `sha256-<base64>` integrity string for a UTF-8 text artifact. */
export async function computeIntegrity(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return PREFIX + toBase64(digest);
}

export function isIntegrityString(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(PREFIX) && v.length > PREFIX.length;
}

/**
 * Verify a text artifact against an expected `sha256-<base64>` string.
 * Returns true only on an exact match. A malformed `expected` is a rejection,
 * not a throw — callers treat a failed check as "do not install".
 */
export async function verifyIntegrity(text: string, expected: string): Promise<boolean> {
  if (!isIntegrityString(expected)) return false;
  const actual = await computeIntegrity(text);
  // Constant-time-ish: lengths are fixed for SHA-256, compare directly.
  return actual === expected;
}
