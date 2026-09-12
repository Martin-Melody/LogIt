import type { ProgressStatus, ProgressionNudge } from "../../domain/progression";
import { classifyTrend, exerciseKey } from "../../domain/progression";
import type { Reasoning } from "../../domain/reasoning";
import { nowMs } from "../../domain/time";
import type { AnalyticsSeries } from "../../domain/analytics";
import type { MuscleGroup } from "../../domain/exercise";
import { isWithinTrainingBlockTag } from "../../domain/trainingBlockTag";
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
  /** §10.3.2 plateau-diagnosis orchestration — once linear-progression's
   * rep-range ladder (§10.3.1) is exhausted with no real difference found,
   * surfaces the remaining hypotheses worth trying next (muscle-group
   * volume/frequency, §5; nutrition timing, §9) rather than deciding for
   * the user which one to run — Martin's "present options, don't impose an
   * order" decision. Undefined until the ladder actually reaches its cap;
   * the UI decides where each option actually links to. */
  plateauNextSteps?: { muscleGroup?: MuscleGroup };
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

// §10.3.3 tag training blocks — the general form of the same idea: any point
// falling inside a user-tagged window is excluded from the outer trend the
// same way a rep-range regime-change point is, just user-declared rather than
// algorithm-derived. Counted separately from excludedForRegimeChange so the
// "Why?" view can say *why* a point was dropped, not just that it was.
function computeTaggedComparable(
  points: { date: number }[],
  tags: { startMs: number; endMs?: number }[],
): { comparable: (boolean | undefined)[]; excludedCount: number } {
  let excludedCount = 0;
  const comparable = points.map((p) => {
    const tagged = tags.some((t) => isWithinTrainingBlockTag(p.date, t));
    if (tagged) excludedCount += 1;
    return tagged ? false : undefined;
  });
  return { comparable, excludedCount };
}

// classifyTrend treats anything other than exactly `false` as "keep" — so
// combining two independent exclusion sources is just "false wins".
function combineComparable(
  a: (boolean | undefined)[] | undefined,
  b: (boolean | undefined)[] | undefined,
  length: number,
): (boolean | undefined)[] | undefined {
  if (!a && !b) return undefined;
  return Array.from({ length }, (_, i) => (a?.[i] === false || b?.[i] === false ? false : undefined));
}

// §10.3.2 — must match linearProgression.ts's MAX_LADDER_RUNGS (bespoke read,
// same known v1 scope boundary as everything else in this file that peeks at
// linear-progression's own state shape). The ladder gives up once every rung
// up to the cap concluded without a win — that's the "cheapest test
// exhausted" trigger the plateau-diagnosis orchestration watches for.
const REP_RANGE_LADDER_CAP = 3;

function isRepRangeLadderExhausted(ladder: LinearTrialState["repRangeLadder"] | undefined): boolean {
  if (!ladder || ladder.length < REP_RANGE_LADDER_CAP) return false;
  return ladder.every((r) => r.status === "concluded" && r.result?.switched === false);
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
  const regimeComparable = computeComparableToCurrent(points, ladder);

  const tags = await deps.trainingBlockTagRepo.listForExercise(exerciseKey(exercise));
  const { comparable: taggedComparable, excludedCount: excludedForTaggedBlock } = computeTaggedComparable(points, tags);

  const comparableToCurrent = combineComparable(regimeComparable, taggedComparable, points.length);
  const trend = classifyTrend({ values, sessionPositions, comparableToCurrent, lastTrainedMs, nowMs: nowMs() });
  const trendReasoning: Reasoning =
    excludedForTaggedBlock > 0
      ? { ...trend.reasoning, inputs: { ...trend.reasoning.inputs, excludedForTaggedBlock } }
      : trend.reasoning;

  // Last PR in the primary series.
  let runningMax = -Infinity;
  let lastPrIdx = -1;
  values.forEach((v, i) => {
    if (v > runningMax) { runningMax = v; lastPrIdx = i; }
  });

  const def = analytics.metricDefinitions.find((d) => d.id === primary.metricId);
  const headlineMetric = analytics.output.metrics.find((m) => m.id === primary.metricId)
    ?? analytics.output.metrics[0];

  let plateauNextSteps: ExerciseProgressStory["plateauNextSteps"];
  if (isRepRangeLadderExhausted(ladder)) {
    const data = exercise.id
      ? await deps.exerciseRepo.getById(exercise.id)
      : await deps.exerciseRepo.getByName(exercise.name);
    plateauNextSteps = { muscleGroup: data?.primaryMuscles?.[0] };
  }

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
    trendReasoning,
    suggestionReasoning: suggestion?.reasoning,
    nudge: suggestion?.nudge,
    plateauNextSteps,
  };
}
