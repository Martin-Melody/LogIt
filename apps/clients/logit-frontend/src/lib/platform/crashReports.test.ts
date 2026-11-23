import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@logit/core/api/client", () => ({ apiClient: { fetch: (...a: unknown[]) => fetchMock(...a) } }));
vi.mock("@logit/core/api/serverConfig", () => ({ getServerMode: () => "offline" }));
vi.mock("./deviceInfo", () => ({
  getDeviceInfo: async () => ({ appVersion: "1.0.0 (7)", platform: "android" }),
  deviceInfoHeader: () => ({ App: "1.0.0 (7)" }),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

async function freshApp() {
  vi.resetModules();
  const logMod = await import("@logit/core/platform/log");
  const crash = await import("./crashReports");
  return { log: logMod.log, start: crash.startCrashReports };
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("crash reports", () => {
  it("production builds send nothing", async () => {
    vi.stubEnv("VITE_CRASH_REPORTS", "");
    const { log, start } = await freshApp();
    start();
    log.error("crash", "Uncaught error: boom");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a test build sends each crash once, with the lines before it, and ignores other errors", async () => {
    vi.stubEnv("VITE_CRASH_REPORTS", "auto");
    fetchMock.mockResolvedValue({ id: "r1" });
    const { log, start } = await freshApp();
    start();
    log.info("app", "Opened the workout");
    log.error("sync", "Sync failed");
    log.error("crash", "Uncaught error: boom");
    log.error("crash", "Uncaught error: boom");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/diagnostics/crashes");
    const body = JSON.parse(init.body);
    expect(body.platform).toBe("android");
    expect(body.log).toContain("Opened the workout");
    expect(body.log).toContain("Uncaught error: boom");
  });

  it("with no signal it keeps the crash and sends it at the next start", async () => {
    vi.stubEnv("VITE_CRASH_REPORTS", "auto");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    let app = await freshApp();
    app.start();
    app.log.error("crash", "Uncaught error: offline");
    await flush();
    await flush();

    fetchMock.mockReset().mockResolvedValue({ id: "r2" });
    app = await freshApp();
    app.start();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).log).toContain("Uncaught error: offline");
    expect(localStorage.getItem("logit:crash:pending:v1")).toBeNull();
  });

  it("a refused report is dropped, not retried", async () => {
    vi.stubEnv("VITE_CRASH_REPORTS", "auto");
    fetchMock.mockRejectedValue(Object.assign(new Error("Too many"), { status: 429 }));
    const { log, start } = await freshApp();
    start();
    log.error("crash", "Uncaught error: loop");
    await flush();
    await flush();
    expect(localStorage.getItem("logit:crash:pending:v1")).toBeNull();
  });
});
