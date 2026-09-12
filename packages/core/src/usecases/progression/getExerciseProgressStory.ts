import type { ProgressStatus, ProgressionNudge } from "../../domain/progression";
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
  /** A dismissible ask from the algorithm (e.g. "vary session order to help
   * calibrate") — already filtered for prior dismissal by getSuggestion. */
  nudge?: ProgressionNudge;
};

const PRIMARY_METRIC_PRIORITY = ["estimated_1rm", "max_weight", "min_assist", "max_reps"];

// Bespoke to linear-progression's rep-range ladder (§10, §10.3.1) — same v1
// scope boundary as the warm-start lookup in getSuggestion.ts. A rep-range
// switch is a genuine LEVEL SHIFT in e1RM (different rep range, different
// Epley accuracy, different achievable load), not a real change in how hard
// the lift is progressing — left unhandled, the overall trend classifier
// would misread it as regressing or progressing depending on which way the
// switch went. Read straight off `suggestion.nextState` (already computed by
// getSuggestion above) rather than a second repo fetch. This is the first
// concrete case of a more general "tag a training block so it doesn't leave
// an undifferentiated mark on trend history" need (§10.3.3, tag training
// blocks) — that feature's exclusion generalizes this pattern rather than
// replacing it.
type LinearTrialState = {
  repRangeLadder?: {
    startedAtMs: number;
    status: "active" | "concluded";
    result?: { switched: boolean; concludedAtMs: number };
  }[];
};

// Generalizes the single-trial four-case rule to a whole ladder: at most one
// rung ever wins (the ladder stops climbing the moment one does, so a win is
// always the last entry), and everything from its start onward is the current
// regime. Every OTHER rung — rejected, or still active and unproven — excludes
// just its own window, wherever it falls, the same way a single trial did.
function computeComparableToCurrent(
  points: { date: number }[],
  ladder: LinearTrialState["repRangeLadder"] | undefined,
): (boolean | undefined)[] | undefined {
  if (!ladder || ladder.length === 0) return undefined;

  const lastSwitch = ladder.find((r) => r.status === "concluded" && r.result?.switched);
  const regimeStartMs = lastSwitch?.startedAtMs ?? -Infinity;

  return points.map((p) => {
    if (p.date < regimeStartMs) return false; // before the sustained regime began, if any
    for (const rung of ladder) {
      if (rung === lastSwitch) continue; // this window IS the current regime, not excluded
      const endMs = rung.status === "concluded" ? (rung.result?.concludedAtMs ?? Infinity) : Infinity;
      if (p.date >= rung.startedAtMs && p.date < endMs) return false;
    }
    return true;
  });
}

/** Exported for reuse by anything that needs "the one series that best represents
 * progress" for an exercise — e.g. getMuscleGroupInsights, which correlates the same
 * primary metric against weekly training volume rather than just its own trend. */
export function pickPrimarySeries(series: AnalyticsSeries[]): AnalyticsSeries | undefined {
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

  const ladder = (suggestion?.nextState as LinearTrialState | null)?.repRangeLadder;
  const comparableToCurrent = computeComparableToCurrent(points, ladder);
  const trend = classifyTrend({ values, sessionPositions, comparableToCurrent, lastTrainedMs, nowMs: nowMs() });

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
    nudge: suggestion?.nudge,
  };
}
