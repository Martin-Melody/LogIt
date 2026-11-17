import { describe, expect, it } from "vitest";
import {
  getExerciseProgressionSettings,
  listExerciseProgressionSettings,
  resolveAlgorithmId,
  saveExerciseProgressionSettings,
} from "./exerciseProgressionSettings";
import { applySessionProgression, getSuggestion } from "./getSuggestion";
import type { ExerciseProgressionSettings, ExerciseProgressionState, ProgressionAlgorithm, ProgressionInput } from "../../domain/progression";
import type { ProgressionDeps } from "./deps";
import type { Goal } from "../../domain/goals";
import { liftGoalPace } from "../../domain/goals";

function memoryRepo(general: string | null) {
  const settings = new Map<string, ExerciseProgressionSettings>();
  const states = new Map<string, ExerciseProgressionState>();
  return {
    settings,
    states,
    getConfig: async () => (general ? { algorithmId: general } : null),
    getExerciseSettings: async (key: string) => settings.get(key) ?? null,
    listExerciseSettings: async () => [...settings.values()],
    saveExerciseSettings: async (s: ExerciseProgressionSettings) => void settings.set(s.key, s),
    getExerciseState: async (key: string) => states.get(key) ?? null,
    saveExerciseState: async (s: ExerciseProgressionState) => void states.set(s.key, s),
    listExerciseStates: async () => [...states.values()],
    getAlgorithmPreferences: async () => null,
  };
}

const seen: ProgressionInput[] = [];
function algo(id: string): ProgressionAlgorithm {
  return {
    id,
    name: id,
    description: "",
    defaultState: null,
    suggest: (input) => {
      seen.push(input);
      return { sets: [{ reps: 5, weight: 100 }], nextState: { by: id }, reasoning: { inputs: {}, computed: {}, confidence: "low", verdict: id, summary: [] } };
    },
  };
}

function deps(repo: ReturnType<typeof memoryRepo>, goals: Goal[] = []): ProgressionDeps {
  return {
    workoutRepo: { listRecentSessions: async () => [], listAllSessions: async () => [] },
    exerciseRepo: { getById: async () => null, getByName: async () => null },
    progressionRepo: repo,
    algorithmRegistry: { get: async (id: string) => (["general", "five31"].includes(id) ? algo(id) : null) },
    loadGoals: async () => goals,
  } as unknown as ProgressionDeps;
}

const BENCH = { name: "Bench press" };

describe("per-exercise progression settings", () => {
  it("saves, reads back and resets to a tombstone", async () => {
    const repo = memoryRepo("general");
    const d = deps(repo);
    await saveExerciseProgressionSettings(BENCH, { repRange: [8, 5], algorithmId: "five31" }, d);
    expect(await getExerciseProgressionSettings(BENCH, d)).toMatchObject({ repRange: [5, 8], algorithmId: "five31" });

    const reset = await saveExerciseProgressionSettings(BENCH, { repRange: undefined, algorithmId: undefined }, d);
    expect(reset?.deletedAtMs).toBeDefined();
    expect(await getExerciseProgressionSettings(BENCH, d)).toBeNull();
    expect(await listExerciseProgressionSettings(d)).toEqual([]);
    expect((await repo.listExerciseSettings()).length).toBe(1); // the tombstone, for sync
  });

  it("finds settings saved under the exercise's id from a block that only has its name", async () => {
    const repo = memoryRepo("general");
    const d = deps(repo);
    await saveExerciseProgressionSettings({ id: "ex_core_bench", name: "Bench Press" }, { repRange: [3, 5] }, d);
    const withLibrary = { ...d, exerciseRepo: { getById: async () => null, getByName: async () => ({ id: "ex_core_bench" }) } } as unknown as ProgressionDeps;
    expect((await getExerciseProgressionSettings({ name: "Bench Press" }, withLibrary))?.repRange).toEqual([3, 5]);
  });

  it("picks the exercise's own algorithm, the general one, or none", async () => {
    const repo = memoryRepo("general");
    const d = deps(repo);
    expect(await resolveAlgorithmId(BENCH, d)).toBe("general");
    await saveExerciseProgressionSettings(BENCH, { algorithmId: "five31" }, d);
    expect(await resolveAlgorithmId(BENCH, d)).toBe("five31");
    await saveExerciseProgressionSettings(BENCH, { algorithmId: "off" }, d);
    expect(await resolveAlgorithmId(BENCH, d)).toBeNull();
    expect(await resolveAlgorithmId(BENCH, deps(memoryRepo(null)))).toBeNull();
  });

  it("runs the exercise's own algorithm with its rep range, and saves state under it", async () => {
    const repo = memoryRepo("general");
    const d = deps(repo);
    await saveExerciseProgressionSettings(BENCH, { algorithmId: "five31", repRange: [3, 5] }, d);
    seen.length = 0;
    const out = await getSuggestion(BENCH, d);
    expect(out?.reasoning?.verdict).toBe("five31");
    expect(seen[0]!.repRange).toEqual([3, 5]);
    await applySessionProgression(BENCH, out!, d);
    expect(repo.states.get("bench press")?.algorithmId).toBe("five31");
  });

  it("falls back to the general algorithm when the exercise's one is gone", async () => {
    const repo = memoryRepo("general");
    const d = deps(repo);
    await saveExerciseProgressionSettings(BENCH, { algorithmId: "removed-plugin" }, d);
    expect((await getSuggestion(BENCH, d))?.reasoning?.verdict).toBe("general");
  });

  it("gives the algorithm the lift goal and says how it's going", async () => {
    const repo = memoryRepo("general");
    const goal: Goal = {
      id: "g1",
      target: { type: "lift", exerciseName: "Bench press", weightKg: 120, reps: 1 },
      deadlineIso: "2027-03-01",
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    const d = deps(repo, [goal]);
    await saveExerciseProgressionSettings(BENCH, { behindPace: "push" }, d);
    seen.length = 0;
    const out = await getSuggestion(BENCH, d);
    expect(seen[0]!.goal).toMatchObject({ weightKg: 120, reps: 1, behindPace: "push", pace: "unknown" });
    expect(out?.reasoning?.summary?.at(-1)).toMatch(/^Goal 120 × 1 by 1 Mar/);
  });
});

describe("lift goal pace", () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 10, 17);
  // One session a week, estimated 1RM rising about 1 kg a week from ~108 kg.
  const history = Array.from({ length: 8 }, (_, i) => ({
    sessionId: `s${i}`,
    performedAtMs: now - (8 - i) * 7 * DAY,
    sets: [{ id: `x${i}`, setType: "normal" as const, weight: 85 + i, reps: 8, orderIndex: 0 }],
  }));

  it("is on pace when the trend gets there by the deadline", () => {
    const pace = liftGoalPace(history, { weightKg: 120, reps: 1, deadlineIso: "2027-03-01" }, now);
    expect(pace.pace).toBe("on_pace");
    expect(pace.ratePerWeekKg).toBeGreaterThan(pace.neededPerWeekKg!);
  });

  it("is behind when it doesn't", () => {
    expect(liftGoalPace(history, { weightKg: 140, reps: 1, deadlineIso: "2026-12-15" }, now).pace).toBe("behind");
  });

  it("can't say without a deadline", () => {
    expect(liftGoalPace(history, { weightKg: 140, reps: 1 }, now).pace).toBe("unknown");
  });
});
