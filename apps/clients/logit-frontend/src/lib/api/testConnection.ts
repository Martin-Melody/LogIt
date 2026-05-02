export type ConnectionResult = "idle" | "testing" | "ok" | "error";

export async function testServerConnection(baseUrl: string): Promise<"ok" | "error"> {
  try {
    const url = baseUrl.replace(/\/$/, "");
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
