import { describe, expect, it } from "vitest";
import { getMuscleGroupInsights } from "./getMuscleGroupInsights";
import { basicAnalytics } from "../../progression/analytics/basicAnalytics";
import { createSession, addExercise, addSet, finishSession } from "../../domain/workout";
import type { WorkoutSession } from "../../domain/workout";
import type { Exercise, MuscleGroup } from "../../domain/exercise";
import type { ProgressionDeps } from "./deps";
import type { MuscleGroupInsightAlgorithm, MuscleGroupInsightInput } from "../../domain/muscleGroupInsight";

// A minimal stand-in for the pluggable §5-option-B algorithm — this file tests
// getMuscleGroupInsights' own job (fetching sessions, resolving muscle tags,
// building weekly volume + per-exercise trend series, delegating the rest),
// not the correlation math itself, which now lives in the built-in
// `learnedMuscleGroupInsight` algorithm (apps/clients/logit-frontend) and is
// tested there directly.
function stubAlgorithm(analyze?: MuscleGroupInsightAlgorithm["analyze"]): MuscleGroupInsightAlgorithm {
  return {
    id: "stub",
    name: "Stub",
    description: "test double",
    defaultState: null,
    analyze:
      analyze ??
      (async () => ({
        nextState: null,
        reasoning: { inputs: {}, computed: {}, confidence: "low", verdict: "stub" },
      })),
  };
}

type ExerciseDef = { primaryMuscles: MuscleGroup[]; secondaryMuscles?: MuscleGroup[] };

const DAY = 86_400_000;
const WEEK = 7 * DAY;

// Anchored to *now* (not a fixed date) so recent sessions stay within
// classifyTrend's detraining window regardless of when the suite runs.
function weeksAgoTimestamp(weeksAgo: number): number {
  const now = Date.now();
  const daysSinceMonday = (new Date(now).getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  const thisMonday = now - daysSinceMonday * DAY;
  return thisMonday - weeksAgo * WEEK + DAY; // Tuesday of that week
}

function sessionAtWeek(
  weeksAgo: number,
  exercises: { name: string; weight: number; reps: number }[],
): WorkoutSession {
  const endedAtMs = weeksAgoTimestamp(weeksAgo);
  let s = createSession(endedAtMs - 3_600_000);
  for (const ex of exercises) {
    s = addExercise(s, { exerciseName: ex.name });
    const blockId = s.blocks[s.blocks.length - 1]!.id;
    s = addSet(s, blockId, { weight: ex.weight, reps: ex.reps, setType: "normal" });
  }
  return finishSession(s, endedAtMs);
}

function deps(
  sessions: WorkoutSession[],
  exerciseDefs: Record<string, ExerciseDef>,
  analyze?: MuscleGroupInsightAlgorithm["analyze"],
): Pick<
  ProgressionDeps,
  "workoutRepo" | "exerciseRepo" | "progressionRepo" | "analyticsRegistry" | "muscleGroupInsightAlgorithmRegistry"
> {
  return {
    workoutRepo: { listAllSessions: async () => sessions, listRecentSessions: async () => sessions },
    exerciseRepo: {
      getById: async () => null,
      getByName: async (name: string) => {
        const def = exerciseDefs[name.toLowerCase()];
        if (!def) return null;
        return {
          id: name.toLowerCase(),
          name,
          primaryMuscles: def.primaryMuscles,
          secondaryMuscles: def.secondaryMuscles ?? [],
        } as Exercise;
      },
    },
    progressionRepo: { getAnalyticsConfig: async () => null, getMuscleGroupInsightConfig: async () => null },
    analyticsRegistry: { get: async (id: string) => (id === "basic-analytics" ? basicAnalytics : null) },
    muscleGroupInsightAlgorithmRegistry: { get: async () => stubAlgorithm(analyze) },
  } as unknown as Pick<
    ProgressionDeps,
    "workoutRepo" | "exerciseRepo" | "progressionRepo" | "analyticsRegistry" | "muscleGroupInsightAlgorithmRegistry"
  >;
}

describe("getMuscleGroupInsights", () => {
  it("aggregates weekly volume for a primary-tagged exercise and reports frequency", async () => {
    const sessions = [2, 1, 0].map((w) => sessionAtWeek(w, [{ name: "Bench", weight: 100, reps: 5 }]));
    const d = deps(sessions, { bench: { primaryMuscles: ["chest"] } });

    const { insights } = await getMuscleGroupInsights(d);
    const chest = insights.find((i) => i.muscleGroup === "chest");
    expect(chest).toBeDefined();
    expect(chest!.weeksWithData).toBe(3);
    expect(chest!.avgWeeklySets).toBe(1); // one working set per session, one session per week
    expect(chest!.avgWeeklyFrequency).toBe(1);
    expect(chest!.contributingExercises).toEqual([{ exerciseId: undefined, exerciseName: "Bench", status: expect.any(String) }]);
  });

  it("weights a secondary-muscle contribution at 40%, and doesn't attribute it to a status", async () => {
    const sessions = [2, 1, 0].map((w) => sessionAtWeek(w, [{ name: "Bench", weight: 100, reps: 5 }]));
    const d = deps(sessions, { bench: { primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] } });

    const { insights } = await getMuscleGroupInsights(d);
    const triceps = insights.find((i) => i.muscleGroup === "triceps");
    // Triceps has volume (secondary credit) but no exercise primarily tagged to it —
    // excluded from insights entirely rather than guessing a status for it.
    expect(triceps).toBeUndefined();
  });

  it("excludes secondary-only muscle groups but keeps their volume out of untagged share", async () => {
    const sessions = [1, 0].map((w) =>
      sessionAtWeek(w, [
        { name: "Bench", weight: 100, reps: 5 },
        { name: "Mystery Machine", weight: 50, reps: 10 }, // no exercise def registered
      ]),
    );
    const d = deps(sessions, { bench: { primaryMuscles: ["chest"] } });

    const { untaggedSetsShare } = await getMuscleGroupInsights(d);
    // 2 sessions × 1 set each from "Mystery Machine" (untagged) out of 4 total sets.
    expect(untaggedSetsShare).toBeCloseTo(0.5, 5);
  });

  it("group status is the worst-of its contributing exercises' statuses", async () => {
    // Bench: flat/plateaued-ish. Incline press: clearly declining across enough
    // sessions to read as regressing. Both tagged chest primary.
    const benchSessions = [4, 3, 2, 1, 0].map((w) =>
      sessionAtWeek(w, [{ name: "Bench", weight: 100, reps: 5 }]),
    );
    // w counts chronologically forward (4 weeks ago -> now) so the weight really
    // declines over time, not just as the weeksAgo number changes.
    const inclineSessions = [4, 3, 2, 1, 0].map((w, i) =>
      sessionAtWeek(w, [{ name: "Incline Press", weight: 100 - i * 5, reps: 5 }]),
    );
    const d = deps([...benchSessions, ...inclineSessions], {
      bench: { primaryMuscles: ["chest"] },
      "incline press": { primaryMuscles: ["chest"] },
    });

    const { insights } = await getMuscleGroupInsights(d);
    const chest = insights.find((i) => i.muscleGroup === "chest")!;
    expect(chest.contributingExercises).toHaveLength(2);
    expect(chest.status).toBe("regressing");
  });

  it("passes the group's weekly volume and per-exercise series to the configured algorithm", async () => {
    const sessions = [2, 1, 0].map((w) => sessionAtWeek(w, [{ name: "Bench", weight: 100, reps: 5 }]));
    let seenInput: MuscleGroupInsightInput | undefined;
    const d = deps(sessions, { bench: { primaryMuscles: ["chest"] } }, async (input) => {
      seenInput = input;
      return { nextState: null, reasoning: { inputs: {}, computed: {}, confidence: "low", verdict: "seen" } };
    });

    await getMuscleGroupInsights(d);
    expect(seenInput?.muscleGroup).toBe("chest");
    expect(seenInput?.weeks).toHaveLength(3);
    expect(seenInput?.contributingExercises).toHaveLength(1);
    expect(seenInput?.contributingExercises[0]?.exerciseName).toBe("Bench");
    expect(seenInput?.contributingExercises[0]?.seriesPoints.length).toBeGreaterThan(0);
  });

  it("threads the algorithm's volumeInsight and reasoning straight through to the result", async () => {
    const sessions = [2, 1, 0].map((w) => sessionAtWeek(w, [{ name: "Bench", weight: 100, reps: 5 }]));
    const canned = {
      volumeInsight: { direction: "higher" as const, thresholdSets: 3, improveRateAbove: 0.8, improveRateBelow: 0.2 },
      nextState: null,
      reasoning: { inputs: {}, computed: {}, confidence: "high" as const, verdict: "canned verdict" },
    };
    const d = deps(sessions, { bench: { primaryMuscles: ["chest"] } }, async () => canned);

    const { insights } = await getMuscleGroupInsights(d);
    const chest = insights.find((i) => i.muscleGroup === "chest")!;
    expect(chest.volumeInsight).toEqual(canned.volumeInsight);
    expect(chest.reasoning).toEqual(canned.reasoning);
  });

  it("falls back to a low-confidence reasoning when no algorithm is configured", async () => {
    const sessions = [2, 1, 0].map((w) => sessionAtWeek(w, [{ name: "Bench", weight: 100, reps: 5 }]));
    const d = deps(sessions, { bench: { primaryMuscles: ["chest"] } });
    d.muscleGroupInsightAlgorithmRegistry = { list: async () => [], get: async () => null };

    const { insights } = await getMuscleGroupInsights(d);
    const chest = insights.find((i) => i.muscleGroup === "chest")!;
    expect(chest.volumeInsight).toBeUndefined();
    expect(chest.reasoning.confidence).toBe("low");
  });
});
