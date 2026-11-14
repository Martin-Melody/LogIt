import {
  goalTargetValue,
  projectGoal,
  type Goal,
  type GoalPoint,
  type GoalProjection,
  type GoalSeries,
} from "./goals";
import { isoToUtcMs } from "./dateIso";
import { formatWeight, type WeightUnit } from "./units";
import type { NutritionGoal, WeightEntry } from "./nutrition";
import { smoothWeightSeries } from "../nutrition/trend";

/**
 * Everything a goal card or chart needs: the logged history as points, where it started,
 * whether it's done, and the projection. Bodyweight comes in as a goal too (key
 * "bodyweight"), read from the nutrition goal's target weight. Pure: the phone and the web
 * dashboard each load the series their own way and build the view here.
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

export function goalMeasure(goal: Goal): string {
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

/** A goal's view from its series (see goals.ts: liftGoalSeries / repsGoalSeries / countGoalSeries). */
export function goalViewFromSeries(goal: Goal, series: GoalSeries, nowMs = Date.now(), title = ""): GoalView {
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
    title,
    measure: goalMeasure(goal),
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
export function bodyweightGoalView(
  goal: Pick<NutritionGoal, "targetWeightKg" | "goalType"> | null,
  entries: WeightEntry[],
  nowMs = Date.now(),
): GoalView | null {
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
