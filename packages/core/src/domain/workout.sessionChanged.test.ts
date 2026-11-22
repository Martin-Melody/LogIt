import { describe, expect, it } from "vitest";
import { finishSession, sessionChangedAtMs, touchSession, type WorkoutSession } from "./workout";

const base: WorkoutSession = { id: "s", startedAtMs: 1_000, blocks: [] };

describe("when a session last changed (two-device sync keeps the newer copy)", () => {
  it("falls back to the end, then the start, for sessions saved before the stamp existed", () => {
    expect(sessionChangedAtMs(base)).toBe(1_000);
    expect(sessionChangedAtMs({ ...base, endedAtMs: 2_000 })).toBe(2_000);
  });
  it("finishing and editing stamp it", () => {
    const finished = finishSession(base, 2_000);
    expect(finished.updatedAtMs).toBeGreaterThan(2_000);
    const edited = touchSession({ ...finished, updatedAtMs: 1 });
    expect(sessionChangedAtMs(edited)).toBeGreaterThan(1);
  });
});
