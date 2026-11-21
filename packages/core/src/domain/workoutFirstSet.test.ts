import { describe, expect, it } from "vitest";
import { createSession, planRestFromFirstSet, type WorkoutSession } from "./workout";

function session(sets: { reps: number; weight: number; completed?: boolean; target?: { reps: number; repsMax?: number; weight: number } }[]): WorkoutSession {
  return {
    ...createSession(0),
    blocks: [{ id: "b", type: "strength", orderIndex: 0, data: { exerciseName: "Bench Press", sets: sets.map((s, i) => ({ id: `s${i + 1}`, setType: "normal", orderIndex: i, ...s })) } }],
  } as unknown as WorkoutSession;
}
const targets = (s: WorkoutSession) => (s.blocks[0]!.data as { sets: { target?: unknown }[] }).sets.map((x) => x.target ?? null);
const weights = (s: WorkoutSession) => (s.blocks[0]!.data as { sets: { weight: number }[] }).sets.map((x) => x.weight);

describe("an exercise's first ever set plans the rest (canvas O4)", () => {
  it("same weight, one rep fewer each, never under the range", () => {
    const s = session([
      { reps: 8, weight: 60, completed: true },
      { reps: 0, weight: 0, target: { reps: 5, repsMax: 8, weight: 0 } },
      { reps: 0, weight: 0, target: { reps: 5, repsMax: 8, weight: 0 } },
      { reps: 0, weight: 0, target: { reps: 5, repsMax: 8, weight: 0 } },
      { reps: 0, weight: 0, target: { reps: 5, repsMax: 8, weight: 0 } },
    ]);
    expect(targets(planRestFromFirstSet(s, "b", "s1", 5)).slice(1)).toEqual([
      { reps: 7, weight: 60 }, { reps: 6, weight: 60 }, { reps: 5, weight: 60 }, { reps: 5, weight: 60 },
    ]);
    expect(weights(planRestFromFirstSet(s, "b", "s1", 5))).toEqual([60, 60, 60, 60, 60]);
  });

  it("leaves sets with something entered, and does nothing before the first set is logged", () => {
    const s = session([
      { reps: 8, weight: 60, completed: true },
      { reps: 0, weight: 62.5 },
      { reps: 0, weight: 0, target: { reps: 5, repsMax: 8, weight: 0 } },
    ]);
    expect(targets(planRestFromFirstSet(s, "b", "s1", 5))).toEqual([null, null, { reps: 7, weight: 60 }]);
    const notYet = session([{ reps: 8, weight: 60 }, { reps: 0, weight: 0 }]);
    expect(planRestFromFirstSet(notYet, "b", "s1")).toEqual(notYet);
  });

  it("a corrected first set (825 typed for 82.5) re-plans the sets it planned, not ones you changed", () => {
    const typo = session([
      { reps: 8, weight: 825, completed: true },
      { reps: 0, weight: 0, target: { reps: 5, repsMax: 8, weight: 0 } },
      { reps: 0, weight: 0, target: { reps: 5, repsMax: 8, weight: 0 } },
      { reps: 0, weight: 0, target: { reps: 5, repsMax: 8, weight: 0 } },
    ]);
    const planned = planRestFromFirstSet(typo, "b", "s1", 5);
    const sets = (planned.blocks[0]!.data as { sets: { weight: number; reps: number }[] }).sets;
    sets[0]!.weight = 82.5;
    sets[3]!.weight = 80; // typed in by hand
    expect(weights(planRestFromFirstSet(planned, "b", "s1", 5))).toEqual([82.5, 825, 825, 80]);
    expect(weights(planRestFromFirstSet(planned, "b", "s1", 5, true))).toEqual([82.5, 82.5, 82.5, 80]);
    expect(targets(planRestFromFirstSet(planned, "b", "s1", 5, true)).slice(1, 3)).toEqual([{ reps: 7, weight: 82.5 }, { reps: 6, weight: 82.5 }]);
  });
});
