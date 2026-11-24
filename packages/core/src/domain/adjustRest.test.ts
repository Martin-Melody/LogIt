import { describe, expect, it } from "vitest";
import { adjustRest, getRunningRests, type WorkoutSession } from "./workout";

const session: WorkoutSession = {
  id: "s",
  startedAtMs: 0,
  blocks: [
    { id: "b", type: "strength", orderIndex: 0, data: { exerciseName: "Row", sets: [
      { id: "x", setType: "normal", reps: 8, weight: 80, orderIndex: 0, completed: true, restStartedAtMs: 1000 },
      { id: "y", setType: "normal", reps: 0, weight: 80, orderIndex: 1 },
    ] } },
  ],
};

describe("adjustRest", () => {
  it("adds to the running rest, from the default when the set has none", () => {
    const next = adjustRest(session, "x", 15_000, { normal: 120_000 });
    expect(getRunningRests(next, { normal: 120_000 })[0]!.endsAtMs).toBe(1000 + 135_000);
  });

  it("never goes under 0 and leaves sets without a running rest alone", () => {
    const shorter = adjustRest(session, "x", -999_000, { normal: 120_000 });
    expect(getRunningRests(shorter, {})[0]!.endsAtMs).toBe(1000);
    expect(adjustRest(session, "y", 15_000, {})).toBe(session);
  });
});
