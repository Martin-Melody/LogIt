// The offline outbox (src/lib/sync/outbox.ts): entries stay stored until sent, failures and
// entries queued mid-flush survive, and each phone profile has its own queue.
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushSessions = vi.fn();
const pushSplits = vi.fn();
const startAssigned = vi.fn();

vi.mock("@logit/core/api/syncApi", () => ({ syncApi: { pushSessions, pushSplits } }));
vi.mock("@logit/core/api/coachProgramApi", () => ({ coachProgramApi: { startAssigned, upsert: vi.fn() } }));
vi.mock("@logit/core/api/checkinApi", () => ({ checkinApi: { upsert: vi.fn() } }));
vi.mock("@logit/core/api/messagesApi", () => ({ messagesApi: { send: vi.fn() } }));

const { enqueue, flush } = await import("$lib/sync/outbox");
const { setActiveOwnerId } = await import("$lib/data/activeOwner");

const session = (id: string) => ({ type: "session" as const, dto: { id, startedAtMs: 1, dataJson: "{}" } });
const split = (id: string) => ({ type: "split" as const, dto: { id, updatedAtMs: 1, dataJson: "{}" } });

function stored(key: string) {
  return JSON.parse(localStorage.getItem(key) ?? "[]") as { type: string; dto: { id?: string } }[];
}

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  setActiveOwnerId(null);
});

describe("outbox flush", () => {
  it("removes what was sent", async () => {
    enqueue(session("s1"));
    await flush();
    expect(pushSessions).toHaveBeenCalledWith([expect.objectContaining({ id: "s1" })]);
    expect(stored("logit:sync:outbox")).toEqual([]);
  });

  it("keeps entries stored while they're being sent, so closing the app loses nothing", async () => {
    enqueue(session("s1"));
    let duringSend: unknown[] = [];
    pushSessions.mockImplementation(async () => {
      duringSend = stored("logit:sync:outbox");
    });
    await flush();
    expect(duringSend).toHaveLength(1);
  });

  it("keeps failures (first) and anything queued during the flush", async () => {
    enqueue(session("s1"));
    enqueue(split("p1"));
    pushSessions.mockImplementation(async () => {
      enqueue(session("s2")); // a write made while the flush is running
    });
    pushSplits.mockRejectedValue(new Error("offline"));
    await flush();
    expect(stored("logit:sync:outbox").map((e) => e.dto.id)).toEqual(["p1", "s2"]);
  });
});

describe("outbox per profile", () => {
  it("never sends one profile's queue with another profile's sign-in", async () => {
    setActiveOwnerId("A");
    enqueue(session("from-A"));
    setActiveOwnerId("B");
    await flush();
    expect(pushSessions).not.toHaveBeenCalled();
    expect(stored("logit:sync:A:outbox")).toHaveLength(1);
  });

  it("the old shared queue is adopted by the active profile", async () => {
    localStorage.setItem("logit:sync:outbox", JSON.stringify([session("legacy")]));
    setActiveOwnerId("A");
    enqueue(session("new"));
    expect(stored("logit:sync:A:outbox").map((e) => e.dto.id)).toEqual(["legacy", "new"]);
    expect(localStorage.getItem("logit:sync:outbox")).toBeNull();
  });
});

describe("program starts in the outbox", () => {
  it("sends the earliest queued start per program", async () => {
    enqueue({ type: "programStart", dto: { programId: "p", startedAtMs: 100 } });
    enqueue({ type: "programStart", dto: { programId: "p", startedAtMs: 200 } });
    await flush();
    expect(startAssigned).toHaveBeenCalledTimes(1);
    expect(startAssigned).toHaveBeenCalledWith("p", 100);
  });
});
