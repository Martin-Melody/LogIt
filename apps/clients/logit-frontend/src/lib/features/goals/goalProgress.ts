import {
  countGoalSeries,
  goalTargetValue,
  liftGoalSeries,
  projectGoal,
  repsGoalSeries,
  type Goal,
  type GoalPoint,
  type GoalProjection,
  type GoalSeries,
} from "@logit/core/domain/goals";
import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
import { smoothWeightSeries } from "@logit/core/nutrition/trend";
import { isoToUtcMs } from "@logit/core/domain/dateIso";
import { formatWeight, type WeightUnit } from "@logit/core/domain/units";
import { getExerciseRepo, getNutritionRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { loadVolumeContext, sessionVolumeKg } from "$lib/features/bodyweight/bodyweight";

/**
 * Everything a goal card or chart needs: the logged history as points, where it started,
 * whether it's done, and the projection. Bodyweight comes in as a goal too (key
 * "bodyweight"), read from the nutrition goal's target weight.
 */

export type GoalUnit = "kg" | "reps" | "sessions" | "bodyweight";

export type GoalView = {
  key: string;
  /** null for the bodyweight goal, which lives on the nutrition goal. */
  goal: Goal | null;
  title: string;
  /** What's tracked, e.g. "Best estimate for 1 rep each session". */
  measure: string;
  unit: GoalUnit;
  target: number;
  direction: 1 | -1;
  /** The value when the goal was set (or the first logged one after). */
  start: number | null;
  points: GoalPoint[];
  achievedAtMs: number | null;
  projection: GoalProjection;
  deadlineMs: number | null;
  /** 0–1 along the way from start to target. */
  progress: number;
  /** Exercise link, when there is one. */
  exerciseId?: string;
};

export const BODYWEIGHT_GOAL_KEY = "bodyweight";

function startValue(points: GoalPoint[], sinceMs: number): number | null {
  if (points.length === 0) return null;
  let before: GoalPoint | null = null;
  for (const p of points) if (p.tMs <= sinceMs) before = p;
  return (before ?? points[0]!).value;
}

function progressOf(start: number | null, current: number | null, target: number, achieved: boolean): number {
  if (achieved) return 1;
  if (start == null || current == null || start === target) return 0;
  return Math.max(0, Math.min(1, (current - start) / (target - start)));
}

export function goalTitle(goal: Goal, unit: WeightUnit): string {
  const t = goal.target;
  switch (t.type) {
    case "lift":
      return `${t.exerciseName} ${formatWeight(t.weightKg, unit)}${t.reps > 1 ? ` × ${t.reps}` : ""}`;
    case "reps":
      return `${t.exerciseName} × ${t.reps} in one set`;
    case "count":
      return t.metric === "sessions"
        ? `${t.target} workouts`
        : `${formatWeight(t.target, unit, { withUnit: false })} ${unit} lifted`;
  }
}

function measureOf(goal: Goal): string {
  const t = goal.target;
  switch (t.type) {
    case "lift":
      return t.reps === 1 ? "Estimated 1-rep max each session" : `Estimated best for ${t.reps} reps each session`;
    case "reps":
      return "Most reps in one set each session";
    case "count":
      return `Total since ${new Date(isoToUtcMs(t.startIso)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  }
}

async function seriesFor(
  goal: Goal,
  cache: { sessions?: Promise<{ tMs: number; volumeKg: number }[]> },
): Promise<GoalSeries> {
  const t = goal.target;
  if (t.type === "count") {
    cache.sessions ??= Promise.all([getWorkoutRepo().listAllSessions(), loadVolumeContext().catch(() => null)]).then(
      ([sessions, ctx]) =>
        sessions
          .filter((s) => s.endedAtMs != null)
          .map((s) => ({ tMs: s.endedAtMs ?? s.startedAtMs, volumeKg: sessionVolumeKg(s, ctx) })),
    );
    return countGoalSeries(await cache.sessions, { metric: t.metric, target: t.target, startMs: isoToUtcMs(t.startIso) });
  }
  const { history } = await getExerciseHistory(
    { id: t.exerciseId, name: t.exerciseName },
    { workoutRepo: getWorkoutRepo(), exerciseRepo: getExerciseRepo() },
    { includeExcluded: true },
  );
  return t.type === "lift" ? liftGoalSeries(history, t) : repsGoalSeries(history, t);
}

export async function loadGoalView(goal: Goal, nowMs = Date.now(), cache = {}): Promise<GoalView> {
  const series = await seriesFor(goal, cache);
  const target = goalTargetValue(goal.target);
  const deadlineMs = goal.deadlineIso ? isoToUtcMs(goal.deadlineIso) : null;
  const isCount = goal.target.type === "count";
  const projection = projectGoal(series.points, {
    target,
    nowMs,
    achieved: series.achievedAtMs != null,
    deadlineMs,
    // A running total: the last 8 weeks say more about the pace than a quarter does.
    ...(isCount ? { windowDays: 56, minPoints: 3 } : {}),
  });
  const start = isCount ? 0 : startValue(series.points, goal.createdAtMs);
  const current = isCount ? (series.points.at(-1)?.value ?? 0) : (projection.current ?? series.points.at(-1)?.value ?? null);
  return {
    key: goal.id,
    goal,
    title: "",
    measure: measureOf(goal),
    unit: series.unit,
    target,
    direction: 1,
    start,
    points: series.points,
    achievedAtMs: series.achievedAtMs,
    projection,
    deadlineMs,
    progress: progressOf(start, current, target, series.achievedAtMs != null),
    exerciseId: goal.target.type === "count" ? undefined : goal.target.exerciseId,
  };
}

/** The nutrition goal's target weight as a goal, or null when there isn't one. */
export async function loadBodyweightGoalView(nowMs = Date.now()): Promise<GoalView | null> {
  const repo = getNutritionRepo();
  const [goal, entries] = await Promise.all([repo.getGoal().catch(() => null), repo.listWeightEntries().catch(() => [])]);
  if (!goal?.targetWeightKg) return null;
  const trend = smoothWeightSeries(entries);
  // One point a week is plenty for the chart and the fit (the smoothing already ran daily).
  const points: GoalPoint[] = trend.points
    .filter((_, i, all) => i % 7 === (all.length - 1) % 7)
    .map((p) => ({ tMs: isoToUtcMs(p.dateIso), value: p.smoothedKg }));
  const target = goal.targetWeightKg;
  const current = trend.currentKg;
  const direction: 1 | -1 =
    goal.goalType === "lose" ? -1 : goal.goalType === "gain" ? 1 : current != null && target < current ? -1 : 1;
  const achieved = current != null && (direction > 0 ? current >= target : current <= target);
  const projection = projectGoal(points, {
    target,
    nowMs,
    direction,
    achieved,
    windowDays: 42,
    minPoints: 3,
  });
  const first = points[0]?.value ?? null;
  return {
    key: BODYWEIGHT_GOAL_KEY,
    goal: null,
    title: "Bodyweight",
    measure: "Smoothed bodyweight trend",
    unit: "bodyweight",
    target,
    direction,
    start: first,
    points,
    achievedAtMs: achieved ? nowMs : null,
    projection,
    deadlineMs: null,
    progress: progressOf(first, current, target, achieved),
  };
}

export async function loadGoalViews(goals: Goal[], unit: WeightUnit, nowMs = Date.now()): Promise<GoalView[]> {
  const cache = {};
  const [views, bw] = await Promise.all([
    Promise.all(goals.map(async (g) => ({ ...(await loadGoalView(g, nowMs, cache)), title: goalTitle(g, unit) }))),
    loadBodyweightGoalView(nowMs).catch(() => null),
  ]);
  return bw ? [...views, bw] : views;
}

/** Goals first reached in the session that started at `sessionStartMs` (achievement is the
 * first time ever, so anything at or after the start was this session). */
export function reachedSince(views: GoalView[], sessionStartMs: number): GoalView[] {
  return views.filter((v) => v.goal && v.achievedAtMs != null && v.achievedAtMs >= sessionStartMs);
}

/** After a workout: an inbox item for each goal it reached. Never throws. */
export async function notifyGoalsReached(sessionStartMs: number, nowMs = Date.now()): Promise<void> {
  try {
    const [{ get }, { goalsStore, activeGoals }, { localInbox, goalNotifications }, { profile }] = await Promise.all([
      import("svelte/store"),
      import("./goalsStore"),
      import("$lib/features/inbox/localInbox"),
      import("$lib/stores/profile.store"),
    ]);
    const goals = activeGoals(get(goalsStore));
    if (goals.length === 0) return;
    const unit = (get(profile).weightUnit ?? "kg") as WeightUnit;
    const views = await Promise.all(
      goals.map(async (g) => ({ ...(await loadGoalView(g, nowMs)), title: goalTitle(g, unit) })),
    );
    const reached = reachedSince(views, sessionStartMs);
    localInbox.add(goalNotifications(reached.map((v) => ({ id: v.key, title: v.title, exerciseId: v.exerciseId })), nowMs));
  } catch {
    // A missed notification isn't worth failing the finish over.
  }
}
