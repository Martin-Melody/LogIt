import { describe, expect, it } from "vitest";
import { getAllExerciseProgressStories } from "./getAllExerciseProgressStories";
import { basicAnalytics } from "../../progression/analytics/basicAnalytics";
import { createSession, addExercise, addSet, finishSession } from "../../domain/workout";
import type { WorkoutSession } from "../../domain/workout";
import type { ProgressionDeps } from "./deps";

function session(name: string, weight: number, reps: number, endedAtMs: number): WorkoutSession {
  let s = createSession(endedAtMs - 3_600_000);
  s = addExercise(s, { exerciseName: name });
  s = addSet(s, s.blocks[0]!.id, { weight, reps, setType: "normal" });
  return finishSession(s, endedAtMs);
}

function deps(history: WorkoutSession[]): ProgressionDeps {
  return {
    workoutRepo: { listAllSessions: async () => history, listRecentSessions: async () => history },
    exerciseRepo: { getById: async () => null, getByName: async () => null },
    progressionRepo: { getAnalyticsConfig: async () => null, getConfig: async () => null },
    analyticsRegistry: { get: async (id: string) => (id === "basic-analytics" ? basicAnalytics : null) },
    trainingBlockTagRepo: { listForExercise: async () => [] },
  } as unknown as ProgressionDeps;
}

const DAY = 86_400_000;
const now = Date.now();

describe("getAllExerciseProgressStories", () => {
  it("returns one story per distinct exercise trained", async () => {
    const history = [
      session("Bench", 100, 5, now - 14 * DAY),
      session("Bench", 105, 5, now - 7 * DAY),
      session("Squat", 120, 5, now - 7 * DAY),
    ];
    const stories = await getAllExerciseProgressStories(deps(history));
    expect(stories.map((s) => s.exerciseName).sort()).toEqual(["Bench", "Squat"]);
  });

  it("returns no stories with no history", async () => {
    expect(await getAllExerciseProgressStories(deps([]))).toEqual([]);
  });

  it("doesn't duplicate an exercise trained across many sessions", async () => {
    const history = [1, 2, 3].map((n) => session("Bench", 100 + n, 5, now - (4 - n) * DAY));
    const stories = await getAllExerciseProgressStories(deps(history));
    expect(stories).toHaveLength(1);
  });
});
