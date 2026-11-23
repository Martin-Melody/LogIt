export type ConnectionResult = "idle" | "testing" | "ok" | "error";

/** A server address as people type it ("logit.example.com/") made into a base URL ("https://logit.example.com"). */
export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function testServerConnection(baseUrl: string): Promise<"ok" | "error"> {
  try {
    const url = normalizeServerUrl(baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      return res.ok ? "ok" : "error";
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return "error";
  }
}
