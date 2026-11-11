import { describe, expect, it } from "vitest";
import {
  addMobilityBlock,
  clearRest,
  createSession,
  getRunningRests,
  type MobilityBlockData,
  type StrengthBlockData,
  type WorkoutSession,
} from "./workout";

function sessionWithRests(): WorkoutSession {
  const s = createSession(0);
  const strength = {
    id: "b1",
    type: "strength",
    orderIndex: 0,
    data: {
      exerciseName: "Squat",
      sets: [
        { id: "s1", setType: "normal", reps: 5, weight: 100, orderIndex: 0, completed: true, restStartedAtMs: 1_000 },
        { id: "s2", setType: "normal", reps: 5, weight: 100, orderIndex: 1, completed: true, restStartedAtMs: 2_000, restDurationMs: 30_000 },
        { id: "s3", setType: "normal", reps: 0, weight: 100, orderIndex: 2 },
      ],
    } satisfies StrengthBlockData,
  };
  const mobility = {
    id: "b2",
    type: "mobility",
    orderIndex: 1,
    data: {
      drillName: "Couch stretch",
      metric: "hold",
      perSide: false,
      restBetweenSetsMs: 20_000,
      sets: [{ id: "m1", orderIndex: 0, durationSec: 30, completed: true, restStartedAtMs: 5_000 }],
    } satisfies MobilityBlockData,
  };
  return { ...s, blocks: [strength, mobility] };
}

describe("rest timers", () => {
  it("lists every running rest with its end, from each set's own rule", () => {
    const rests = getRunningRests(sessionWithRests(), { normal: 120_000 });
    expect(rests).toEqual([
      { setId: "s1", startedAtMs: 1_000, endsAtMs: 121_000 }, // profile default
      { setId: "s2", startedAtMs: 2_000, endsAtMs: 32_000 }, // per-set override
      { setId: "m1", startedAtMs: 5_000, endsAtMs: 25_000 }, // mobility block rest
    ]);
  });

  it("falls back to 90 s for strength with no default for the set type", () => {
    const [first] = getRunningRests(sessionWithRests(), {});
    expect(first!.endsAtMs).toBe(91_000);
  });

  it("clearRest ends one set's rest, in either block type", () => {
    let s = clearRest(sessionWithRests(), "s1");
    s = clearRest(s, "m1");
    expect(getRunningRests(s, {}).map((r) => r.setId)).toEqual(["s2"]);
  });

  it("clearRest with a start time leaves a newer rest on the same set alone", () => {
    const s = sessionWithRests();
    expect(clearRest(s, "s1", 999)).toBe(s);
    expect(getRunningRests(clearRest(s, "s1", 1_000), {}).map((r) => r.setId)).toEqual(["s2", "m1"]);
  });

  it("mobility blocks added the normal way have no running rest", () => {
    const s = addMobilityBlock(createSession(0), { drillName: "Hip flexor" });
    expect(getRunningRests(s, {})).toEqual([]);
  });
});
