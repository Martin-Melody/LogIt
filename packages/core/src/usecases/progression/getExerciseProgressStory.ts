import type { ProgressStatus } from "../../domain/progression";
import { classifyTrend } from "../../domain/progression";
import type { Reasoning } from "../../domain/reasoning";
import { nowMs } from "../../domain/time";
import type { AnalyticsSeries } from "../../domain/analytics";
import { getExerciseAnalytics } from "./getExerciseAnalytics";
import { getSuggestion } from "./getSuggestion";
import type { ProgressionDeps } from "./deps";

export type ExerciseProgressStory = {
  exerciseName: string;
  exerciseId?: string;
  status: ProgressStatus;
  statusDetail: string;
  headline: { label: string; value: string };
  lastPr?: { value: string; whenMs: number };
  nextTarget?: string;
  nextNote?: string;
  lastTrainedMs: number;
  spark: number[];
  /** Why the trend classifier landed on `status` — see domain/reasoning.ts. */
  trendReasoning: Reasoning;
  /** Why the algorithm landed on `nextTarget`/`nextNote`, when it supplied one. */
  suggestionReasoning?: Reasoning;
};

const PRIMARY_METRIC_PRIORITY = ["estimated_1rm", "max_weight", "min_assist", "max_reps"];

function pickPrimarySeries(series: AnalyticsSeries[]): AnalyticsSeries | undefined {
  for (const id of PRIMARY_METRIC_PRIORITY) {
    const s = series.find((x) => x.metricId === id);
    if (s && s.points.length > 0) return s;
  }
  return series.find((s) => s.points.length > 0);
}

function statusDetail(
  status: ProgressStatus,
  info: { slopePctPerSession: number; sessionsSincePr: number; lastTrainedMs: number },
): string {
  switch (status) {
    case "new":
      return "Not enough sessions yet";
    case "detraining": {
      const days = Math.round((nowMs() - info.lastTrainedMs) / 86_400_000);
      return `Last trained ${days} days ago`;
    }
    case "progressing":
      return info.sessionsSincePr <= 1
        ? "New best last session"
        : `≈ +${info.slopePctPerSession.toFixed(1)}% / session`;
    case "regressing":
      return `≈ ${info.slopePctPerSession.toFixed(1)}% / session`;
    case "plateaued":
      return info.sessionsSincePr === 1
        ? "No new best since last session"
        : `No new best in ${info.sessionsSincePr} sessions`;
  }
}

export async function getExerciseProgressStory(
  exercise: { id?: string; name: string },
  deps: ProgressionDeps,
): Promise<ExerciseProgressStory | null> {
  const [analytics, suggestion] = await Promise.all([
    getExerciseAnalytics(exercise, deps),
    getSuggestion(exercise, deps).catch(() => null),
  ]);
  if (!analytics) return null;

  const primary = pickPrimarySeries(analytics.output.series);
  if (!primary || primary.points.length === 0) return null;

  const points = [...primary.points].sort((a, b) => a.date - b.date);
  const values = points.map((p) => p.value);
  const sessionPositions = points.map((p) => p.sessionPosition);
  const lastTrainedMs = points[points.length - 1]!.date;

  const trend = classifyTrend({ values, sessionPositions, lastTrainedMs, nowMs: nowMs() });

  // Last PR in the primary series.
  let runningMax = -Infinity;
  let lastPrIdx = -1;
  values.forEach((v, i) => {
    if (v > runningMax) { runningMax = v; lastPrIdx = i; }
  });

  const def = analytics.metricDefinitions.find((d) => d.id === primary.metricId);
  const headlineMetric = analytics.output.metrics.find((m) => m.id === primary.metricId)
    ?? analytics.output.metrics[0];

  return {
    exerciseName: exercise.name,
    exerciseId: exercise.id,
    status: trend.status,
    statusDetail: statusDetail(trend.status, { ...trend, lastTrainedMs }),
    headline: {
      label: def?.label ?? primary.label,
      value: String(headlineMetric?.formatted ?? headlineMetric?.value ?? values[values.length - 1]),
    },
    lastPr:
      lastPrIdx >= 0
        ? {
            value: `${Math.round(values[lastPrIdx]! * 10) / 10}${def?.unit ? ` ${def.unit}` : ""}`,
            whenMs: points[lastPrIdx]!.date,
          }
        : undefined,
    nextTarget: suggestion?.label ?? undefined,
    nextNote: suggestion?.notes ?? undefined,
    lastTrainedMs,
    spark: values,
    trendReasoning: trend.reasoning,
    suggestionReasoning: suggestion?.reasoning,
  };
}
