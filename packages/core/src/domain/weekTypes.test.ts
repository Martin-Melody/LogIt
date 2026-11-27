import { describe, expect, it } from "vitest";
import { WEEK_TYPES, weekReps, weekSets, weekTypeOf, weekTypeText, weekWeight } from "./weekTypes";
import { planExercise } from "./programPlan";
import { setWeekType } from "./programBuilder";
import type { CoachProgram } from "./CoachProgram";

const program = (weeks: number): CoachProgram => ({
  id: "p", name: "P", rule: { kind: "linear", stepKg: 2.5 }, weeks: Array.from({ length: weeks }, (_, i) => ({
    id: `w${i + 1}`, weekNumber: i + 1, days: [{ id: "d", orderIndex: 0, blocks: [{ type: "strength", id: "b", orderIndex: 0, exerciseName: "Bench", sets: [0, 1, 2, 3].map((k) => ({ id: `s${k}`, orderIndex: k, setType: "normal", reps: 5, weight: 100 })) }] }],
  })),
} as unknown as CoachProgram);

describe("week types", () => {
  it("reads an old lighter week as a deload", () => {
    expect(weekTypeOf({ lighter: true })?.kind).toBe("deload");
    expect(weekTypeOf({})).toBeNull();
  });

  it("changes sets, load and reps", () => {
    expect(weekSets(WEEK_TYPES.deload, 4)).toBe(2);
    expect(weekWeight(WEEK_TYPES.intro, 100)).toBe(90);
    expect(weekReps(WEEK_TYPES.heavy, "6–8")).toBe("4–6");
    expect(weekReps(WEEK_TYPES.test, "5")).toBe("5+");
    expect(weekTypeText({ kind: "own", name: "Peak", setsDelta: -1, loadPct: 5, repsDelta: -2, progression: "moves" })).toBe("−1 sets, load +5%, −2 reps".replace("−1 sets", "-1 set"));
  });

  it("a deload pauses the progression and the next week carries on", () => {
    let p = program(4);
    p = setWeekType(p, 3, WEEK_TYPES.deload);
    const cells = planExercise(p, "b");
    expect(cells.map((c) => c?.weight)).toEqual([100, 102.5, 102.5, 105]);
    expect(cells[2]?.sets).toBe(2);
  });

  it("a heavy week adds load and takes reps on top of the plan", () => {
    const p = setWeekType(program(2), 2, WEEK_TYPES.heavy);
    const [a, b] = planExercise(p, "b");
    expect(b?.weight).toBe(Math.round(((a!.weight! + 2.5) * 1.05) / 2.5) * 2.5);
    expect(b?.reps).toBe("3");
  });
});
