import { describe, expect, it, vi } from "vitest";
vi.mock("$lib/api/authStore.svelte", () => ({ authStore: { isAuthenticated: true } }));
vi.mock("$lib/stores/currentSession.store", () => ({ currentSession: { subscribe: () => () => {} } }));
vi.mock("$lib/features/sound/sounds", () => ({ playSound: vi.fn() }));
import { isTrainingNow, MAX_AGE_MS } from "./trainingPresence";
import { cheerText } from "./cheers.svelte";

describe("training now", () => {
  const now = 1_000_000_000_000;
  it("counts a running workout, not a finished or forgotten one", () => {
    expect(isTrainingNow({ startedAtMs: now - 60_000 }, now)).toBe(true);
    expect(isTrainingNow({ startedAtMs: now - 60_000, endedAtMs: now }, now)).toBe(false);
    expect(isTrainingNow({ startedAtMs: now - MAX_AGE_MS - 1 }, now)).toBe(false);
    expect(isTrainingNow(null, now)).toBe(false);
  });
});

describe("cheer pill", () => {
  it("stacks names like the mock-up", () => {
    expect(cheerText(["Alex"])).toBe("Alex is cheering you on");
    expect(cheerText(["Alex", "Riya"])).toBe("Alex and Riya are cheering you on");
    expect(cheerText(["Alex", "Riya", "Dev"])).toBe("Alex and 2 others are cheering you on");
  });
});
