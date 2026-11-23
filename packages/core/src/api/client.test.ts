import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient, fallbackErrorMessage, WRONG_CREDENTIALS_MESSAGE } from "./client";

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

/** A response like one over HTTP/2: no status text. */
function reply(status: number, body?: object) {
  return new Response(body ? JSON.stringify(body) : null, { status, statusText: "" });
}

async function loginError(res: Response): Promise<ApiError> {
  vi.stubGlobal("fetch", vi.fn(async () => res));
  const err = await apiClient.login("martin", "wrong").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api errors", () => {
  it("passes on the server's message for a failed sign-in", async () => {
    const err = await loginError(reply(401, { error: "That username or password isn't right.", code: "invalid_credentials" }));
    expect(err.message).toBe("That username or password isn't right.");
    expect(err.code).toBe("invalid_credentials");
  });

  it("still has a message when an older server sends a bare 401 with no status text", async () => {
    const err = await loginError(reply(401));
    expect(err.message).toBe(WRONG_CREDENTIALS_MESSAGE);
    expect(err.status).toBe(401);
  });

  it("never ends up with an empty message for other bodiless errors", async () => {
    for (const status of [400, 403, 404, 429, 500, 502]) {
      const err = await loginError(reply(status));
      expect(err.message).toBe(fallbackErrorMessage(status));
      expect(err.message.trim()).not.toBe("");
    }
  });
});

describe("sync the plan doesn't include (bug hunt 12.2, 4.9)", () => {
  it("asks once, then stops sending a refused /sync request until an hour has passed or the plan changes", async () => {
    await apiClient.reloadSession();
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(async () => reply(403, { error: "Your free backup is on another phone.", code: "backup_other_device" }));
      vi.stubGlobal("fetch", fetch);
      for (let i = 0; i < 3; i++) {
        const err = await apiClient.fetch("/sync/splits").catch((e) => e);
        expect(err).toMatchObject({ status: 403, code: "backup_other_device" });
      }
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(apiClient.isBackupElsewhere()).toBe(true);
      // Other routes and other requests aren't held back.
      await apiClient.fetch("/sync/habits").catch(() => {});
      await apiClient.fetch("/users/me").catch(() => {});
      expect(fetch).toHaveBeenCalledTimes(3);
      vi.advanceTimersByTime(60 * 60 * 1000);
      await apiClient.fetch("/sync/splits").catch(() => {});
      expect(fetch).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("forgetPickedServer", () => {
  it("does nothing when no server was picked", async () => {
    localStorage.setItem("logit:auth:access", "a");
    expect(await apiClient.forgetPickedServer()).toBe(false);
    expect(localStorage.getItem("logit:auth:access")).toBe("a");
  });

  it("forgets another server and its session", async () => {
    localStorage.setItem("logit:api:baseUrl", "https://logit-api.example.org");
    localStorage.setItem("logit:server:mode", "selfhosted");
    localStorage.setItem("logit:auth:access", "a");
    localStorage.setItem("logit:auth:refresh", "r");
    expect(await apiClient.forgetPickedServer()).toBe(true);
    expect(apiClient.getBaseUrl()).not.toBe("https://logit-api.example.org");
    expect(localStorage.getItem("logit:server:mode")).toBeNull();
    expect(localStorage.getItem("logit:auth:access")).toBeNull();
  });

  it("keeps the session when the picked server is this dashboard's own", async () => {
    localStorage.setItem("logit:api:baseUrl", apiClient.getBaseUrl());
    localStorage.setItem("logit:auth:access", "a");
    expect(await apiClient.forgetPickedServer()).toBe(false);
    expect(localStorage.getItem("logit:auth:access")).toBe("a");
  });
});
