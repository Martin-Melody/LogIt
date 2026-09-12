import { describe, expect, it } from "vitest";
import { getExerciseStats } from "./getExerciseStats";
import { createSession, addExercise, addSet, finishSession } from "../../domain/workout";
import type { WorkoutSession } from "../../domain/workout";
import type { ProgressionDeps } from "./deps";

function session(weight: number, reps: number, endedAtMs: number): WorkoutSession {
  let s = createSession(endedAtMs - 3_600_000);
  s = addExercise(s, { exerciseName: "Bench" });
  s = addSet(s, s.blocks[0]!.id, { weight, reps, setType: "normal" });
  return finishSession(s, endedAtMs);
}

function deps(history: WorkoutSession[]): Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo"> {
  return {
    workoutRepo: { listAllSessions: async () => history, listRecentSessions: async () => history },
    exerciseRepo: { getById: async () => null, getByName: async () => null },
  };
}

describe("getExerciseStats", () => {
  it("returns nulls/zeros with no history", async () => {
    const stats = await getExerciseStats({ name: "Bench" }, deps([]));
    expect(stats).toEqual({ bestSet: null, bestEstimated1RM: null, totalSessions: 0, lastPerformedMs: null });
  });

  it("picks the heaviest working set as bestSet, and the highest estimated 1RM independently", async () => {
    const history = [
      session(100, 5, 1000), // e1RM ≈ 116.7
      session(120, 1, 2000), // heaviest set, e1RM = 120 (reps=1 case)
      session(90, 12, 3000), // e1RM = 90*(1+12/30) = 126 — highest e1RM despite lighter weight
    ];
    const stats = await getExerciseStats({ name: "Bench" }, deps(history));
    expect(stats.bestSet).toEqual({ weight: 120, reps: 1 });
    expect(stats.bestEstimated1RM).toBeCloseTo(126, 1);
    expect(stats.totalSessions).toBe(3);
    expect(stats.lastPerformedMs).toBe(3000);
  });
});
