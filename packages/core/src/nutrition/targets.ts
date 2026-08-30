import type {
  ActivityLevel,
  MacroTotals,
  NutritionGoal,
  Sex,
} from "../domain/nutrition";

// Goal-driven calorie and macro targets. Pure — the "progression algorithm" of nutrition.
// Mifflin–St Jeor BMR → activity-scaled TDEE → goal-adjusted calories → macro split.
// When adaptive tracking is on and an expenditure estimate is available (see ./expenditure),
// that estimate replaces the calculated TDEE.

/** kcal stored/released per kg of body mass change (approx; mixed tissue). */
export const KCAL_PER_KG = 7700;

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

export function ageFromBirthDate(birthDateIso: string, now: Date = new Date()): number {
  const b = new Date(birthDateIso);
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Mifflin–St Jeor resting metabolic rate, kcal/day. */
export function bmrMifflinStJeor(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  return input.sex === "male" ? base + 5 : base - 161;
}

export function tdee(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activity];
}

/** Apply the goal's deficit/surplus to an expenditure figure. Never returns below `floor`
 * (default: the BMR — eating below resting rate is not a target we'll hand out). */
export function calorieTargetForGoal(input: {
  expenditure: number;
  goalType: NutritionGoal["goalType"];
  rateKgPerWeek: number;
  floor?: number;
}): number {
  const dailyDelta = (Math.abs(input.rateKgPerWeek) * KCAL_PER_KG) / 7;
  let kcal = input.expenditure;
  if (input.goalType === "lose") kcal -= dailyDelta;
  else if (input.goalType === "gain") kcal += dailyDelta;
  const floor = input.floor ?? 0;
  return Math.max(floor, kcal);
}

/** Split a calorie target into grams of protein / carbs / fat.
 * Protein is anchored to bodyweight, fat to a fraction of calories, carbs take the rest. */
export function macroTargets(input: {
  kcalTarget: number;
  weightKg: number;
  proteinGPerKg: number;
  fatPct: number;
}): MacroTotals {
  const proteinG = input.weightKg * input.proteinGPerKg;
  const proteinKcal = proteinG * 4;
  const fatKcal = input.kcalTarget * input.fatPct;
  const fatG = fatKcal / 9;
  const carbsKcal = Math.max(0, input.kcalTarget - proteinKcal - fatKcal);
  const carbsG = carbsKcal / 4;
  return {
    kcal: Math.round(input.kcalTarget),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
  };
}

export type TargetSource = "manual" | "calculated" | "adaptive";

export type NutritionTargets = {
  kcal: number;
  macros: MacroTotals;
  bmr: number;
  /** Expenditure used to derive the target (calculated TDEE or the adaptive estimate). */
  expenditure: number;
  source: TargetSource;
};

/**
 * The Mifflin–St Jeor formula target: goal + current bodyweight (+ optional adaptive
 * expenditure estimate) → concrete daily targets. Returns null when there isn't enough
 * profile data to compute a BMR. Pass `adaptiveExpenditure` to use a measured expenditure
 * instead of the formula TDEE; the caller decides whether to.
 *
 * Manual overrides (goal.manualCalorieTarget) are applied by the caller / usecase, not here.
 */
export function computeTargets(
  goal: NutritionGoal,
  ctx: { weightKg?: number; adaptiveExpenditure?: number | null; now?: Date },
): NutritionTargets | null {
  const weightKg = ctx.weightKg;
  const now = ctx.now ?? new Date();

  const canComputeBmr =
    weightKg != null &&
    weightKg > 0 &&
    goal.heightCm != null &&
    goal.heightCm > 0 &&
    goal.birthDateIso != null;

  const bmr = canComputeBmr
    ? bmrMifflinStJeor({
        sex: goal.sex,
        weightKg: weightKg!,
        heightCm: goal.heightCm!,
        ageYears: ageFromBirthDate(goal.birthDateIso!, now),
      })
    : 0;

  if (!canComputeBmr) return null;

  const calculatedTdee = tdee(bmr, goal.activityLevel);

  const useAdaptive = ctx.adaptiveExpenditure != null && ctx.adaptiveExpenditure > 0;

  const expenditure = useAdaptive ? ctx.adaptiveExpenditure! : calculatedTdee;

  const kcalTarget = calorieTargetForGoal({
    expenditure,
    goalType: goal.goalType,
    rateKgPerWeek: goal.targetRateKgPerWeek,
    floor: bmr,
  });

  return {
    kcal: Math.round(kcalTarget),
    macros: macroTargets({
      kcalTarget,
      weightKg: weightKg!,
      proteinGPerKg: goal.proteinGPerKg,
      fatPct: goal.fatPct,
    }),
    bmr,
    expenditure,
    source: useAdaptive ? "adaptive" : "calculated",
  };
}
