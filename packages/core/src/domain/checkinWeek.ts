// "Her week" beside a check-in (canvas K4): plain numbers for the week the check-in covers, with
// the week before for comparison. Each part only from what the client shares.

import { exerciseIndex } from "./exerciseIndex";
import { dayTotals, type DiaryDay } from "./nutrition";
import type { WorkoutSession } from "./workout";

const WEEK = 7 * 86_400_000;

export type WeekLift = { name: string; weight: number; reps: number; was: { weight: number; reps: number } | null };

/** Up to `max` lifts done in [fromMs, toMs): their best set, and the best in the 7 days before.
 * Lifts done both weeks come first (heaviest first), then new ones. */
export function weekLifts(sessions: WorkoutSession[], fromMs: number, toMs: number, max = 3): WeekLift[] {
  const done = sessions.filter((s) => s.endedAtMs != null);
  const now = exerciseIndex(done.filter((s) => s.startedAtMs >= fromMs && s.startedAtMs < toMs)).filter((h) => h.weight > 0);
  const before = new Map(exerciseIndex(done.filter((s) => s.startedAtMs >= fromMs - WEEK && s.startedAtMs < fromMs)).map((h) => [h.id, h]));
  return now
    .map((h) => ({ h, was: before.get(h.id) ?? null }))
    .sort((a, b) => Number(!!b.was) - Number(!!a.was) || b.h.e1rm - a.h.e1rm)
    .slice(0, max)
    .map(({ h, was }) => ({ name: h.name, weight: h.weight, reps: h.reps, was: was && was.weight > 0 ? { weight: was.weight, reps: was.reps } : null }));
}

/** Average calories and protein over the days with anything logged, or null when none were. */
export function foodAverages(days: DiaryDay[]): { kcal: number; proteinG: number; days: number } | null {
  const logged = days.filter((d) => d.items.length > 0);
  if (!logged.length) return null;
  const totals = logged.map(dayTotals);
  const avg = (f: (t: (typeof totals)[number]) => number) => Math.round(totals.reduce((n, t) => n + f(t), 0) / logged.length);
  return { kcal: avg((t) => t.kcal), proteinG: avg((t) => t.proteinG), days: logged.length };
}
