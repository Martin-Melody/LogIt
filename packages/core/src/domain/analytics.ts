import type { ExerciseHistoryEntry } from "./progression";
import type { ExerciseType } from "./exercise";

export type AnalyticsMetricDefinition = {
  id: string;
  label: string;
  unit?: string;
  higherIsBetter?: boolean;
};

export type AnalyticsDataPoint = {
  date: number; // ms timestamp
  value: number;
  label?: string;
};

export type AnalyticsMetric = {
  id: string;
  value: number | string;
  formatted?: string;
};

export type AnalyticsSeries = {
  metricId: string;
  label: string;
  points: AnalyticsDataPoint[];
};

export type AnalyticsInput = {
  exercise: { id?: string; name: string; exerciseType?: ExerciseType };
  history: ExerciseHistoryEntry[]; // oldest first, all available history
};

export type AnalyticsOutput = {
  metrics: AnalyticsMetric[];
  series: AnalyticsSeries[];
  insights?: string[];
  label?: string;
};

export type AnalyticsPluginMeta = {
  id: string;
  name: string;
  description: string;
  author?: string;
  metricDefinitions: AnalyticsMetricDefinition[];
};

export type AnalyticsPlugin = AnalyticsPluginMeta & {
  // Built-in plugins are synchronous; community plugins run in the interpreter
  // sandbox and resolve asynchronously. Callers must await.
  compute(input: AnalyticsInput): AnalyticsOutput | Promise<AnalyticsOutput>;
};

export interface AnalyticsRegistry {
  list(): Promise<AnalyticsPluginMeta[]>;
  get(id: string): Promise<AnalyticsPlugin | null>;
}

export type UserAnalyticsConfig = {
  analyticsId: string;
};
