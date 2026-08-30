import type { AlgorithmPreferencesField } from "./progression";
import type { MacroTotals, NutritionGoal, WeightEntry } from "./nutrition";

// A nutrition algorithm turns a goal + the user's real data into a daily calorie target.
// Decoupled from the app exactly like ProgressionAlgorithm / AnalyticsPlugin so the
// community can publish their own (see docs/plugin-bundle-format.md).
//
// The APP — not the algorithm — owns two things:
//   1. goal.manualCalorieTarget: a hard override that always wins.
//   2. macro split: if the algorithm doesn't return `macros`, the app derives them from
//      goal.proteinGPerKg + goal.fatPct.
// So a minimal algorithm only has to produce a `kcal` number.

export { type AlgorithmPreferencesField };

export type NutritionAlgorithmMeta = {
  id: string;
  name: string;
  description: string;
  author?: string;
};

export type DailyIntakePoint = { dateIso: string; kcal: number };

export type NutritionAlgorithmInput = {
  goal: NutritionGoal;
  /** Latest smoothed bodyweight (kg), or a fallback from the profile; undefined if unknown. */
  currentWeightKg?: number;
  /** The whole bodyweight log, oldest first — the algorithm smooths it however it likes. */
  weightEntries: WeightEntry[];
  /** Per-day logged calories; only days with a diary entry, oldest first. */
  dailyIntakeKcal: DailyIntakePoint[];
  /** User-configured preferences for this algorithm (shape defined by preferencesSchema). */
  userPreferences: unknown;
  /** Epoch ms "now" — passed in so the algorithm stays pure/testable. */
  now: number;
};

export type NutritionAlgorithmOutput = {
  /** Daily calorie target. */
  kcal: number;
  /** Optional explicit macro targets. When omitted the app derives them from the goal. */
  macros?: MacroTotals;
  /** Estimated maintenance calories, for display under the target. */
  maintenanceKcal?: number;
  /** Short badge label, e.g. "Adaptive", "Calculated", "Trend". */
  sourceLabel?: string;
  /** Freeform note shown with the target. */
  notes?: string;
};

export type NutritionAlgorithm = NutritionAlgorithmMeta & {
  defaultPreferences?: unknown;
  /** If present, the app renders a settings screen for this algorithm. */
  preferencesSchema?: AlgorithmPreferencesField[];
  computeTargets(input: NutritionAlgorithmInput): NutritionAlgorithmOutput;
};

export type UserNutritionAlgorithmConfig = {
  algorithmId: string;
};

export interface NutritionAlgorithmRegistry {
  list(): Promise<NutritionAlgorithmMeta[]>;
  get(id: string): Promise<NutritionAlgorithm | null>;
}
