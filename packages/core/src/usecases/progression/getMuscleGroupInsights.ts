import { getExercises } from "../../domain/workout";
import type { WorkoutSession, ExerciseEntry } from "../../domain/workout";
import type { MuscleGroup } from "../../domain/exercise";
import { classifyTrend, PROGRESS_STATUS_ATTENTION_ORDER, type ProgressStatus } from "../../domain/progression";
import type { Reasoning } from "../../domain/reasoning";
import type {
  MuscleGroupInsightContributingExercise,
  MuscleGroupInsightWeek,
  MuscleGroupVolumeInsight,
} from "../../domain/muscleGroupInsight";
import { weekBucket, nowMs } from "../../domain/time";
import { getExerciseAnalytics } from "./getExerciseAnalytics";
import { pickPrimarySeries } from "./getExerciseProgressStory";
import { DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID } from "./getMuscleGroupInsightConfig";
import type { ProgressionDeps } from "./deps";

// A secondary-muscle set counts for 40% of a primary one — same convention as
// computeFatigueScore (linearProgression.ts): assistive load, not maximal.
const SECONDARY_MUSCLE_WEIGHT = 0.4;

export type MuscleGroupContributingExercise = {
  exerciseId?: string;
  exerciseName: string;
  status: ProgressStatus;
};

export type { MuscleGroupVolumeInsight };

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

function worstStatus(statuses: ProgressStatus[]): ProgressStatus {
  for (const s of PROGRESS_STATUS_ATTENTION_ORDER) {
    if (statuses.includes(s)) return s;
  }
  return "new";
}

/**
 * Fetches every session, resolves muscle tags, and builds each muscle
 * group's weekly volume series + per-exercise trend statuses — the generic
 * plumbing a §5-option-B algorithm needs but shouldn't have to fetch itself
 * (the same role getSuggestion.ts/getMobilitySuggestion.ts play for their
 * families). What the resolved series actually *means* — is there a real
 * volume/frequency correlation, and how confident is that — is delegated to
 * whichever `MuscleGroupInsightAlgorithm` is configured
 * (adaptive-progression-engine.md §5 option B), not decided here.
 */
export async function getMuscleGroupInsights(
  deps: Pick<
    ProgressionDeps,
    "workoutRepo" | "exerciseRepo" | "progressionRepo" | "analyticsRegistry" | "muscleGroupInsightAlgorithmRegistry"
  >,
): Promise<MuscleGroupInsightsResult> {
  const sessions: WorkoutSession[] = await deps.workoutRepo.listAllSessions();

  const config = await deps.progressionRepo.getMuscleGroupInsightConfig();
  const algorithmId = config?.algorithmId ?? DEFAULT_MUSCLE_GROUP_INSIGHT_ALGORITHM_ID;
  const algorithm = await deps.muscleGroupInsightAlgorithmRegistry.get(algorithmId);

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

    const weeksSorted = [...weekMap.entries()].sort((a, b) => a[0] - b[0]);
    const weeksWithData = weeksSorted.length;
    const currentWeekSets = Math.round((weekMap.get(currentWeek)?.weightedSets ?? 0) * 10) / 10;
    const avgWeeklySets =
      Math.round((weeksSorted.reduce((s, [, v]) => s + v.weightedSets, 0) / weeksWithData) * 10) / 10;
    const avgWeeklyFrequency =
      Math.round((weeksSorted.reduce((s, [, v]) => s + v.sessionIds.size, 0) / weeksWithData) * 10) / 10;

    // Per-exercise trend, reusing the same analytics + classifier the exercise's own
    // page uses — feeds both this group's status and, via seriesPoints, whatever the
    // configured algorithm wants to correlate volume against.
    const contributingExercises: MuscleGroupInsightContributingExercise[] = [];

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
        seriesPoints: points.map((p) => ({ date: p.date, value: p.value })),
      });
    }

    if (contributingExercises.length === 0) continue;

    const status = worstStatus(contributingExercises.map((c) => c.status));

    const weeks: MuscleGroupInsightWeek[] = weeksSorted.map(([bucket, v]) => ({
      weekBucket: bucket,
      weightedSets: v.weightedSets,
      sessionCount: v.sessionIds.size,
    }));

    // Delegates "what does this volume pattern mean" to the configured algorithm
    // (§5 option B) — see adaptive-progression-engine.md §5.1: deliberately not a
    // fixed formula, silent unless there's real support for a claim. v1's built-in
    // is stateless (recomputes fresh from `weeks`/`contributingExercises` every
    // call), so nextState isn't persisted here yet — tracked for whenever an
    // algorithm actually needs cross-call memory.
    const output = algorithm
      ? await algorithm.analyze({
          muscleGroup: group,
          weeks,
          contributingExercises,
          state: null,
          userPreferences: {},
          now: nowMs(),
        })
      : null;

    insights.push({
      muscleGroup: group,
      currentWeekSets,
      avgWeeklySets,
      avgWeeklyFrequency,
      weeksWithData,
      status,
      contributingExercises: contributingExercises.map(({ exerciseId, exerciseName, status: s }) => ({
        exerciseId,
        exerciseName,
        status: s,
      })),
      volumeInsight: output?.volumeInsight,
      reasoning: output?.reasoning ?? {
        inputs: { weeksWithData, contributingExerciseCount: contributingExercises.length },
        computed: { currentWeekSets, avgWeeklySets, avgWeeklyFrequency },
        confidence: "low",
        verdict: "no muscle-group-insight algorithm configured",
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
