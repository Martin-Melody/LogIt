import {
  algorithmPrefsFor,
  dayTotals,
  localDateIso,
  resolveAlgorithmId,
  type MacroTotals,
  type NutritionGoal,
} from "../../domain/nutrition";
import type { NutritionAlgorithmMeta, DailyIntakePoint } from "../../domain/nutritionAlgorithm";
import { planDay, planOn, type CoachNutritionPlan, type NutrientTarget } from "../../domain/CoachNutritionPlan";
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
  /** Short badge label, e.g. "Adaptive", "Calculated", "Manual", "From your coach". */
  sourceLabel: string;
  source: "manual" | "algorithm" | "coach";
  /** A coach's plan (canvas NT1): which of the numbers the coach set ("From Sam"); the rest
   * are the client's own. */
  coachSet?: ("kcal" | "proteinG" | "carbsG" | "fatG")[];
  /** A coach's plan: targets beyond calories and the macros. */
  nutrients?: NutrientTarget[];
  /** A coach's plan with day types: which one today is ("Training day"). */
  dayName?: string;
};

export type NutritionState = {
  goal: NutritionGoal | null;
  algorithm: NutritionAlgorithmMeta | null;
  /** The coach-assigned plan, if one is active. Its targets are in effect. */
  coachPlan: CoachNutritionPlan | null;
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
  deps: Pick<
    NutritionDeps,
    "nutritionRepo" | "nutritionAlgorithmRegistry" | "assignedNutritionPlanRepo"
  >,
  opts: {
    fallbackWeightKg?: number | null;
    now?: number;
    /** The day the targets are for (default today): a coach's plan applies from its start
     * date, so past days keep the plan they had (canvas FX1). */
    dateIso?: string;
    /** Whether that day has training, for a plan with training and rest days. */
    trainingDay?: boolean;
  } = {},
): Promise<NutritionState> {
  const { nutritionRepo: repo, nutritionAlgorithmRegistry: registry } = deps;
  const now = opts.now ?? Date.now();
  const dateIso = opts.dateIso ?? localDateIso(new Date(now));
  const plans = deps.assignedNutritionPlanRepo;

  const [goal, weightEntries, coachPlan] = await Promise.all([
    repo.getGoal(),
    repo.listWeightEntries(),
    plans?.listPlanHistory
      ? plans.listPlanHistory().then((all) => planOn(all, dateIso))
      : (plans?.getAssignedPlan() ?? Promise.resolve(null)),
  ]);
  const trend = smoothWeightSeries(weightEntries);
  const currentWeightKg = trend.currentKg ?? opts.fallbackWeightKg ?? undefined;

  const projection = goal
    ? projectGoalDate({
        currentKg: trend.currentKg,
        targetKg: goal.targetWeightKg,
        weeklyRateKg: trend.weeklyRateKg,
      })
    : ({ etaIso: null, weeksRemaining: null } as GoalProjection);

  const base = { goal, coachPlan, trend, projection };

  // A coach-assigned plan wins over everything — the client can't out-tweak their coach.
  // What the coach didn't set comes from the client's own goal (canvas NT1, GL1).
  if (coachPlan) {
    const day = planDay(coachPlan, dateIso, opts.trainingDay ?? false);
    let kcal = Math.round(day.kcalTarget);
    if (coachPlan.kcalMode === "adaptive" && goal) {
      // Calories from their own Adaptive targets (their goal pace); a day type's difference
      // from the plan's calories stays (a training day still gets its extra).
      const own = await ownTargets(goal, coachPlan.adaptivePrefs);
      if (own.targets) kcal = Math.round(own.targets.kcal + (day.kcalTarget - coachPlan.kcalTarget));
    }
    const filled = goal ? macrosFromGoal(kcal, currentWeightKg ?? 0, goal) : { kcal, proteinG: 0, carbsG: 0, fatG: 0 };
    const coachSet: NonNullable<ResolvedTargets["coachSet"]> = ["kcal"];
    if (day.proteinG) coachSet.push("proteinG");
    if (day.carbsG) coachSet.push("carbsG");
    if (day.fatG) coachSet.push("fatG");
    return {
      ...base,
      algorithm: null,
      targets: {
        kcal,
        macros: {
          kcal,
          proteinG: day.proteinG || filled.proteinG,
          carbsG: day.carbsG || filled.carbsG,
          fatG: day.fatG || filled.fatG,
        },
        maintenanceKcal: null,
        sourceLabel: "From your coach",
        source: "coach",
        coachSet,
        nutrients: coachPlan.nutrients ?? [],
        ...(coachPlan.mode && coachPlan.mode !== "same" ? { dayName: day.name } : {}),
      },
      targetsHint: null,
    };
  }

  if (!goal) {
    return { ...base, algorithm: null, targets: null, targetsHint: null };
  }

  return { ...base, ...(await ownTargets(goal)) };

  /** The client's own targets: their manual calories, else their nutrition algorithm. */
  async function ownTargets(goal: NutritionGoal, coachPrefs?: Record<string, unknown>): Promise<Pick<NutritionState, "algorithm" | "targets" | "targetsHint">> {
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

    // Manual override wins over the algorithm (but not over a coach plan).
    if (goal.manualCalorieTarget != null && goal.manualCalorieTarget > 0) {
      const kcal = Math.round(goal.manualCalorieTarget);
      return {
        algorithm: algorithmMeta,
        targets: {
          kcal,
          macros: macrosFromGoal(kcal, currentWeightKg ?? 0, goal),
          maintenanceKcal: null,
          sourceLabel: "Manual",
          source: "manual",
        },
        targetsHint: null,
      };
    }

    if (!algorithm) {
      return {
        algorithm: null,
        targets: null,
        targetsHint: `Algorithm "${algorithmId}" is not installed`,
      };
    }

    const dailyIntakeKcal = await recentDailyIntake(repo, 35, now);
    const userPreferences = {
      ...((algorithm.defaultPreferences as Record<string, unknown>) ?? {}),
      ...algorithmPrefsFor(goal, algorithmId),
      // A coach's plan can set the built-in rule's settings (canvas Q3).
      ...(coachPrefs && algorithmId === "standard-adaptive" ? coachPrefs : {}),
    };

    const out = await algorithm.computeTargets({
      goal,
      currentWeightKg,
      weightEntries,
      dailyIntakeKcal,
      userPreferences,
      now,
    });

    if (!out.kcal || out.kcal <= 0) {
      return {
        algorithm: algorithmMeta,
        targets: null,
        targetsHint: out.sourceLabel ?? null,
      };
    }

    const kcal = Math.round(out.kcal);
    return {
      algorithm: algorithmMeta,
      targets: {
        kcal,
        macros: out.macros ?? macrosFromGoal(kcal, currentWeightKg ?? 0, goal),
        maintenanceKcal: out.maintenanceKcal ?? null,
        sourceLabel: out.sourceLabel ?? algorithm.name,
        source: "algorithm",
      },
      targetsHint: null,
    };
  }
}
