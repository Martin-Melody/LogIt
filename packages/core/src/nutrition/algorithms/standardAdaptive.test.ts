import { describe, expect, it } from "vitest";
import { defaultNutritionGoal, type NutritionGoal, type WeightEntry } from "../../domain/nutrition";
import type { DailyIntakePoint } from "../../domain/nutritionAlgorithm";
import { standardAdaptive } from "./standardAdaptive";

const NOW = Date.parse("2026-06-15T12:00:00Z");

function goal(over: Partial<NutritionGoal> = {}): NutritionGoal {
  return {
    ...defaultNutritionGoal(),
    sex: "male",
    birthDateIso: "1994-06-15",
    heightCm: 180,
    activityLevel: "moderate",
    goalType: "lose",
    targetRateKgPerWeek: 0.5,
    proteinGPerKg: 1.8,
    fatPct: 0.3,
    ...over,
  };
}

function weightSeries(n: number, start: number, perDay: number): WeightEntry[] {
  const out: WeightEntry[] = [];
  for (let i = 0; i < n; i++) {
    const iso = new Date(NOW - (n - i) * 86_400_000).toISOString().slice(0, 10);
    out.push({ id: `w${i}`, dateIso: iso, weightKg: start + i * perDay, createdAtMs: i, updatedAtMs: i });
  }
  return out;
}

function intakeSeries(n: number, kcal: number): DailyIntakePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    dateIso: new Date(NOW - (n - i) * 86_400_000).toISOString().slice(0, 10),
    kcal,
  }));
}

const run = (over: Partial<Parameters<typeof standardAdaptive.computeTargets>[0]>) =>
  standardAdaptive.computeTargets({
    goal: goal(),
    currentWeightKg: 80,
    weightEntries: [],
    dailyIntakeKcal: [],
    userPreferences: standardAdaptive.defaultPreferences,
    now: NOW,
    ...over,
  });

describe("standardAdaptive", () => {
  it("declares a preferences schema (adaptive / window / clamp)", () => {
    expect(standardAdaptive.preferencesSchema?.map((f) => f.key)).toEqual([
      "adaptive",
      "windowDays",
      "blendClampPct",
    ]);
  });

  it("falls back to the formula target with no trend data", () => {
    const out = run({});
    expect(out.sourceLabel).toBe("Calculated");
    expect(out.kcal).toBe(2194); // matches targets.test.ts
    expect(out.maintenanceKcal).toBe(2744);
    expect(out.macros?.proteinG).toBe(144);
  });

  it("signals an incomplete profile with kcal 0", () => {
    const out = standardAdaptive.computeTargets({
      goal: goal({ birthDateIso: undefined }),
      currentWeightKg: 80,
      weightEntries: [],
      dailyIntakeKcal: [],
      userPreferences: standardAdaptive.defaultPreferences,
      now: NOW,
    });
    expect(out.kcal).toBe(0);
    expect(out.sourceLabel).toMatch(/height/i);
  });

  it("uses the adaptive estimate once there's enough weight + intake data", () => {
    // Eating 2000, losing 0.5 kg/wk => true maintenance ~2550 => lose target ~2000.
    const out = run({
      weightEntries: weightSeries(24, 84, -0.5 / 7),
      dailyIntakeKcal: intakeSeries(24, 2000),
      currentWeightKg: 84,
    });
    expect(out.sourceLabel).toBe("Adaptive");
    expect(out.maintenanceKcal).toBeGreaterThan(2400);
    expect(out.maintenanceKcal).toBeLessThan(2700);
    expect(out.kcal).toBeGreaterThan(1850);
    expect(out.kcal).toBeLessThan(2150);
  });

  it("respects adaptive:false — stays on the formula even with data", () => {
    const out = run({
      weightEntries: weightSeries(24, 84, -0.5 / 7),
      dailyIntakeKcal: intakeSeries(24, 2000),
      currentWeightKg: 84,
      userPreferences: { ...standardAdaptive.defaultPreferences as object, adaptive: false },
    });
    expect(out.sourceLabel).toBe("Calculated");
  });

  it("falls back to goal.adaptiveEnabled when the pref is absent", () => {
    const out = standardAdaptive.computeTargets({
      goal: goal({ adaptiveEnabled: false }),
      currentWeightKg: 84,
      weightEntries: weightSeries(24, 84, -0.5 / 7),
      dailyIntakeKcal: intakeSeries(24, 2000),
      userPreferences: {}, // no `adaptive` key
      now: NOW,
    });
    expect(out.sourceLabel).toBe("Calculated");
  });
});
