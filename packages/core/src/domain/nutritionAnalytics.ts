import type {
  AnalyticsDataPoint,
  AnalyticsMetric,
  AnalyticsMetricDefinition,
  AnalyticsSeries,
} from "./analytics";
import type { DiaryDay, MacroTotals, NutritionGoal, WeightEntry } from "./nutrition";

// A nutrition analytics plugin computes insights over a window of diary + weight data.
// Mirrors AnalyticsPlugin (domain/analytics.ts) — same metric/series/insight shape — so the
// community can publish these as plugins alongside nutrition algorithms.

export type { AnalyticsDataPoint, AnalyticsMetric, AnalyticsMetricDefinition, AnalyticsSeries };

export type NutritionAnalyticsInput = {
  /** Diary days in the requested range, oldest first. */
  days: DiaryDay[];
  /** The whole bodyweight log, oldest first. */
  weightEntries: WeightEntry[];
  /** The user's goal, if set. */
  goal: NutritionGoal | null;
  /** Current resolved daily targets, if a goal + enough data exist. */
  targets: MacroTotals | null;
  /** Inclusive date range the analysis covers (owner-local YYYY-MM-DD). */
  range: { startIso: string; endIso: string };
  now: number;
};

export type NutritionAnalyticsOutput = {
  metrics: AnalyticsMetric[];
  series: AnalyticsSeries[];
  insights?: string[];
  label?: string;
};

export type NutritionAnalyticsPluginMeta = {
  id: string;
  name: string;
  description: string;
  author?: string;
  metricDefinitions: AnalyticsMetricDefinition[];
};

export type NutritionAnalyticsPlugin = NutritionAnalyticsPluginMeta & {
  // Built-in plugins are synchronous; community plugins run in the interpreter
  // sandbox and resolve asynchronously. Callers must await.
  compute(
    input: NutritionAnalyticsInput,
  ): NutritionAnalyticsOutput | Promise<NutritionAnalyticsOutput>;
};

export type UserNutritionAnalyticsConfig = {
  analyticsId: string;
};

export interface NutritionAnalyticsRegistry {
  list(): Promise<NutritionAnalyticsPluginMeta[]>;
  get(id: string): Promise<NutritionAnalyticsPlugin | null>;
}
