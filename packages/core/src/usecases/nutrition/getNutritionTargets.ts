import {
  algorithmPrefsFor,
  dayTotals,
  localDateIso,
  resolveAlgorithmId,
  type MacroTotals,
  type NutritionGoal,
} from "../../domain/nutrition";
import type { NutritionAlgorithmMeta, DailyIntakePoint } from "../../domain/nutritionAlgorithm";
import type { NutritionRepo } from "../../data/nutritionRepo";
import { macroTargets } from "../../nutrition/targets";
import {
  projectGoalDate,
  smoothWeightSeries,
  type GoalProjection,
  type WeightTrend,
} from "../../nutrition/trend";
import type { NutritionDeps } from "./deps";

export type ResolvedTargets = {
  kcal: number;
  macros: MacroTotals;
  /** Estimated maintenance calories, if the algorithm reported one. */
  maintenanceKcal: number | null;
  /** Short badge label, e.g. "Adaptive", "Calculated", "Manual". */
  sourceLabel: string;
  source: "manual" | "algorithm";
};

export type NutritionState = {
  goal: NutritionGoal | null;
  algorithm: NutritionAlgorithmMeta | null;
  targets: ResolvedTargets | null;
  /** When targets is null but the algorithm gave a reason (e.g. "Add height & birth date"). */
  targetsHint: string | null;
  trend: WeightTrend;
  projection: GoalProjection;
};

function macrosFromGoal(kcal: number, weightKg: number, goal: NutritionGoal): MacroTotals {
  return macroTargets({
    kcalTarget: kcal,
    weightKg,
    proteinGPerKg: goal.proteinGPerKg,
    fatPct: goal.fatPct,
  });
}

/** Per-day logged calories over the last `days` days (days with a diary entry only). */
export async function recentDailyIntake(
  repo: NutritionRepo,
  days: number,
  now: number,
): Promise<DailyIntakePoint[]> {
  const end = new Date(now);
  const start = new Date(now - days * 86_400_000);
  const diary = await repo.listDaysInRange(localDateIso(start), localDateIso(end));
  return diary
    .map((d) => ({ dateIso: d.dateIso, kcal: dayTotals(d).kcal }))
    .filter((x) => x.kcal > 0)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

/**
 * Load the goal + weight log, smooth the trend, and resolve the daily calorie/macro target
 * through the configured nutrition algorithm (built-in "standard-adaptive" by default, or a
 * community plugin). A manual override on the goal always wins. Macros come from the
 * algorithm if it returns them, otherwise from the goal's protein g/kg + fat %.
 */
export async function getNutritionTargets(
  deps: Pick<NutritionDeps, "nutritionRepo" | "nutritionAlgorithmRegistry">,
  opts: { fallbackWeightKg?: number | null; now?: number } = {},
): Promise<NutritionState> {
  const { nutritionRepo: repo, nutritionAlgorithmRegistry: registry } = deps;
  const now = opts.now ?? Date.now();

  const [goal, weightEntries] = await Promise.all([repo.getGoal(), repo.listWeightEntries()]);
  const trend = smoothWeightSeries(weightEntries);
  const currentWeightKg = trend.currentKg ?? opts.fallbackWeightKg ?? undefined;
  const emptyProjection: GoalProjection = { etaIso: null, weeksRemaining: null };

  if (!goal) {
    return {
      goal: null,
      algorithm: null,
      targets: null,
      targetsHint: null,
      trend,
      projection: emptyProjection,
    };
  }

  const projection = projectGoalDate({
    currentKg: trend.currentKg,
    targetKg: goal.targetWeightKg,
    weeklyRateKg: trend.weeklyRateKg,
  });

  const algorithmId = resolveAlgorithmId(goal);
  const algorithm = await registry.get(algorithmId);
  const algorithmMeta: NutritionAlgorithmMeta | null = algorithm
    ? {
        id: algorithm.id,
        name: algorithm.name,
        description: algorithm.description,
        author: algorithm.author,
      }
    : null;

  // Manual override wins regardless of the algorithm.
  if (goal.manualCalorieTarget != null && goal.manualCalorieTarget > 0) {
    const kcal = Math.round(goal.manualCalorieTarget);
    return {
      goal,
      algorithm: algorithmMeta,
      targets: {
        kcal,
        macros: macrosFromGoal(kcal, currentWeightKg ?? 0, goal),
        maintenanceKcal: null,
        sourceLabel: "Manual",
        source: "manual",
      },
      targetsHint: null,
      trend,
      projection,
    };
  }

  if (!algorithm) {
    return {
      goal,
      algorithm: null,
      targets: null,
      targetsHint: `Algorithm "${algorithmId}" is not installed`,
      trend,
      projection,
    };
  }

  const dailyIntakeKcal = await recentDailyIntake(repo, 35, now);
  const userPreferences = {
    ...((algorithm.defaultPreferences as Record<string, unknown>) ?? {}),
    ...algorithmPrefsFor(goal, algorithmId),
  };

  const out = algorithm.computeTargets({
    goal,
    currentWeightKg,
    weightEntries,
    dailyIntakeKcal,
    userPreferences,
    now,
  });

  if (!out.kcal || out.kcal <= 0) {
    return {
      goal,
      algorithm: algorithmMeta,
      targets: null,
      targetsHint: out.sourceLabel ?? null,
      trend,
      projection,
    };
  }

  const kcal = Math.round(out.kcal);
  return {
    goal,
    algorithm: algorithmMeta,
    targets: {
      kcal,
      macros: out.macros ?? macrosFromGoal(kcal, currentWeightKg ?? 0, goal),
      maintenanceKcal: out.maintenanceKcal ?? null,
      sourceLabel: out.sourceLabel ?? algorithm.name,
      source: "algorithm",
    },
    targetsHint: null,
    trend,
    projection,
  };
}
