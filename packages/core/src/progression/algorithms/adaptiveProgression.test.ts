import { describe, expect, it } from "vitest";
import { adaptiveProgression, isCompound, setToSetDrop, strengthEstimate } from "./adaptiveProgression";
import type { ExerciseHistoryEntry, PrecedingExercise, ProgressionInput } from "../../domain/progression";
import type { SetEntry } from "../../domain/workout";

const DAY = 86_400_000;
const NOW = Date.now();
let id = 0;

function sets(...pairs: [number, number][]): SetEntry[] {
  return pairs.map(([weight, reps], i) => ({ id: `s${++id}`, setType: "normal", weight, reps, orderIndex: i }));
}

function entry(daysAgo: number, pairs: [number, number][], extra: Partial<ExerciseHistoryEntry> = {}): ExerciseHistoryEntry {
  return { sessionId: `sess${++id}`, performedAtMs: NOW - daysAgo * DAY, sets: sets(...pairs), ...extra };
}

const BENCH = { name: "Bench press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"] } as ProgressionInput["exercise"];
const CURL = { name: "Curl", primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"] } as ProgressionInput["exercise"];

function input(overrides: Partial<ProgressionInput>): ProgressionInput {
  return { exercise: BENCH, history: [], state: null, userPreferences: null, ...overrides };
}

describe("LogIt Adaptive", () => {
  it("plans every set from the strength estimate, not from last session's light sets", async () => {
    // Martin's example: 7 × 95, 9 × 68, 6 × 60.
    const out = await adaptiveProgression.suggest(input({ history: [entry(3, [[95, 7], [68, 9], [60, 6]])] }));
    expect(out.sets.map((s) => [s.weight, s.reps])).toEqual([[95, 7], [95, 6], [95, 5]]);
    expect(out.change?.text).toBe("Same weight");
    expect(out.reasoning?.summary?.join(" ")).toMatch(/68 kg and 60 kg sets were well under/);
  });

  it("goes up when you beat the planned reps", async () => {
    const out = await adaptiveProgression.suggest(input({ history: [entry(2, [[95, 9], [95, 8], [95, 7]]), entry(6, [[95, 7], [95, 6], [95, 5]])] }));
    expect(out.sets[0]!.weight).toBe(100); // e1RM 123.5 → 7 reps at ≈ 100
    expect(out.change).toMatchObject({ kind: "increase", text: "+5 kg" });
  });

  it("counts the reps you said were left, so doing the plan with reps to spare moves it on", async () => {
    const easy = entry(2, [[12.5, 7], [12.5, 6], [12.5, 5]]);
    easy.sets.forEach((x) => (x.rpe = 8)); // "2 left" on every set
    const est = strengthEstimate([easy], NOW);
    expect(est?.kg).toBeCloseTo(12.5 * (1 + 9 / 30), 5);
    expect(est?.from).toMatchObject({ reps: 7, left: 2 });
    const out = await adaptiveProgression.suggest(input({ history: [easy], userPreferences: { increment: 2.5 } }));
    const before = await adaptiveProgression.suggest(input({ history: [entry(2, [[12.5, 7], [12.5, 6], [12.5, 5]])], userPreferences: { increment: 2.5 } }));
    expect(out.sets[0]!.weight * (1 + out.sets[0]!.reps / 30)).toBeGreaterThan(before.sets[0]!.weight * (1 + before.sets[0]!.reps / 30));
    expect(out.reasoning?.summary?.join(" ")).toMatch(/12\.5 × 7 with 2 left/);
    const failed = entry(2, [[12.5, 7]]);
    failed.sets[0]!.rpe = 10; // nothing left: no credit
    expect(strengthEstimate([failed], NOW)?.kg).toBeCloseTo(12.5 * (1 + 7 / 30), 5);
  });

  it("with light dumbbells (12.5 → 15 is a 20% jump) the reps keep climbing until the next weight fits", async () => {
    const top = (pairs: [number, number][]) => { const e = entry(2, pairs); e.sets.forEach((x) => (x.rpe = 8)); return e; };
    const stuck = await adaptiveProgression.suggest(input({ history: [top([[12.5, 8], [12.5, 7], [12.5, 6]])] }));
    expect(stuck.sets[0]).toMatchObject({ weight: 12.5 });
    expect(stuck.sets[0]!.reps).toBeGreaterThan(8); // a couple over the 5–8 range, not stuck at 8
    const next = await adaptiveProgression.suggest(input({ history: [top([[12.5, 10], [12.5, 9], [12.5, 8]])] }));
    expect(next.sets[0]!.weight).toBe(15);
    expect(next.sets[0]!.reps).toBeGreaterThanOrEqual(5); // never a weight it can't do the range's fewest with
  });

  it("doesn't let one off day drag the estimate down", () => {
    const est = strengthEstimate([entry(1, [[80, 5]]), entry(4, [[95, 7]]), entry(8, [[92.5, 7]])], NOW);
    expect(est?.from).toMatchObject({ weight: 95, reps: 7 });
  });

  it("takes the estimate 5% lower after three weeks off", () => {
    const est = strengthEstimate([entry(30, [[95, 7]])], NOW);
    expect(est?.layoff).toBe(true);
    expect(est?.kg).toBeCloseTo(95 * (1 + 7 / 30) * 0.95, 5);
  });

  it("uses the isolation range for single-muscle lifts and leaves reps in the tank when asked", async () => {
    expect(isCompound(BENCH)).toBe(true);
    expect(isCompound(CURL)).toBe(false);
    const out = await adaptiveProgression.suggest(
      input({ exercise: CURL, history: [entry(3, [[15, 12], [15, 11], [15, 10]])], userPreferences: { repsInReserve: 2 } }),
    );
    expect(out.sets[0]!.reps).toBe(10); // 8–12, 3 sets, dropping 1 a set
    expect(out.reasoning?.summary?.join(" ")).toMatch(/8–12 reps with 2 reps left in the tank/);
  });

  it("follows the split day's reps and sets", async () => {
    const out = await adaptiveProgression.suggest(
      input({ history: [entry(3, [[100, 5], [100, 5]])], plannedTargets: { reps: 5, sets: 4 } }),
    );
    expect(out.sets).toHaveLength(4);
    expect(out.sets.every((s) => s.reps === 5)).toBe(true);
  });

  it("learns how many reps you lose set to set", () => {
    const history = [entry(2, [[100, 8], [100, 6], [100, 4]]), entry(5, [[100, 8], [100, 6], [100, 4]])];
    expect(setToSetDrop(history)).toEqual({ drop: 2, samples: 4, learned: true });
    expect(setToSetDrop(history.slice(0, 1)).learned).toBe(false);
  });

  it("drops a set's weight rather than planning it under the range", async () => {
    const history = [entry(2, [[100, 8], [100, 6], [100, 4]]), entry(5, [[100, 8], [100, 6], [100, 4]])];
    const out = await adaptiveProgression.suggest(input({ history, plannedTargets: { sets: 4 } }));
    const reps = out.sets.map((s) => s.reps as number);
    expect(Math.min(...reps)).toBeGreaterThanOrEqual(5);
    expect(out.sets[3]!.weight).toBeLessThan(out.sets[0]!.weight);
  });

  it("only trims for earlier exercises once it knows your fatigue pattern", async () => {
    const press: PrecedingExercise = { name: "Incline press", primaryMuscles: ["chest", "shoulders"], secondaryMuscles: ["triceps"], completedSets: 3, effortFactor: 1 };
    const fresh = (d: number) => entry(d, [[95, 7], [95, 6], [95, 5]], { sessionPosition: 0 });
    const later = (d: number) => entry(d, [[95, 6], [95, 5], [95, 4]], { sessionPosition: 2 });

    const unknown = await adaptiveProgression.suggest(input({ history: [fresh(2)], sessionContext: { precedingExercises: [press] } }));
    expect(unknown.reasoning?.computed.fatigueDiscountPct).toBe(0);

    const known = await adaptiveProgression.suggest(
      input({ history: [fresh(2), later(5), fresh(9), later(12), fresh(16), later(19)], sessionContext: { precedingExercises: [press] } }),
    );
    expect(known.reasoning?.computed.fatigueDiscountPct).toBeGreaterThan(0);
    expect(known.sets[0]!.weight).toBeLessThan(95);
  });

  it("asks for a starting weight the first time", async () => {
    const out = await adaptiveProgression.suggest(input({ history: [] }));
    expect(out.change).toMatchObject({ kind: "first", detail: "Pick a weight you can do 5–8 reps with." });
  });

  it("hands bodyweight exercises to Linear Progression", async () => {
    const out = await adaptiveProgression.suggest(
      input({ exercise: { name: "Pull-up", primaryMuscles: ["back"], exerciseType: "bodyweight" }, history: [entry(3, [[0, 8], [0, 7]])] }),
    );
    expect(out.reasoning?.summary?.[0]).toMatch(/simple way/);
    expect((out.nextState as { linear?: unknown }).linear).toBeDefined();
  });
});

describe("LogIt Adaptive — the lifter's own settings", () => {
  it("uses the exercise's own rep range, but a split day's reps still win", async () => {
    const history = [entry(3, [[100, 5], [100, 4], [100, 3]])];
    const own = await adaptiveProgression.suggest(input({ history, repRange: [3, 5] }));
    expect(own.sets.map((s) => s.reps)).toEqual([5, 4, 3]);
    const split = await adaptiveProgression.suggest(input({ history, repRange: [3, 5], plannedTargets: { reps: 8 } }));
    expect(split.sets.every((s) => s.reps === 8)).toBe(true);
  });

  it("pushes the first set when behind on a goal and asked to", async () => {
    const history = [entry(3, [[95, 7], [95, 6], [95, 5]])];
    const goal = { weightKg: 120, reps: 1, pace: "behind" as const, currentKg: 117, neededPerWeekKg: 1, ratePerWeekKg: 0.2 };
    const show = await adaptiveProgression.suggest(input({ history, goal: { ...goal, behindPace: "show" } }));
    const push = await adaptiveProgression.suggest(input({ history, goal: { ...goal, behindPace: "push" } }));
    expect(show.sets[0]!.weight).toBe(95);
    expect(push.sets[0]!.weight).toBe(97.5);
    expect(push.sets[1]!.weight).toBe(95);
    expect(push.reasoning?.summary?.join(" ")).toMatch(/behind on your goal/);
  });
});
