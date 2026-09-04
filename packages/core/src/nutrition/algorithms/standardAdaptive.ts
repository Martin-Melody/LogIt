import type {
  AlgorithmPreferencesField,
  NutritionAlgorithm,
  NutritionAlgorithmInput,
  NutritionAlgorithmOutput,
} from "../../domain/nutritionAlgorithm";
import type { NutritionGoal } from "../../domain/nutrition";
import { computeTargets } from "../targets";
import { blendExpenditure, estimateExpenditure } from "../expenditure";

// The built-in nutrition algorithm: Mifflin–St Jeor maintenance → goal-adjusted calories,
// then (once there's ~2 weeks of weight + food data) corrected toward the expenditure the
// user's own trend implies. This is exactly what the app did before nutrition algorithms
// became pluggable — with default preferences the output is unchanged.

type Prefs = {
  adaptive: boolean;
  windowDays: number;
  blendClampPct: number;
};

const DEFAULTS: Prefs = { adaptive: true, windowDays: 28, blendClampPct: 35 };

const SCHEMA: AlgorithmPreferencesField[] = [
  {
    key: "adaptive",
    label: "Adaptive targets",
    description:
      "Adjust the target from your real weight-vs-intake trend once there's enough data.",
    type: "boolean",
    default: DEFAULTS.adaptive,
  },
  {
    key: "windowDays",
    label: "Trend window",
    description: "How many recent days the adaptive estimate looks at.",
    type: "number",
    default: DEFAULTS.windowDays,
    min: 14,
    max: 56,
    step: 7,
    unit: "days",
  },
  {
    key: "blendClampPct",
    label: "Max adjustment",
    description:
      "How far the adaptive estimate is allowed to pull the target away from the formula.",
    type: "number",
    default: DEFAULTS.blendClampPct,
    min: 10,
    max: 50,
    step: 5,
    unit: "%",
  },
];

function readPrefs(raw: unknown, goal: NutritionGoal): Prefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Prefs>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    adaptive:
      typeof p.adaptive === "boolean" ? p.adaptive : goal.adaptiveEnabled ?? DEFAULTS.adaptive,
    windowDays: num(p.windowDays, DEFAULTS.windowDays),
    blendClampPct: num(p.blendClampPct, DEFAULTS.blendClampPct),
  };
}

export const standardAdaptive: NutritionAlgorithm = {
  id: "standard-adaptive",
  name: "Standard adaptive",
  description:
    "Mifflin–St Jeor maintenance, adjusted to your goal, then corrected from your real weight trend once you have a couple of weeks of data.",
  author: "logit",
  defaultPreferences: DEFAULTS,
  preferencesSchema: SCHEMA,

  computeTargets(input: NutritionAlgorithmInput): NutritionAlgorithmOutput {
    const { goal } = input;
    const prefs = readPrefs(input.userPreferences, goal);
    const now = new Date(input.now);

    const base = computeTargets(goal, { weightKg: input.currentWeightKg, now });
    if (!base) {
      // Not enough data to compute a BMR — could be missing profile fields, a missing
      // current weight (e.g. weight history hasn't synced down yet after a fresh login),
      // or both. Say exactly what's missing rather than always blaming height/birth date —
      // those are commonly already set when this fires. kcal 0 → the usecase shows the
      // "incomplete" state unless a manual override is set.
      const missingProfile =
        goal.heightCm == null || goal.heightCm <= 0 || goal.birthDateIso == null;
      const missingWeight = !(input.currentWeightKg != null && input.currentWeightKg > 0);
      const sourceLabel =
        missingProfile && missingWeight
          ? "Add height, birth date & a recent weight"
          : missingProfile
            ? "Add height & birth date"
            : "Log a recent weight";
      return { kcal: 0, sourceLabel };
    }

    if (prefs.adaptive) {
      const estimate = estimateExpenditure({
        weightEntries: input.weightEntries,
        dailyIntakeKcal: input.dailyIntakeKcal,
        windowDays: prefs.windowDays,
      });
      if (estimate) {
        const blended = blendExpenditure(base.expenditure, estimate, prefs.blendClampPct);
        const adaptive = computeTargets(goal, {
          weightKg: input.currentWeightKg,
          adaptiveExpenditure: blended,
          now,
        });
        if (adaptive) {
          return {
            kcal: adaptive.kcal,
            macros: adaptive.macros,
            maintenanceKcal: Math.round(blended),
            sourceLabel: "Adaptive",
          };
        }
      }
    }

    return {
      kcal: base.kcal,
      macros: base.macros,
      maintenanceKcal: Math.round(base.expenditure),
      sourceLabel: "Calculated",
    };
  },
};
