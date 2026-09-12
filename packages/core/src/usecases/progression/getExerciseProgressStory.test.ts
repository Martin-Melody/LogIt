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

function deps(history: WorkoutSession[], tags: unknown[] = []): ProgressionDeps {
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
    trainingBlockTagRepo: { listForExercise: async () => tags },
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

  describe("rep-range trial confound", () => {
    // A fake linear-progression algorithm that just echoes the saved state back
    // unchanged as nextState — lets the test control repRangeLadder directly
    // without going through the real trial state machine.
    function depsWithTrial(trialState: unknown, history: WorkoutSession[]): ProgressionDeps {
      return {
        workoutRepo: { listAllSessions: async () => history, listRecentSessions: async () => history },
        exerciseRepo: { getById: async () => null, getByName: async () => null },
        progressionRepo: {
          getAnalyticsConfig: async () => null,
          getConfig: async () => ({ algorithmId: "linear-progression" }),
          getExerciseState: async () => ({
            key: "bench",
            exerciseName: "Bench",
            algorithmId: "linear-progression",
            state: trialState,
            updatedAtMs: 0,
          }),
          getAlgorithmPreferences: async () => null,
          listExerciseStates: async () => [],
        },
        algorithmRegistry: {
          get: async () => ({
            id: "linear-progression",
            name: "Linear",
            description: "test double",
            defaultState: null,
            suggest: (input: { state: unknown }) => ({ sets: [], nextState: input.state }),
          }),
        },
        analyticsRegistry: { get: async (id: string) => (id === "basic-analytics" ? basicAnalytics : null) },
        trainingBlockTagRepo: { listForExercise: async () => [] },
      } as unknown as ProgressionDeps;
    }

    it("doesn't call it 'regressing' when a permanent rep-range switch level-shifts e1RM downward", async () => {
      const startedAtMs = now - 10 * DAY;
      const history = [
        session("Bench", 100, 1, now - 40 * DAY),
        session("Bench", 102, 1, now - 33 * DAY),
        session("Bench", 104, 1, now - 26 * DAY),
        session("Bench", 106, 1, now - 19 * DAY),
        // Switched to a higher rep range at startedAtMs — the achievable load (and
        // so e1RM) drops, then holds flat/rising under the new regime.
        session("Bench", 80, 1, startedAtMs),
        session("Bench", 80, 1, now - 7 * DAY),
        session("Bench", 81, 1, now - 4 * DAY),
        session("Bench", 82, 1, now - 1 * DAY),
      ];
      const trialState = {
        repRange: [10, 15],
        repRangeLadder: [
          {
            trialRepRange: [10, 15],
            baselineRepRange: [5, 8],
            startedAtMs,
            status: "concluded",
            result: { trialSlopePctPerSession: 0.8, baselineSlopePctPerSession: 0.4, switched: true, concludedAtMs: now - 7 * DAY },
          },
        ],
      };

      const withFix = await getExerciseProgressStory({ name: "Bench" }, depsWithTrial(trialState, history));
      const withoutFix = await getExerciseProgressStory({ name: "Bench" }, deps(history));

      // Same raw series, naively read, falls as a straight line across the switch.
      expect(withoutFix!.status).toBe("regressing");
      expect(withFix!.status).not.toBe("regressing");
      expect(withFix!.trendReasoning.inputs.excludedForRegimeChange).toBe(4);
    });

    it("excludes the in-progress trial window (not yet concluded) rather than trusting inconclusive data", async () => {
      const startedAtMs = now - 10 * DAY;
      const history = [
        session("Bench", 100, 1, now - 40 * DAY),
        session("Bench", 102, 1, now - 33 * DAY),
        session("Bench", 104, 1, now - 26 * DAY),
        session("Bench", 106, 1, now - 19 * DAY),
        // Mid-trial reading, sharply lower — shouldn't be trusted yet.
        session("Bench", 60, 1, startedAtMs),
      ];
      const trialState = {
        repRange: [10, 15],
        repRangeLadder: [{ trialRepRange: [10, 15], baselineRepRange: [5, 8], startedAtMs, status: "active" }],
      };

      const story = await getExerciseProgressStory({ name: "Bench" }, depsWithTrial(trialState, history));
      expect(story!.trendReasoning.inputs.excludedForRegimeChange).toBe(1);
      expect(story!.status).not.toBe("regressing");
    });

    it("excludes only the abandoned trial window when the trial concluded without switching", async () => {
      const startedAtMs = now - 20 * DAY;
      const concludedAtMs = now - 10 * DAY;
      const history = [
        session("Bench", 100, 1, now - 40 * DAY),
        session("Bench", 102, 1, now - 33 * DAY),
        session("Bench", 104, 1, now - 26 * DAY),
        // Trial window — abandoned, shouldn't count.
        session("Bench", 60, 1, startedAtMs + 1 * DAY),
        session("Bench", 61, 1, startedAtMs + 4 * DAY),
        // Reverted back to baseline, continuing the earlier rise.
        session("Bench", 106, 1, concludedAtMs + 1 * DAY),
        session("Bench", 108, 1, now - 1 * DAY),
      ];
      const trialState = {
        repRange: [5, 8],
        repRangeLadder: [
          {
            trialRepRange: [10, 15],
            baselineRepRange: [5, 8],
            startedAtMs,
            status: "concluded",
            result: { trialSlopePctPerSession: -0.2, baselineSlopePctPerSession: 0.6, switched: false, concludedAtMs },
          },
        ],
      };

      const story = await getExerciseProgressStory({ name: "Bench" }, depsWithTrial(trialState, history));
      expect(story!.trendReasoning.inputs.excludedForRegimeChange).toBe(2);
      expect(story!.status).toBe("progressing");
    });
  });

  describe("tag training blocks (§10.3.3)", () => {
    it("excludes readings inside a tagged window from the headline trend", async () => {
      const tagStart = now - 20 * DAY;
      const tagEnd = now - 10 * DAY;
      const history = [
        session("Bench", 100, 1, now - 40 * DAY),
        session("Bench", 102, 1, now - 33 * DAY),
        session("Bench", 104, 1, now - 26 * DAY),
        session("Bench", 106, 1, now - 23 * DAY),
        // Tagged window — an injury layoff with two bad readings that shouldn't count.
        session("Bench", 60, 1, tagStart + 1 * DAY),
        session("Bench", 61, 1, tagStart + 5 * DAY),
        // Back to normal, resuming near the pre-injury level (below its max, so this
        // isn't a new PR masking the slope via the "PR recently" shortcut).
        session("Bench", 104, 1, tagEnd + 1 * DAY),
        session("Bench", 105, 1, now - 1 * DAY),
      ];
      const tags = [{ startMs: tagStart, endMs: tagEnd, reason: "injury" }];

      const withoutTag = await getExerciseProgressStory({ name: "Bench" }, deps(history));
      const withTag = await getExerciseProgressStory({ name: "Bench" }, deps(history, tags));

      expect(withoutTag!.status).toBe("regressing");
      expect(withTag!.status).not.toBe("regressing");
      expect(withTag!.trendReasoning.inputs.excludedForTaggedBlock).toBe(2);
    });

    it("treats an open-ended tag (no endMs) as still in effect through today", async () => {
      const tagStart = now - 15 * DAY;
      const history = [
        session("Bench", 100, 1, now - 40 * DAY),
        session("Bench", 102, 1, now - 33 * DAY),
        session("Bench", 104, 1, now - 26 * DAY),
        session("Bench", 60, 1, tagStart + 1 * DAY),
        session("Bench", 58, 1, now - 1 * DAY),
      ];
      const tags = [{ startMs: tagStart, reason: "injury" }];

      const story = await getExerciseProgressStory({ name: "Bench" }, deps(history, tags));
      expect(story!.trendReasoning.inputs.excludedForTaggedBlock).toBe(2);
    });

    it("doesn't add excludedForTaggedBlock when there are no tags", async () => {
      const history = [session("Bench", 100, 1, now - 10 * DAY), session("Bench", 105, 1, now - 1 * DAY)];
      const story = await getExerciseProgressStory({ name: "Bench" }, deps(history));
      expect(story!.trendReasoning.inputs.excludedForTaggedBlock).toBeUndefined();
    });
  });

  describe("plateau-diagnosis orchestration (§10.3.2)", () => {
    function depsWithLadder(ladder: unknown, history: WorkoutSession[]): ProgressionDeps {
      return {
        workoutRepo: { listAllSessions: async () => history, listRecentSessions: async () => history },
        exerciseRepo: {
          getById: async () => null,
          getByName: async (name: string) =>
            name === "Bench" ? { id: "bench", name, primaryMuscles: ["chest"], secondaryMuscles: [] } : null,
        },
        progressionRepo: {
          getAnalyticsConfig: async () => null,
          getConfig: async () => ({ algorithmId: "linear-progression" }),
          getExerciseState: async () => ({
            key: "bench",
            exerciseName: "Bench",
            algorithmId: "linear-progression",
            state: { repRange: [5, 8], repRangeLadder: ladder },
            updatedAtMs: 0,
          }),
          getAlgorithmPreferences: async () => null,
          listExerciseStates: async () => [],
        },
        algorithmRegistry: {
          get: async () => ({
            id: "linear-progression",
            name: "Linear",
            description: "test double",
            defaultState: null,
            suggest: (input: { state: unknown }) => ({ sets: [], nextState: input.state }),
          }),
        },
        analyticsRegistry: { get: async (id: string) => (id === "basic-analytics" ? basicAnalytics : null) },
        trainingBlockTagRepo: { listForExercise: async () => [] },
      } as unknown as ProgressionDeps;
    }

    const rejectedRung = (trialRepRange: [number, number]) => ({
      trialRepRange,
      baselineRepRange: [5, 8],
      startedAtMs: 0,
      status: "concluded",
      result: { trialSlopePctPerSession: 0, baselineSlopePctPerSession: 0, switched: false, concludedAtMs: 0 },
    });

    const history = Array.from({ length: 8 }, (_, i) => session("Bench", 100 + i, 1, now - (8 - i) * DAY));

    it("surfaces next steps once the rep-range ladder is exhausted with no win", async () => {
      const ladder = [rejectedRung([8, 15]), rejectedRung([15, 22]), rejectedRung([22, 29])];
      const story = await getExerciseProgressStory({ name: "Bench" }, depsWithLadder(ladder, history));
      expect(story!.plateauNextSteps).toEqual({ muscleGroup: "chest" });
    });

    it("stays undefined while the ladder still has rungs left to try", async () => {
      const ladder = [rejectedRung([8, 15])]; // only 1 of 3
      const story = await getExerciseProgressStory({ name: "Bench" }, depsWithLadder(ladder, history));
      expect(story!.plateauNextSteps).toBeUndefined();
    });

    it("stays undefined when the ladder ended in a win, not exhaustion", async () => {
      const ladder = [
        rejectedRung([8, 15]),
        { ...rejectedRung([15, 22]), result: { ...rejectedRung([15, 22]).result, switched: true } },
      ];
      const story = await getExerciseProgressStory({ name: "Bench" }, depsWithLadder(ladder, history));
      expect(story!.plateauNextSteps).toBeUndefined();
    });

    it("stays undefined when there's no ladder at all", async () => {
      const story = await getExerciseProgressStory({ name: "Bench" }, depsWithLadder(undefined, history));
      expect(story!.plateauNextSteps).toBeUndefined();
    });
  });
});
