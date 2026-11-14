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
