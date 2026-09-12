import type { ExerciseHistoryEntry } from "./progression";
import type { ExerciseType } from "./exercise";
import type { MobilityHistoryEntry } from "./mobilityProgression";

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
  // 0-based position of this exercise in its session (see ExerciseHistoryEntry).
  // Carried through so a trend classifier can tell "done last, as usual" apart
  // from a real drop. Undefined for series a plugin builds without per-session
  // history (e.g. aggregated data).
  sessionPosition?: number;
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

export type MobilitySessionSummary = MobilityHistoryEntry & {
  drillName: string;
  metric: "hold" | "reps";
  perSide: boolean;
};

export type AnalyticsInput = {
  exercise: { id?: string; name: string; exerciseType?: ExerciseType };
  history: ExerciseHistoryEntry[]; // oldest first, all available history
  /**
   * All mobility drills the user has logged (oldest first), across every drill —
   * present so an analytics plugin can correlate stretching with training. Only
   * populated for the whole-history analytics view.
   */
  mobilitySessions?: MobilitySessionSummary[];
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
