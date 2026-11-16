import { addDays, daysBetween, weekStartIso } from "./dateIso";

/**
 * Training streak counted in weeks, not days. A week counts once the lifter has trained on
 * `weeklyTarget` different days in it; rest days never break anything. A week in progress
 * can only add to the streak, never break it. Paused days (injury, holiday) lower that
 * week's target pro rata, and a fully paused week is skipped: it neither counts nor breaks.
 *
 * Distinct days, not sessions, so a second workout on the same day doesn't fill a week.
 */

export type StreakPause = {
  id: string;
  /** First paused day, YYYY-MM-DD. */
  startIso: string;
  /** Last paused day (inclusive), or null while the pause is still on. */
  endIso: string | null;
};

/** The target from a week on (`fromIso` = that week's Monday). Changing the target only
 * applies from the week it was changed in, so raising it doesn't rewrite past weeks. */
export type TargetChange = { fromIso: string; target: number };

/** The target for the week starting `weekIso`: the latest change on or before it, else the
 * earliest one (weeks before any change), else `fallback`. */
export function targetForWeek(weekIso: string, history: TargetChange[] | undefined, fallback: number): number {
  if (!history || history.length === 0) return clampWeeklyTarget(fallback);
  const sorted = [...history].sort((a, b) => a.fromIso.localeCompare(b.fromIso));
  let t = sorted[0]!.target;
  for (const c of sorted) if (c.fromIso <= weekIso) t = c.target;
  return clampWeeklyTarget(t);
}

export type WeekResult = {
  startIso: string;
  done: number;
  /** Days needed this week after pauses. 0 = paused the whole week (skipped). */
  needed: number;
  outcome: "met" | "missed" | "skipped" | "in_progress";
};

export type WeeklyStreak = {
  currentWeeks: number;
  bestWeeks: number;
  thisWeek: WeekResult;
  /** Today is inside a pause. */
  pausedNow: boolean;
  weeklyTarget: number;
};

export const DEFAULT_WEEKLY_TARGET = 3;
export const MAX_WEEKLY_TARGET = 7;

export function clampWeeklyTarget(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WEEKLY_TARGET;
  return Math.min(MAX_WEEKLY_TARGET, Math.max(1, Math.round(n)));
}

/**
 * A new weekly target, recorded from this week on: past weeks keep the target they had, and
 * changing it twice in one week keeps the last. Returns the new target and history.
 */
export function withWeeklyTarget(
  current: { weeklyTarget: number; targetHistory?: TargetChange[] },
  n: number,
  todayIso: string,
): { weeklyTarget: number; targetHistory: TargetChange[] } {
  const target = clampWeeklyTarget(n);
  const thisWeek = weekStartIso(todayIso);
  // First change: everything before it keeps the old target.
  const history = current.targetHistory?.length
    ? current.targetHistory
    : [{ fromIso: "0000-01-01", target: current.weeklyTarget }];
  return {
    weeklyTarget: target,
    targetHistory: [...history.filter((c) => c.fromIso !== thisWeek), { fromIso: thisWeek, target }],
  };
}

function isPaused(iso: string, pauses: StreakPause[], todayIso: string): boolean {
  return pauses.some((p) => iso >= p.startIso && iso <= (p.endIso ?? todayIso));
}

type StreakInput = {
  /** Days with at least one workout, YYYY-MM-DD (duplicates are fine). */
  trainedDaysIso: Iterable<string>;
  weeklyTarget: number;
  /** Past targets; when given, each week is judged on the target it had. */
  targetHistory?: TargetChange[];
  pauses?: StreakPause[];
  todayIso: string;
};

/** Judges any week (by its Monday) the way the streak does. */
function weekJudge(input: StreakInput) {
  const pauses = input.pauses ?? [];
  const today = input.todayIso;
  const thisWeekStart = weekStartIso(today);
  const days = new Set([...input.trainedDaysIso].filter((d) => d <= today));
  const doneByWeek = new Map<string, number>();
  for (const d of days) {
    const w = weekStartIso(d);
    doneByWeek.set(w, (doneByWeek.get(w) ?? 0) + 1);
  }

  const weekResult = (startIso: string): WeekResult => {
    let paused = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(startIso, i);
      // Days after today aren't paused yet: an open pause only covers up to today.
      if (d <= today && isPaused(d, pauses, today)) paused++;
    }
    const weekTarget = targetForWeek(startIso, input.targetHistory, input.weeklyTarget);
    const needed = Math.ceil((weekTarget * (7 - paused)) / 7);
    const done = doneByWeek.get(startIso) ?? 0;
    let outcome: WeekResult["outcome"];
    if (done >= needed && needed > 0) outcome = "met";
    else if (startIso === thisWeekStart) outcome = "in_progress";
    else if (needed === 0) outcome = "skipped";
    else outcome = "missed";
    return { startIso, done, needed, outcome };
  };
  return { days, pauses, today, thisWeekStart, weekResult };
}

/** Every week from the one holding `fromIso` up to this week, oldest first, judged like the streak. */
export function weekResults(input: StreakInput & { fromIso: string }): WeekResult[] {
  const { thisWeekStart, weekResult } = weekJudge(input);
  const out: WeekResult[] = [];
  for (let w = weekStartIso(input.fromIso); w <= thisWeekStart; w = addDays(w, 7)) out.push(weekResult(w));
  return out;
}

export function computeWeeklyStreak(input: StreakInput): WeeklyStreak {
  const { days, pauses, today, thisWeekStart, weekResult } = weekJudge(input);
  const target = targetForWeek(thisWeekStart, input.targetHistory, input.weeklyTarget);

  const thisWeek = weekResult(thisWeekStart);
  const pausedNow = isPaused(today, pauses, today);

  if (days.size === 0) {
    return { currentWeeks: 0, bestWeeks: 0, thisWeek, pausedNow, weeklyTarget: target };
  }

  const first = weekStartIso([...days].sort()[0]!);
  const weeks = Math.floor(daysBetween(first, thisWeekStart) / 7);
  let run = 0;
  let best = 0;
  for (let i = 0; i <= weeks; i++) {
    const r = i === weeks ? thisWeek : weekResult(addDays(first, i * 7));
    if (r.outcome === "met") run++;
    else if (r.outcome === "missed") run = 0;
    best = Math.max(best, run);
  }

  return { currentWeeks: run, bestWeeks: best, thisWeek, pausedNow, weeklyTarget: target };
}
