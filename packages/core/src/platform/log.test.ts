import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetLogForTests,
  clearLog,
  formatLog,
  getLogEntries,
  log,
  onLogChange,
  setVerbose,
} from "./log";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  _resetLogForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("log", () => {
  it("keeps info and above, and debug only in detailed mode", () => {
    log.debug("api", "GET /x 200");
    log.info("sync", "sync finished");
    expect(getLogEntries().map((e) => e.msg)).toEqual(["sync finished"]);

    setVerbose(true);
    log.debug("api", "GET /x 200");
    expect(getLogEntries().map((e) => e.msg)).toEqual(["sync finished", "GET /x 200"]);
  });

  it("hides secret keys, tokens and email addresses", () => {
    log.warn("auth", "login failed for martin@example.com", {
      password: "hunter2",
      refreshToken: "abc",
      headers: { Authorization: "Bearer x" },
      note: "token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4",
      status: 401,
    });
    const [e] = getLogEntries();
    expect(e!.msg).toBe("login failed for [email]");
    expect(e!.data).toEqual({
      password: "[hidden]",
      refreshToken: "[hidden]",
      headers: { Authorization: "[hidden]" },
      note: "token [token]",
      status: 401,
    });
  });

  it("records errors with name, message, status and a short stack", () => {
    const err = Object.assign(new Error("Server said no"), { status: 500 });
    log.error("sync", "push failed", err);
    const data = getLogEntries()[0]!.data as { error: Record<string, unknown> };
    expect(data.error.name).toBe("Error");
    expect(data.error.message).toBe("Server said no");
    expect(data.error.status).toBe(500);
    expect(typeof data.error.stack).toBe("string");
  });

  it("counts repeats instead of adding them again", () => {
    log.warn("sync", "pull failed", { status: 403 });
    log.info("app", "something else");
    log.warn("sync", "pull failed", { status: 403 });
    log.warn("sync", "pull failed", { status: 500 });
    const list = getLogEntries();
    expect(list).toHaveLength(2);
    expect(list[1]!.msg).toBe("pull failed");
    expect(list[1]!.n).toBe(3);
    expect(list[1]!.data).toEqual({ status: 500 });
  });

  it("caps the buffer at 1000 entries, dropping the oldest", () => {
    for (let i = 0; i < 1100; i++) log.info("t", `entry ${i}`);
    const list = getLogEntries();
    expect(list).toHaveLength(1000);
    expect(list[0]!.msg).toBe("entry 100");
  });

  it("survives a reload through localStorage", () => {
    log.error("app", "boom"); // errors are saved immediately
    const saved = localStorage.getItem("logit:log:v1");
    _resetLogForTests();
    localStorage.setItem("logit:log:v1", saved!);
    expect(getLogEntries().map((e) => e.msg)).toEqual(["boom"]);
  });

  it("clears and notifies listeners", () => {
    const fn = vi.fn();
    const off = onLogChange(fn);
    log.info("a", "one");
    clearLog();
    expect(getLogEntries()).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    log.info("a", "two");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("formats a readable text export", () => {
    log.warn("api", "POST /sync/sessions 500", { requestId: "abc123", ms: 42 });
    const text = formatLog({ App: "1.2.3", Platform: "android", Empty: "" });
    expect(text).toContain("Logit diagnostics");
    expect(text).toContain("App: 1.2.3");
    expect(text).not.toContain("Empty:");
    expect(text).toMatch(/WARN {2}api {6}POST \/sync\/sessions 500 \{"requestId":"abc123","ms":42\}/);
  });
});
