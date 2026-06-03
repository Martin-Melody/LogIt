import type { ExerciseHistoryEntry } from "./progression";

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
  exercise: { id?: string; name: string; exerciseType?: import("$lib/domain/exercise").ExerciseType };
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
  compute(input: AnalyticsInput): AnalyticsOutput;
};

export interface AnalyticsRegistry {
  list(): Promise<AnalyticsPluginMeta[]>;
  get(id: string): Promise<AnalyticsPlugin | null>;
}

export type UserAnalyticsConfig = {
  analyticsId: string;
};
