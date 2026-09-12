import { describe, expect, it } from "vitest";
import { getExerciseProgressStory } from "./getExerciseProgressStory";
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

// Same, but with a filler exercise logged first — so `name` lands at sessionPosition 1
// instead of 0, the way it would after "always do this last in the session".
function sessionWithFillerFirst(name: string, weight: number, reps: number, endedAtMs: number): WorkoutSession {
  let s = createSession(endedAtMs - 3_600_000);
  s = addExercise(s, { exerciseName: "Filler" });
  s = addSet(s, s.blocks[0]!.id, { weight: 50, reps: 5, setType: "normal" });
  s = addExercise(s, { exerciseName: name });
  s = addSet(s, s.blocks[1]!.id, { weight, reps, setType: "normal" });
  return finishSession(s, endedAtMs);
}

function deps(history: WorkoutSession[]): ProgressionDeps {
  return {
    workoutRepo: {
      listAllSessions: async () => history,
      listRecentSessions: async () => history,
    },
    exerciseRepo: { getById: async () => null, getByName: async () => null },
    progressionRepo: {
      getAnalyticsConfig: async () => null,
      getConfig: async () => null, // → getSuggestion returns null, story still builds
    },
    analyticsRegistry: { get: async (id: string) => (id === "basic-analytics" ? basicAnalytics : null) },
  } as unknown as ProgressionDeps;
}

const DAY = 86_400_000;
const now = Date.now();

describe("getExerciseProgressStory", () => {
  it("builds a progressing story with a sparkline and headline", async () => {
    const history = [
      session("Bench", 90, 5, now - 14 * DAY),
      session("Bench", 95, 5, now - 7 * DAY),
      session("Bench", 100, 5, now - 1 * DAY),
    ];
    const story = await getExerciseProgressStory({ name: "Bench" }, deps(history));
    expect(story).not.toBeNull();
    expect(story!.status).toBe("progressing");
    expect(story!.spark.length).toBe(3);
    expect(story!.headline.value.length).toBeGreaterThan(0);
    expect(story!.lastPr).toBeDefined();
    expect(story!.trendReasoning.verdict).toBe("progressing");
  });

  it("returns null when there is no history", async () => {
    expect(await getExerciseProgressStory({ name: "Bench" }, deps([]))).toBeNull();
  });

  it("flags a plateau", async () => {
    const history = [
      session("Row", 60, 8, now - 28 * DAY),
      session("Row", 60, 8, now - 21 * DAY),
      session("Row", 60, 8, now - 14 * DAY),
      session("Row", 60, 8, now - 7 * DAY),
      session("Row", 60, 8, now - 1 * DAY),
    ];
    const story = await getExerciseProgressStory({ name: "Row" }, deps(history));
    expect(story!.status).toBe("plateaued");
    expect(story!.statusDetail).toMatch(/No new best/);
  });

  it("doesn't call it 'regressing' when a lower recent reading is fully explained by always being done later in the session", async () => {
    // True capability is flat at 100 (reps=1 so e1RM === weight). The first 4 sessions
    // are done fresh (first exercise) and read 100; the switch to "always after a filler
    // exercise" for the last 4 reads a consistent ~10% lower — same pattern
    // `computeFatigueScore`/`calibrateSensitivity` already account for on the suggestion
    // side (linearProgression.ts). Reading the raw numbers alone looks like a decline.
    const history = [
      session("Bench", 100, 1, now - 28 * DAY),
      session("Bench", 100, 1, now - 24 * DAY),
      session("Bench", 100, 1, now - 20 * DAY),
      session("Bench", 100, 1, now - 16 * DAY),
      sessionWithFillerFirst("Bench", 90, 1, now - 12 * DAY),
      sessionWithFillerFirst("Bench", 90, 1, now - 8 * DAY),
      sessionWithFillerFirst("Bench", 90, 1, now - 4 * DAY),
      sessionWithFillerFirst("Bench", 90, 1, now - 1 * DAY),
    ];
    const story = await getExerciseProgressStory({ name: "Bench" }, deps(history));

    expect(story!.trendReasoning.inputs.fatigueCalibrated).toBe(true);
    expect(story!.status).not.toBe("regressing");
    // The raw (unadjusted) reading of the same series would call it a real decline —
    // confirms the adjustment is doing something, not a no-op.
    expect(story!.trendReasoning.computed.rawSlopePctPerSession).toBeLessThan(-1);
  });
});
