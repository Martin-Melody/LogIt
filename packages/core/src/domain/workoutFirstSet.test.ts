import { describe, expect, it } from "vitest";
import { createSession, planRestFromFirstSet, type WorkoutSession } from "./workout";

function session(sets: { reps: number; weight: number; completed?: boolean; target?: { reps: number; repsMax?: number; weight: number } }[]): WorkoutSession {
  return {
    ...createSession(0),
    blocks: [{ id: "b", type: "strength", orderIndex: 0, data: { exerciseName: "Bench Press", sets: sets.map((s, i) => ({ id: `s${i + 1}`, setType: "normal", orderIndex: i, ...s })) } }],
  } as unknown as WorkoutSession;
}
const targets = (s: WorkoutSession) => (s.blocks[0]!.data as { sets: { target?: unknown }[] }).sets.map((x) => x.target ?? null);

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
});
