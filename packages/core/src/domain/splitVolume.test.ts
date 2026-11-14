import { describe, expect, it } from "vitest";
import { plannedSetsByMuscle } from "./splitVolume";
import type { WorkoutSplit } from "./WorkoutSplit";
import { CORE_EXERCISES, findExerciseByName } from "./coreExercises";

const split: Pick<WorkoutSplit, "days"> = {
  days: [
    {
      id: "d1", orderIndex: 0, blocks: [
        { type: "strength", id: "a", orderIndex: 0, exerciseName: "Bench Press", targets: { sets: 3 } },
        { type: "strength", id: "b", orderIndex: 1, exerciseName: "lateral raise", groupId: "g", targets: { sets: 1 } },
        { type: "strength", id: "c", orderIndex: 2, exerciseName: "Mystery Move", targets: { sets: 2 } },
        { type: "cardio", id: "d", orderIndex: 3, activityName: "Bike" },
      ],
      groups: [{ id: "g", rounds: 4 }],
    },
    { id: "d2", orderIndex: 1, rest: true, blocks: [{ type: "strength", id: "e", orderIndex: 0, exerciseName: "Squat", targets: { sets: 5 } }] },
  ],
};

describe("plannedSetsByMuscle", () => {
  it("counts sets per primary muscle, group rounds as sets, rest days skipped", () => {
    const r = plannedSetsByMuscle(split, (b) => findExerciseByName(CORE_EXERCISES, b.exerciseName)?.primaryMuscles);
    expect(r.byMuscle.get("chest")).toBe(3);
    expect(r.byMuscle.get("shoulders")).toBe(4);
    expect(r.byMuscle.get("quads")).toBeUndefined();
    expect(r.uncounted).toBe(2);
  });
});
