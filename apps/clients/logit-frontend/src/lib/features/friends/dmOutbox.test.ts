import { beforeEach, describe, expect, it, vi } from "vitest";
const send = vi.fn();
vi.mock("$lib/api/authStore.svelte", () => ({ authStore: { isAuthenticated: true, user: { id: "u1" } } }));
vi.mock("@logit/core/api/dmApi", () => ({ dmApi: { send: (...a: unknown[]) => send(...a) } }));
import { ApiError } from "@logit/core/api/client";
import { flushOutbox, outbox, queueDm } from "./dmOutbox.svelte";

describe("message outbox", () => {
  beforeEach(() => {
    localStorage.clear();
    outbox.items = [];
    send.mockReset();
  });

  it("still sends after an empty flush", async () => {
    await flushOutbox(); // nothing waiting (app start)
    send.mockResolvedValue({});
    await queueDm({ username: "ben" }, "hi");
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.items).toEqual([]);
  });

  it("keeps a message while offline and marks one the server refused", async () => {
    send.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await queueDm({ username: "ben" }, "offline");
    expect(outbox.items).toHaveLength(1);
    expect(outbox.items[0]!.error).toBeUndefined();

    send.mockRejectedValueOnce(new ApiError(403, "This account only gets messages from people it follows."));
    await flushOutbox();
    expect(outbox.items[0]!.error).toMatch(/only gets messages/);
  });

  it("sends an uploaded photo by its id, even after waiting offline", async () => {
    send.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await queueDm({ username: "ben" }, "", undefined, { id: "p1", url: "/photos/p1", width: 3, height: 4 });
    expect(outbox.items[0]!.photo?.id).toBe("p1");
    send.mockResolvedValue({});
    await flushOutbox();
    expect(send).toHaveBeenLastCalledWith({ username: "ben" }, expect.any(String), "", { card: undefined, photoId: "p1" });
    expect(outbox.items).toEqual([]);
  });
});
