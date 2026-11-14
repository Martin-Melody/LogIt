import {
  countGoalSeries,
  liftGoalSeries,
  repsGoalSeries,
  type Goal,
  type GoalSeries,
} from "@logit/core/domain/goals";
import {
  bodyweightGoalView,
  goalTitle,
  goalViewFromSeries,
  type GoalView,
} from "@logit/core/domain/goalView";
import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
import { isoToUtcMs } from "@logit/core/domain/dateIso";
import type { WeightUnit } from "@logit/core/domain/units";
import { getExerciseRepo, getNutritionRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { loadVolumeContext, sessionVolumeKg } from "$lib/features/bodyweight/bodyweight";

/**
 * Loads what a goal card or chart needs from this device's data. The view itself is built
 * in core (domain/goalView.ts), shared with the web dashboard.
 */

export { BODYWEIGHT_GOAL_KEY, goalTitle, type GoalUnit, type GoalView } from "@logit/core/domain/goalView";

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
  return goalViewFromSeries(goal, await seriesFor(goal, cache), nowMs);
}

/** The nutrition goal's target weight as a goal, or null when there isn't one. */
export async function loadBodyweightGoalView(nowMs = Date.now()): Promise<GoalView | null> {
  const repo = getNutritionRepo();
  const [goal, entries] = await Promise.all([repo.getGoal().catch(() => null), repo.listWeightEntries().catch(() => [])]);
  return bodyweightGoalView(goal, entries, nowMs);
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
