import { describe, expect, it } from "vitest";
import {
  addExercise,
  addSet,
  applySetPlan,
  createSession,
  dropUnloggedPlannedSets,
  getExercises,
  updateSet,
  type WorkoutSession,
} from "./workout";

function withBench(): { s: WorkoutSession; id: string } {
  const s = addExercise(createSession(1000), { exerciseName: "Bench" });
  return { s, id: getExercises(s)[0]!.id };
}

const plan = [
  { reps: 7, weight: 62.5 },
  { reps: 6, weight: 62.5 },
  { reps: 6, weight: 62.5 },
];

describe("applySetPlan", () => {
  it("creates one planned set per prescribed set, weight filled, reps waiting", () => {
    const { s, id } = withBench();
    const sets = getExercises(applySetPlan(s, id, plan))[0]!.sets;
    expect(sets.map((x) => [x.reps, x.weight, x.target?.reps])).toEqual([
      [0, 62.5, 7],
      [0, 62.5, 6],
      [0, 62.5, 6],
    ]);
  });

  it("keeps logged sets and plans only the remaining slots (swap mid-exercise)", () => {
    const { s, id } = withBench();
    let next = applySetPlan(s, id, plan);
    const first = getExercises(next)[0]!.sets[0]!;
    next = updateSet(next, id, first.id, { reps: 7, completed: true });

    const incline = [
      { reps: 12, weight: 24 },
      { reps: 12, weight: 24 },
      { reps: 11, weight: 24 },
    ];
    const sets = getExercises(applySetPlan(next, id, incline))[0]!.sets;
    expect(sets.map((x) => [x.reps, x.weight, x.target?.reps ?? null, x.orderIndex])).toEqual([
      [7, 62.5, 7, 0],
      [0, 24, 12, 1],
      [0, 24, 11, 2],
    ]);
  });

  it("never removes a set entered by hand", () => {
    const { s, id } = withBench();
    const manual = addSet(s, id, { weight: 50 });
    const sets = getExercises(applySetPlan(manual, id, plan))[0]!.sets;
    expect(sets).toHaveLength(3);
    expect(sets[0]!.target).toBeUndefined();
    expect(sets[0]!.weight).toBe(50);
  });
});

describe("dropUnloggedPlannedSets", () => {
  it("drops planned sets that were never done, keeps done and hand-entered ones", () => {
    const { s, id } = withBench();
    let next = applySetPlan(addSet(s, id, { weight: 40 }), id, plan);
    const sets = getExercises(next)[0]!.sets;
    next = updateSet(next, id, sets[1]!.id, { reps: 7, completed: true });
    next = updateSet(next, id, sets[2]!.id, { reps: 5 }); // typed, not ticked: still counts

    const left = getExercises(dropUnloggedPlannedSets(next))[0]!.sets;
    expect(left.map((x) => [x.reps, x.weight, x.orderIndex])).toEqual([
      [0, 40, 0],
      [7, 62.5, 1],
      [5, 62.5, 2],
    ]);
  });
});
