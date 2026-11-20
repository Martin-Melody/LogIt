import { describe, expect, it } from "vitest";
import { mergeExerciseInGoal, mergeExerciseInSession, mergeExerciseInSplit } from "./exerciseMerge";
import type { WorkoutSession } from "./workout";
import type { WorkoutSplit } from "./WorkoutSplit";

const FROM = { id: "exdb_belt", name: "Belt Squat Machine" };
const TO = { id: "core_belt_squat", name: "Belt Squat" };

const strength = (exerciseName: string, exerciseId?: string) =>
  ({ id: exerciseName, type: "strength", orderIndex: 0, data: { exerciseName, ...(exerciseId ? { exerciseId } : {}), sets: [{ id: "s", setType: "normal", weight: 120, reps: 10, orderIndex: 0, completed: true }] } });

describe("merging a made exercise into a library one", () => {
  it("moves its blocks (by id, or by name when a block has none) and keeps the sets", () => {
    const s = { id: "w", startedAtMs: 0, blocks: [strength("Belt Squat Machine", "exdb_belt"), strength("belt squat machine"), strength("Squat", "core_squat")] } as WorkoutSession;
    const out = mergeExerciseInSession(s, FROM, TO)!;
    expect(out.blocks.map((b) => [(b.data as { exerciseId?: string }).exerciseId, (b.data as { exerciseName: string }).exerciseName])).toEqual([
      ["core_belt_squat", "Belt Squat"], ["core_belt_squat", "Belt Squat"], ["core_squat", "Squat"],
    ]);
    expect((out.blocks[0]!.data as { sets: unknown[] }).sets).toHaveLength(1);
    expect(mergeExerciseInSession({ ...s, blocks: [strength("Squat", "core_squat")] }, FROM, TO)).toBeNull();
  });

  it("moves split days and lift goals, and leaves everything else alone", () => {
    const split = { id: "sp", name: "S", archived: false, createdAtMs: 0, updatedAtMs: 0, days: [{ id: "d", orderIndex: 0, blocks: [
      { type: "strength", id: "p1", orderIndex: 0, exerciseName: "Belt Squat Machine", exerciseId: "exdb_belt" },
      { type: "cardio", id: "p2", orderIndex: 1, activityName: "Belt Squat Machine" },
    ] }] } as unknown as WorkoutSplit;
    const moved = mergeExerciseInSplit(split, FROM, TO)!;
    expect(moved.days[0]!.blocks.map((b) => (b.type === "strength" ? b.exerciseId : b.type))).toEqual(["core_belt_squat", "cardio"]);
    expect(mergeExerciseInGoal({ type: "lift", exerciseId: "exdb_belt", exerciseName: "Belt Squat Machine", weightKg: 150, reps: 5 }, FROM, TO))
      .toEqual({ type: "lift", exerciseId: "core_belt_squat", exerciseName: "Belt Squat", weightKg: 150, reps: 5 });
    expect(mergeExerciseInGoal({ type: "count", metric: "sessions", target: 10, startIso: "2026-11-01" }, FROM, TO)).toBeNull();
  });
});
