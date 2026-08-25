export type ConnectionResult = "idle" | "testing" | "ok" | "error";

export async function testServerConnection(baseUrl: string): Promise<"ok" | "error"> {
  try {
    const url = baseUrl.replace(/\/$/, "");
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
