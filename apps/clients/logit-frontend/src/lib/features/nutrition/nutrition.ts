import type { NutritionRepo } from "@logit/core/data/nutritionRepo";
import {
  dayTotals,
  localDateIso,
  type DiaryDay,
  type MacroTotals,
  type NutritionGoal,
  type WeightEntry,
} from "@logit/core/domain/nutrition";
import { computeTargets, type NutritionTargets } from "@logit/core/nutrition/targets";
import {
  projectGoalDate,
  smoothWeightSeries,
  type GoalProjection,
  type WeightTrend,
} from "@logit/core/nutrition/trend";
import { blendExpenditure, estimateExpenditure } from "@logit/core/nutrition/expenditure";

// ── Units ────────────────────────────────────────────────────────────────────

export type WeightUnit = "kg" | "lbs";
const LB_PER_KG = 2.2046226218;

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === "lbs" ? kg * LB_PER_KG : kg;
}
export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === "lbs" ? value / LB_PER_KG : value;
}
export function fmtWeight(kg: number | null, unit: WeightUnit): string {
  if (kg == null) return "—";
  return `${kgToDisplay(kg, unit).toFixed(1)} ${unit}`;
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmtKcal(n: number): string {
  return `${Math.round(n)}`;
}
export function fmtGrams(n: number): string {
  return `${Math.round(n)} g`;
}

// ── Derived nutrition state ──────────────────────────────────────────────────

export type NutritionState = {
  goal: NutritionGoal | null;
  targets: NutritionTargets | null;
  trend: WeightTrend;
  projection: GoalProjection;
  /** true when targets are currently driven by the adaptive expenditure estimate. */
  adaptiveActive: boolean;
};

/**
 * Load the goal + weight log, smooth the trend, and resolve daily targets — running the
 * adaptive expenditure estimate when the goal opts in and there's enough data. Falls back
 * to the given bodyweight (from the profile) when the weight log is empty.
 */
export async function resolveNutritionState(
  repo: NutritionRepo,
  fallbackWeightKg?: number | null,
): Promise<NutritionState> {
  const [goal, weightEntries] = await Promise.all([
    repo.getGoal(),
    repo.listWeightEntries(),
  ]);

  const trend = smoothWeightSeries(weightEntries);
  const weightKg = trend.currentKg ?? fallbackWeightKg ?? undefined;

  if (!goal) {
    return {
      goal: null,
      targets: null,
      trend,
      projection: { etaIso: null, weeksRemaining: null },
      adaptiveActive: false,
    };
  }

  // First pass: formula target (also gives us the calculated TDEE).
  const calculated = computeTargets(goal, { weightKg });

  let targets = calculated;
  let adaptiveActive = false;

  if (goal.adaptiveEnabled && calculated && calculated.expenditure > 0) {
    const intake = await recentDailyIntake(repo, 28);
    const estimate = estimateExpenditure({
      weightEntries,
      dailyIntakeKcal: intake,
    });
    if (estimate) {
      const blended = blendExpenditure(calculated.expenditure, estimate);
      const adaptive = computeTargets(goal, { weightKg, adaptiveExpenditure: blended });
      if (adaptive?.source === "adaptive") {
        targets = adaptive;
        adaptiveActive = true;
      }
    }
  }

  const projection = projectGoalDate({
    currentKg: trend.currentKg,
    targetKg: goal.targetWeightKg,
    weeklyRateKg: trend.weeklyRateKg,
  });

  return { goal, targets, trend, projection, adaptiveActive };
}

/** Per-day logged calories over the last `days` days (only days with a diary entry). */
export async function recentDailyIntake(
  repo: NutritionRepo,
  days: number,
): Promise<{ dateIso: string; kcal: number }[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const diary = await repo.listDaysInRange(localDateIso(start), localDateIso(end));
  return diary
    .map((d) => ({ dateIso: d.dateIso, kcal: dayTotals(d).kcal }))
    .filter((x) => x.kcal > 0);
}

export function totalsFor(day: DiaryDay | null): MacroTotals {
  return day ? dayTotals(day) : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
}

export function latestWeight(entries: WeightEntry[]): WeightEntry | null {
  const live = entries.filter((e) => !e.deletedAtMs);
  return live.length ? live.reduce((a, b) => (a.dateIso >= b.dateIso ? a : b)) : null;
}
