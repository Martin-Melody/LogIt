import { getExercises } from "../../domain/workout";
import type { WorkoutSession, ExerciseEntry } from "../../domain/workout";
import type { MuscleGroup } from "../../domain/exercise";
import { classifyTrend, PROGRESS_STATUS_ATTENTION_ORDER, type ProgressStatus } from "../../domain/progression";
import type { Reasoning, ReasoningConfidence } from "../../domain/reasoning";
import { weekBucket, nowMs } from "../../domain/time";
import { getExerciseAnalytics } from "./getExerciseAnalytics";
import { pickPrimarySeries } from "./getExerciseProgressStory";
import type { ProgressionDeps } from "./deps";

// A secondary-muscle set counts for 40% of a primary one — same convention as
// computeFatigueScore (linearProgression.ts): assistive load, not maximal.
const SECONDARY_MUSCLE_WEIGHT = 0.4;

// Correlation (the "suggested range" part of this insight) only runs with real
// support behind it — see docs/architecture/adaptive-progression-engine.md §5.
const MIN_WEEKS_FOR_CORRELATION = 8;
const MIN_SAMPLES_PER_BUCKET = 4;
const HIGH_CONFIDENCE_SAMPLES_PER_BUCKET = 8;
const IMPROVE_RATE_DIFF_THRESHOLD = 0.15; // 15 percentage points

export type MuscleGroupContributingExercise = {
  exerciseId?: string;
  exerciseName: string;
  status: ProgressStatus;
};

export type MuscleGroupVolumeInsight = {
  direction: "higher" | "lower"; // which side of thresholdSets correlates with more improved sessions
  thresholdSets: number; // the median weekly volume the split was made at
  improveRateAbove: number; // 0-1
  improveRateBelow: number; // 0-1
};

export type MuscleGroupInsight = {
  muscleGroup: MuscleGroup;
  currentWeekSets: number;
  avgWeeklySets: number;
  avgWeeklyFrequency: number; // sessions/week, averaged over weeks with any activity
  weeksWithData: number;
  status: ProgressStatus; // worst-of the contributing (primary-tagged) exercises
  contributingExercises: MuscleGroupContributingExercise[];
  volumeInsight?: MuscleGroupVolumeInsight;
  reasoning: Reasoning;
};

export type MuscleGroupInsightsResult = {
  insights: MuscleGroupInsight[];
  /** Share (0-1) of all working sets in history that came from exercises with no
   * primary or secondary muscle tags at all — those sets aren't reflected in any
   * group above. See adaptive-progression-engine.md §5.4. */
  untaggedSetsShare: number;
};

type WeekAgg = { weightedSets: number; sessionIds: Set<string> };
type ExerciseRef = { exerciseId?: string; exerciseName: string };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function worstStatus(statuses: ProgressStatus[]): ProgressStatus {
  for (const s of PROGRESS_STATUS_ATTENTION_ORDER) {
    if (statuses.includes(s)) return s;
  }
  return "new";
}

export async function getMuscleGroupInsights(
  deps: Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo" | "progressionRepo" | "analyticsRegistry">,
): Promise<MuscleGroupInsightsResult> {
  const sessions: WorkoutSession[] = await deps.workoutRepo.listAllSessions();

  // Resolve each distinct exercise's muscle tags exactly once, however many
  // sessions it appears in.
  const exerciseCache = new Map<
    string,
    { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] } | null
  >();

  async function resolveMuscles(ex: ExerciseEntry) {
    const key = ex.exerciseId ?? ex.exerciseName.toLowerCase();
    if (exerciseCache.has(key)) return exerciseCache.get(key)!;
    const data = ex.exerciseId
      ? await deps.exerciseRepo.getById(ex.exerciseId)
      : await deps.exerciseRepo.getByName(ex.exerciseName);
    const resolved = data ? { primaryMuscles: data.primaryMuscles, secondaryMuscles: data.secondaryMuscles } : null;
    exerciseCache.set(key, resolved);
    return resolved;
  }

  const byGroupByWeek = new Map<MuscleGroup, Map<number, WeekAgg>>();
  const exercisesByGroup = new Map<MuscleGroup, Map<string, ExerciseRef>>();

  let totalWorkingSets = 0;
  let untaggedWorkingSets = 0;

  for (const session of sessions) {
    if (session.excludeFromProgression) continue;
    const performedAtMs = session.endedAtMs ?? session.startedAtMs;
    const week = weekBucket(performedAtMs);

    for (const ex of getExercises(session)) {
      const workingSets = ex.sets.filter(
        (s) => (s.setType === "normal" || !s.setType) && s.completed !== false,
      );
      if (workingSets.length === 0) continue;
      totalWorkingSets += workingSets.length;

      const muscles = await resolveMuscles(ex);
      const primary = muscles?.primaryMuscles ?? [];
      const secondary = muscles?.secondaryMuscles ?? [];
      if (primary.length === 0 && secondary.length === 0) {
        untaggedWorkingSets += workingSets.length;
        continue;
      }

      const key = ex.exerciseId ?? ex.exerciseName.toLowerCase();
      const ref: ExerciseRef = { exerciseId: ex.exerciseId, exerciseName: ex.exerciseName };

      for (const group of primary) {
        addWeek(byGroupByWeek, group, week, workingSets.length, session.id);
        addExercise(exercisesByGroup, group, key, ref);
      }
      for (const group of secondary) {
        addWeek(byGroupByWeek, group, week, workingSets.length * SECONDARY_MUSCLE_WEIGHT, session.id);
        // Deliberately not added to exercisesByGroup — trend/correlation below only
        // uses primary-tagged exercises, so "chest is plateaued" always points at an
        // exercise that's actually a chest exercise, not one that incidentally taxes it.
      }
    }
  }

  const untaggedSetsShare = totalWorkingSets > 0 ? untaggedWorkingSets / totalWorkingSets : 0;
  const currentWeek = weekBucket(nowMs());
  const insights: MuscleGroupInsight[] = [];

  for (const [group, weekMap] of byGroupByWeek) {
    // Groups that only ever showed up as a secondary muscle have volume data but no
    // primary-tagged exercise to attribute a trend/status to — skip rather than guess.
    const exerciseRefs = exercisesByGroup.get(group);
    if (!exerciseRefs || exerciseRefs.size === 0) continue;

    const weeks = [...weekMap.entries()].sort((a, b) => a[0] - b[0]);
    const weeksWithData = weeks.length;
    const currentWeekSets = Math.round((weekMap.get(currentWeek)?.weightedSets ?? 0) * 10) / 10;
    const avgWeeklySets =
      Math.round((weeks.reduce((s, [, v]) => s + v.weightedSets, 0) / weeksWithData) * 10) / 10;
    const avgWeeklyFrequency =
      Math.round((weeks.reduce((s, [, v]) => s + v.sessionIds.size, 0) / weeksWithData) * 10) / 10;

    // Per-exercise trend, reusing the same analytics + classifier the exercise's own
    // page uses — and the exercise-level primary series, kept around for the volume
    // correlation below.
    const contributingExercises: MuscleGroupContributingExercise[] = [];
    const exerciesSeries: { points: { date: number; value: number; sessionPosition?: number }[] }[] = [];

    for (const ref of exerciseRefs.values()) {
      const analytics = await getExerciseAnalytics({ id: ref.exerciseId, name: ref.exerciseName }, deps);
      const primarySeries = analytics ? pickPrimarySeries(analytics.output.series) : undefined;
      if (!primarySeries || primarySeries.points.length === 0) continue;

      const points = [...primarySeries.points].sort((a, b) => a.date - b.date);
      const values = points.map((p) => p.value);
      const sessionPositions = points.map((p) => p.sessionPosition);
      const trend = classifyTrend({
        values,
        sessionPositions,
        lastTrainedMs: points[points.length - 1]!.date,
        nowMs: nowMs(),
      });

      contributingExercises.push({
        exerciseId: ref.exerciseId,
        exerciseName: ref.exerciseName,
        status: trend.status,
      });
      exerciesSeries.push({ points });
    }

    if (contributingExercises.length === 0) continue;

    const status = worstStatus(contributingExercises.map((c) => c.status));

    // Volume correlation: does this muscle group's weekly volume tend to be higher
    // or lower in weeks where its exercises' sessions improved on the one before?
    // See adaptive-progression-engine.md §5 — deliberately not a fixed formula, and
    // deliberately silent unless there's real support for a claim.
    let volumeInsight: MuscleGroupVolumeInsight | undefined;
    let confidence: ReasoningConfidence = "low";
    let correlationVerdict = "not enough weeks of varied training yet to tell what volume works best";
    let samplesAbove = 0;
    let samplesBelow = 0;
    let improvedAbove = 0;
    let improvedBelow = 0;

    if (weeksWithData >= MIN_WEEKS_FOR_CORRELATION) {
      const thresholdSets = median(weeks.map(([, v]) => v.weightedSets));

      for (const { points } of exerciesSeries) {
        for (let i = 1; i < points.length; i++) {
          const improved = points[i]!.value > points[i - 1]!.value;
          const weekOfPoint = weekBucket(points[i]!.date);
          const setsThatWeek = weekMap.get(weekOfPoint)?.weightedSets ?? 0;
          if (setsThatWeek >= thresholdSets) {
            samplesAbove++;
            if (improved) improvedAbove++;
          } else {
            samplesBelow++;
            if (improved) improvedBelow++;
          }
        }
      }

      if (samplesAbove >= MIN_SAMPLES_PER_BUCKET && samplesBelow >= MIN_SAMPLES_PER_BUCKET) {
        const rateAbove = improvedAbove / samplesAbove;
        const rateBelow = improvedBelow / samplesBelow;
        const diff = rateAbove - rateBelow;

        if (Math.abs(diff) >= IMPROVE_RATE_DIFF_THRESHOLD) {
          volumeInsight = {
            direction: diff > 0 ? "higher" : "lower",
            thresholdSets: Math.round(thresholdSets * 10) / 10,
            improveRateAbove: Math.round(rateAbove * 100) / 100,
            improveRateBelow: Math.round(rateBelow * 100) / 100,
          };
          confidence =
            samplesAbove >= HIGH_CONFIDENCE_SAMPLES_PER_BUCKET && samplesBelow >= HIGH_CONFIDENCE_SAMPLES_PER_BUCKET
              ? "high"
              : "medium";
          correlationVerdict = `sessions tend to improve more in weeks with ${diff > 0 ? "≥" : "<"}${volumeInsight.thresholdSets} sets`;
        } else {
          correlationVerdict = "enough data, but no clear volume pattern found yet";
        }
      } else {
        correlationVerdict = "not enough varied-volume weeks yet to compare";
      }
    }

    insights.push({
      muscleGroup: group,
      currentWeekSets,
      avgWeeklySets,
      avgWeeklyFrequency,
      weeksWithData,
      status,
      contributingExercises,
      volumeInsight,
      reasoning: {
        inputs: {
          weeksWithData,
          contributingExerciseCount: contributingExercises.length,
          volumeCorrelationSamplesAbove: samplesAbove,
          volumeCorrelationSamplesBelow: samplesBelow,
          minWeeksRequired: MIN_WEEKS_FOR_CORRELATION,
        },
        computed: {
          currentWeekSets,
          avgWeeklySets,
          avgWeeklyFrequency,
          ...(volumeInsight
            ? {
                thresholdSets: volumeInsight.thresholdSets,
                improveRateAbovePct: Math.round(volumeInsight.improveRateAbove * 100),
                improveRateBelowPct: Math.round(volumeInsight.improveRateBelow * 100),
              }
            : {}),
        },
        confidence,
        verdict: correlationVerdict,
      },
    });
  }

  return { insights, untaggedSetsShare };
}

function addWeek(
  map: Map<MuscleGroup, Map<number, WeekAgg>>,
  group: MuscleGroup,
  week: number,
  sets: number,
  sessionId: string,
): void {
  let weekMap = map.get(group);
  if (!weekMap) {
    weekMap = new Map();
    map.set(group, weekMap);
  }
  let agg = weekMap.get(week);
  if (!agg) {
    agg = { weightedSets: 0, sessionIds: new Set() };
    weekMap.set(week, agg);
  }
  agg.weightedSets += sets;
  agg.sessionIds.add(sessionId);
}

function addExercise(
  map: Map<MuscleGroup, Map<string, ExerciseRef>>,
  group: MuscleGroup,
  key: string,
  ref: ExerciseRef,
): void {
  let group_ = map.get(group);
  if (!group_) {
    group_ = new Map();
    map.set(group, group_);
  }
  if (!group_.has(key)) group_.set(key, ref);
}
