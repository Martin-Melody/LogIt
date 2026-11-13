import { estimated1RM } from "./oneRepMax";
import type { ExerciseHistoryEntry } from "./progression";
import type { SetEntry } from "./workout";

/**
 * Goals the lifter sets for themself, and how far along they are. A goal stores only what
 * it aims for; progress and whether it's done are worked out from the logs every time, so
 * editing an old session or deleting one can't leave a goal out of date.
 *
 * Bodyweight isn't a goal kind here: the target weight already lives on the nutrition goal
 * and the Goals screen shows that one, so there's one place to change it.
 */

export type GoalTarget =
  /** Lift `weightKg` for `reps` in one working set (e.g. bench 100 × 1, squat 140 × 5). */
  | { type: "lift"; exerciseId?: string; exerciseName: string; weightKg: number; reps: number }
  /** `reps` in one set, any load (20 pull-ups). */
  | { type: "reps"; exerciseId?: string; exerciseName: string; reps: number }
  /** A running total from `startIso`: workouts done or kg lifted. */
  | { type: "count"; metric: "sessions" | "volume"; target: number; startIso: string };

export type GoalType = GoalTarget["type"];

export type Goal = {
  id: string;
  target: GoalTarget;
  /** Optional "by" date, YYYY-MM-DD. */
  deadlineIso?: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number | null;
};

export type GoalPoint = { tMs: number; value: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Sets past this many reps don't say much about a heavy single, so they're left out of lift
 * estimates (they still count for an actual hit). */
export const MAX_REPS_FOR_ESTIMATE = 12;

function isWorkingSet(s: SetEntry): boolean {
  return (s.setType === "normal" || !s.setType) && s.completed !== false && s.reps > 0;
}

/** What a set of `reps` × `weightKg` suggests you could do for `targetReps` (Epley). */
export function estimateWeightForReps(weightKg: number, reps: number, targetReps: number): number {
  if (reps === targetReps) return weightKg;
  const oneRm = estimated1RM(weightKg, reps);
  return targetReps <= 1 ? oneRm : oneRm / (1 + targetReps / 30);
}

export type GoalSeries = {
  points: GoalPoint[];
  /** When the goal was first actually met (a logged set, not an estimate), or null. */
  achievedAtMs: number | null;
  unit: "kg" | "reps" | "sessions";
};

function entryTime(e: ExerciseHistoryEntry): number {
  return e.performedAtMs;
}

/** Per session: the best estimated weight for the goal's rep count. */
export function liftGoalSeries(
  history: ExerciseHistoryEntry[],
  goal: { weightKg: number; reps: number },
): GoalSeries {
  const points: GoalPoint[] = [];
  let achievedAtMs: number | null = null;
  for (const e of [...history].sort((a, b) => entryTime(a) - entryTime(b))) {
    let best: number | null = null;
    for (const s of e.sets) {
      if (!isWorkingSet(s) || !(s.weight > 0)) continue;
      if (achievedAtMs == null && s.weight >= goal.weightKg && s.reps >= goal.reps) achievedAtMs = entryTime(e);
      if (s.reps > MAX_REPS_FOR_ESTIMATE && s.reps !== goal.reps) continue;
      const est = estimateWeightForReps(s.weight, s.reps, goal.reps);
      if (best == null || est > best) best = est;
    }
    if (best != null) points.push({ tMs: entryTime(e), value: Math.round(best * 10) / 10 });
  }
  return { points, achievedAtMs, unit: "kg" };
}

/** Per session: the most reps in one working set. */
export function repsGoalSeries(history: ExerciseHistoryEntry[], goal: { reps: number }): GoalSeries {
  const points: GoalPoint[] = [];
  let achievedAtMs: number | null = null;
  for (const e of [...history].sort((a, b) => entryTime(a) - entryTime(b))) {
    const reps = e.sets.filter(isWorkingSet).map((s) => s.reps);
    if (reps.length === 0) continue;
    const best = Math.max(...reps);
    if (achievedAtMs == null && best >= goal.reps) achievedAtMs = entryTime(e);
    points.push({ tMs: entryTime(e), value: best });
  }
  return { points, achievedAtMs, unit: "reps" };
}

/** Running total from `startMs`: one point per session with the total after it. */
export function countGoalSeries(
  sessions: { tMs: number; volumeKg: number }[],
  goal: { metric: "sessions" | "volume"; target: number; startMs: number },
): GoalSeries {
  const points: GoalPoint[] = [{ tMs: goal.startMs, value: 0 }];
  let total = 0;
  let achievedAtMs: number | null = null;
  for (const s of [...sessions].sort((a, b) => a.tMs - b.tMs)) {
    if (s.tMs < goal.startMs) continue;
    total += goal.metric === "sessions" ? 1 : s.volumeKg;
    if (achievedAtMs == null && total >= goal.target) achievedAtMs = s.tMs;
    points.push({ tMs: s.tMs, value: Math.round(total * 10) / 10 });
  }
  return { points, achievedAtMs, unit: goal.metric === "sessions" ? "sessions" : "kg" };
}

// ── Projection ──────────────────────────────────────────────────────────────

export type GoalStatus =
  /** Done: a logged set (or the total) met it. */
  | "achieved"
  /** The estimate is already at the target but the set hasn't been done yet. */
  | "ready"
  /** Moving toward it; `eta` has dates. */
  | "on_track"
  /** Flat or going the wrong way over the recent window. */
  | "stalled"
  | "not_enough_data";

export type GoalProjection = {
  status: GoalStatus;
  /** Where the trend line says you are today. */
  current: number | null;
  /** Units per week, signed. */
  ratePerWeek: number | null;
  eta: {
    likelyMs: number;
    /** At the faster pace you've shown. */
    earlyMs: number;
    /** At the slower pace, or null when that pace never gets there (or not within the horizon). */
    lateMs: number | null;
  } | null;
  /** Where the trend would be on the deadline, when there is one. */
  atDeadline: number | null;
  /** Fitted line from today to the likely date (or the chart's end when stalled). */
  line: GoalPoint[];
  /** Likely range from today, as low/high per point. */
  band: { tMs: number; low: number; high: number }[];
};

export type ProjectOptions = {
  target: number;
  nowMs: number;
  /** Trend over this many recent days (default 12 weeks). */
  windowDays?: number;
  /** Need at least this many points to say anything (default 4). */
  minPoints?: number;
  /** Don't promise dates further out than this (default 2 years). */
  horizonDays?: number;
  deadlineMs?: number | null;
  /** Already done (from the series). */
  achieved?: boolean;
  /** Which way the goal goes: up (default; lifts, reps, totals) or down (a weight cut). */
  direction?: 1 | -1;
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Theil–Sen line through the points: the median of all pairwise slopes, so one off day
 * (or a deload week) barely moves it, unlike least squares. The 25th/75th percentile
 * slopes give the "faster / slower pace you've shown" range.
 */
export function robustTrend(points: GoalPoint[]): {
  slopePerMs: number;
  slowPerMs: number;
  fastPerMs: number;
  valueAt: (tMs: number) => number;
} | null {
  if (points.length < 2) return null;
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dt = points[j]!.tMs - points[i]!.tMs;
      // Two sessions within a few hours say nothing about a weekly rate.
      if (Math.abs(dt) < DAY_MS / 2) continue;
      slopes.push((points[j]!.value - points[i]!.value) / dt);
    }
  }
  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);
  const m = quantile(slopes, 0.5);
  const intercepts = points.map((p) => p.value - m * p.tMs).sort((a, b) => a - b);
  const b = quantile(intercepts, 0.5);
  return {
    slopePerMs: m,
    slowPerMs: quantile(slopes, 0.25),
    fastPerMs: quantile(slopes, 0.75),
    valueAt: (t) => b + m * t,
  };
}

/** The points the trend is fitted on: the recent window, widened to `minPoints` if sparse. */
export function recentPoints(points: GoalPoint[], nowMs: number, windowDays: number, minPoints: number): GoalPoint[] {
  const sorted = [...points].sort((a, b) => a.tMs - b.tMs);
  const inWindow = sorted.filter((p) => p.tMs >= nowMs - windowDays * DAY_MS);
  return inWindow.length >= minPoints ? inWindow : sorted.slice(-minPoints);
}

/**
 * How the goal is going and, if you keep going like this, when you'll get there. Works for
 * goals going down too (a weight cut): the direction comes from where the target sits
 * relative to today's trend value.
 */
export function projectGoal(points: GoalPoint[], opts: ProjectOptions): GoalProjection {
  const windowDays = opts.windowDays ?? 84;
  const minPoints = opts.minPoints ?? 4;
  const horizonMs = (opts.horizonDays ?? 730) * DAY_MS;
  const now = opts.nowMs;
  const empty: GoalProjection = {
    status: opts.achieved ? "achieved" : "not_enough_data",
    current: points.length ? points[points.length - 1]!.value : null,
    ratePerWeek: null,
    eta: null,
    atDeadline: null,
    line: [],
    band: [],
  };

  const fitOn = recentPoints(points, now, windowDays, minPoints);
  if (fitOn.length < minPoints) return empty;
  const trend = robustTrend(fitOn);
  if (!trend) return empty;

  // "Now" for a lift is the trend value today; a trend can't run ahead of the last
  // session by more than the time since it, which is already what valueAt does.
  const current = trend.valueAt(now);
  const ratePerWeek = trend.slopePerMs * WEEK_MS;
  const atDeadline = opts.deadlineMs != null && opts.deadlineMs > now ? trend.valueAt(opts.deadlineMs) : null;
  const base = { current, ratePerWeek, atDeadline };

  if (opts.achieved) return { ...empty, ...base, status: "achieved" };

  const dir = opts.direction ?? 1;
  const remaining = opts.target - current;
  if (dir > 0 ? current >= opts.target : current <= opts.target) {
    return { ...empty, ...base, status: "ready" };
  }

  // Slopes along the direction of travel: positive = getting closer.
  const toward = (perMs: number) => perMs * dir;
  const likely = toward(trend.slopePerMs);
  const fast = Math.max(toward(trend.fastPerMs), toward(trend.slowPerMs));
  const slow = Math.min(toward(trend.fastPerMs), toward(trend.slowPerMs));
  const dist = Math.abs(remaining);

  const endFor = (perMs: number) => (perMs > 0 ? now + dist / perMs : null);
  const likelyMs = endFor(likely);
  if (likelyMs == null || likelyMs - now > horizonMs) {
    // Not getting there at this pace. Still draw where the trend is heading.
    const end = now + Math.min(horizonMs, 26 * WEEK_MS);
    return {
      ...base,
      status: "stalled",
      eta: null,
      line: [{ tMs: now, value: current }, { tMs: end, value: trend.valueAt(end) }],
      band: [],
    };
  }

  const earlyMs = endFor(fast) ?? likelyMs;
  const lateRaw = endFor(slow);
  const lateMs = lateRaw != null && lateRaw - now <= horizonMs ? lateRaw : null;

  // Band out to the late date (or a bit past the likely one when the slow pace never gets there).
  const bandEnd = lateMs ?? Math.min(now + horizonMs, now + (likelyMs - now) * 1.5);
  const steps = 12;
  const band: GoalProjection["band"] = [];
  for (let i = 0; i <= steps; i++) {
    const t = now + ((bandEnd - now) * i) / steps;
    const a = current + dir * fast * (t - now);
    const b = current + dir * slow * (t - now);
    band.push({ tMs: t, low: Math.min(a, b), high: Math.max(a, b) });
  }

  return {
    ...base,
    status: "on_track",
    eta: { likelyMs, earlyMs: Math.min(earlyMs, likelyMs), lateMs },
    line: [{ tMs: now, value: current }, { tMs: likelyMs, value: opts.target }],
    band,
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────

/** The goal's target as one number, in the series' unit. */
export function goalTargetValue(target: GoalTarget): number {
  switch (target.type) {
    case "lift":
      return target.weightKg;
    case "reps":
      return target.reps;
    case "count":
      return target.target;
  }
}

export function createGoal(target: GoalTarget, opts: { id: string; nowMs: number; deadlineIso?: string | null }): Goal {
  return {
    id: opts.id,
    target,
    deadlineIso: opts.deadlineIso ?? null,
    createdAtMs: opts.nowMs,
    updatedAtMs: opts.nowMs,
    deletedAtMs: null,
  };
}

/** Same exercise: by id when both have one, otherwise by name (case-insensitive). */
export function sameExercise(a: { exerciseId?: string; exerciseName: string }, b: { id?: string; name: string }): boolean {
  if (a.exerciseId && b.id) return a.exerciseId === b.id;
  return a.exerciseName.trim().toLowerCase() === b.name.trim().toLowerCase();
}

/** Merge two goal lists (another device's and ours): per id, the newer edit wins. */
export function mergeGoals(local: Goal[], remote: Goal[]): Goal[] {
  const byId = new Map<string, Goal>();
  for (const g of [...local, ...remote]) {
    const cur = byId.get(g.id);
    if (!cur || g.updatedAtMs > cur.updatedAtMs) byId.set(g.id, g);
  }
  return [...byId.values()].sort((a, b) => a.createdAtMs - b.createdAtMs);
}
