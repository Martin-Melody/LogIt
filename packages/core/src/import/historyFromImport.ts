import { estimated1RM } from "../domain/oneRepMax";
import { addDay, addPlannedStrength, createSplit, type WorkoutSplit } from "../domain/WorkoutSplit";
import type { SetEntry, StrengthBlockData, WorkoutSession } from "../domain/workout";

/**
 * What an imported history says, for "3 years of training, all here" (design canvas E2): the
 * numbers, estimated maxes over time, and the split the person has been running.
 */

const DAY_MS = 86_400_000;
const SPLIT_WINDOW_MS = 42 * DAY_MS;
/** Estimates from sets of more reps than this aren't trusted (as LogIt Adaptive). */
const MAX_REPS_FOR_ESTIMATE = 12;

function strengthBlocks(s: WorkoutSession) {
  return s.blocks.filter((b) => b.type === "strength").map((b) => b.data as StrengthBlockData);
}
const working = (sets: SetEntry[]) => sets.filter((x) => x.completed !== false && x.setType !== "warmup" && x.reps > 0);
const keyOf = (e: { exerciseId?: string; exerciseName: string }) => e.exerciseId ?? e.exerciseName.trim().toLowerCase();

export type LiftTrend = { name: string; exerciseId?: string; months: { monthMs: number; kg: number }[]; firstKg: number; lastKg: number };
/** Squat, bench and deadlift now: each one's best estimated max in its last six weeks. */
export type BigThree = { squatKg: number; benchKg: number; deadliftKg: number; totalKg: number };
export type HistorySummary = { workouts: number; exercises: number; prs: number; firstAtMs: number; lastAtMs: number; lifts: LiftTrend[]; bigThree: BigThree | null };

const BIG_THREE = { squat: ["core_squat", "squat"], bench: ["core_bench_press", "bench press"], deadlift: ["core_deadlift", "deadlift"] } as const;

/** `sessions` in any order. Lifts: squat, bench and deadlift when all three are there (they're
 * what the total under them adds up), else the three with the most weighted working sets. */
export function summariseHistory(sessions: WorkoutSession[]): HistorySummary | null {
  const sorted = [...sessions].sort((a, b) => a.startedAtMs - b.startedAtMs);
  if (!sorted.length) return null;
  const best = new Map<string, number>();
  const sets = new Map<string, { name: string; exerciseId?: string; count: number; byMonth: Map<number, number> }>();
  let prs = 0;
  // Per lift: [atMs, e1rm] of every working set, for "now" (last six weeks of that lift).
  const sets1rm = new Map<string, [number, number][]>();
  for (const s of sorted) {
    const d = new Date(s.startedAtMs);
    const monthMs = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    for (const b of strengthBlocks(s)) {
      const k = keyOf(b);
      const entry = sets.get(k) ?? { name: b.exerciseName, exerciseId: b.exerciseId, count: 0, byMonth: new Map() };
      sets.set(k, entry);
      for (const x of working(b.sets)) {
        if (x.weight <= 0) continue;
        entry.count++;
        const e1rm = estimated1RM(x.weight, Math.min(x.reps, MAX_REPS_FOR_ESTIMATE));
        entry.byMonth.set(monthMs, Math.max(entry.byMonth.get(monthMs) ?? 0, e1rm));
        const nameKey = b.exerciseName.trim().toLowerCase();
        for (const id of [b.exerciseId, nameKey]) if (id) sets1rm.set(id, [...(sets1rm.get(id) ?? []), [s.startedAtMs, e1rm]]);
        const before = best.get(k);
        if (before != null && e1rm > before + 0.01) prs++;
        if (before == null || e1rm > before) best.set(k, e1rm);
      }
    }
  }
  const big = new Set<string>(Object.values(BIG_THREE).flat());
  const isBig = (e: { name: string; exerciseId?: string }) => big.has(e.exerciseId ?? "") || big.has(e.name.trim().toLowerCase());
  const allBig = Object.values(BIG_THREE).every((keys) => keys.some((k) => sets1rm.get(k)?.length));
  const lifts = [...sets.values()]
    .filter((e) => e.byMonth.size > 0)
    .sort((a, b) => (allBig ? Number(isBig(b)) - Number(isBig(a)) : 0) || b.count - a.count)
    .slice(0, 3)
    .map((e): LiftTrend => {
      const months = [...e.byMonth].sort((a, b) => a[0] - b[0]).map(([monthMs, kg]) => ({ monthMs, kg: Math.round(kg * 10) / 10 }));
      return { name: e.name, ...(e.exerciseId ? { exerciseId: e.exerciseId } : {}), months, firstKg: months[0]!.kg, lastKg: months.at(-1)!.kg };
    });
  const now = (keys: readonly string[]) => {
    const list = keys.map((k) => sets1rm.get(k)).find((l) => l?.length);
    if (!list) return null;
    const last = list.at(-1)![0];
    return Math.max(...list.filter(([at]) => at > last - SPLIT_WINDOW_MS).map(([, kg]) => kg));
  };
  const [sq, be, dl] = [now(BIG_THREE.squat), now(BIG_THREE.bench), now(BIG_THREE.deadlift)];
  const r1 = (kg: number) => Math.round(kg * 10) / 10;
  const bigThree = sq && be && dl ? { squatKg: r1(sq), benchKg: r1(be), deadliftKg: r1(dl), totalKg: r1(sq + be + dl) } : null;
  return { workouts: sorted.length, exercises: sets.size, prs, firstAtMs: sorted[0]!.startedAtMs, lastAtMs: sorted.at(-1)!.startedAtMs, lifts, bigThree };
}

export type DetectedDay = { name: string; weekday: number; exercises: { name: string; exerciseId?: string; sets: number; repRange: [number, number] }[] };
export type DetectedSplit = { days: DetectedDay[]; daysPerWeek: number };

/**
 * The split someone has been running, from workout names over the six weeks before their last
 * workout: each name done at least twice is a day, on the weekday it was most often done, with
 * the exercises of its latest session. Null without at least two named workouts repeating.
 */
export function detectSplit(sessions: WorkoutSession[]): DetectedSplit | null {
  const named = sessions
    .filter((s) => s.name?.trim() && strengthBlocks(s).length)
    .sort((a, b) => a.startedAtMs - b.startedAtMs);
  const last = named.at(-1);
  if (!last) return null;
  const recent = named.filter((s) => s.startedAtMs > last.startedAtMs - SPLIT_WINDOW_MS);
  const byName = new Map<string, WorkoutSession[]>();
  for (const s of recent) {
    const k = s.name!.trim();
    byName.set(k, [...(byName.get(k) ?? []), s]);
  }
  const kept = [...byName].filter(([, list]) => list.length >= 2);
  if (!kept.length) return null;

  const days = kept.map(([name, list]): DetectedDay & { firstAt: number } => {
    const counts = new Array(7).fill(0) as number[];
    for (const s of list) counts[new Date(s.startedAtMs).getDay()]!++;
    const weekday = counts.indexOf(Math.max(...counts));
    const latest = list.at(-1)!;
    const exercises = strengthBlocks(latest)
      .map((b) => ({ b, w: working(b.sets) }))
      .filter(({ w }) => w.length)
      .map(({ b, w }) => {
        const reps = w.map((x) => x.reps);
        return { name: b.exerciseName, ...(b.exerciseId ? { exerciseId: b.exerciseId } : {}), sets: w.length, repRange: [Math.min(...reps), Math.max(...reps)] as [number, number] };
      });
    return { name, weekday, exercises, firstAt: list[0]!.startedAtMs };
  });
  // Monday first, as the week is shown; days on the same weekday in the order they started.
  const mondayFirst = (wd: number) => (wd + 6) % 7;
  days.sort((a, b) => mondayFirst(a.weekday) - mondayFirst(b.weekday) || a.firstAt - b.firstAt);

  // Weeks the window touches: 31 days from a Monday to a Thursday is five training weeks.
  const spanWeeks = Math.floor((last.startedAtMs - recent[0]!.startedAtMs) / (7 * DAY_MS)) + 1;
  const keptCount = kept.reduce((n, [, list]) => n + list.length, 0);
  const daysPerWeek = Math.min(7, Math.max(1, Math.round(keptCount / spanWeeks)));
  return { days: days.map(({ firstAt: _, ...d }) => d), daysPerWeek };
}

/** The detected split as a LogIt split on a weekday schedule. */
export function splitFromDetected(d: DetectedSplit, name = "My split"): WorkoutSplit {
  let split: WorkoutSplit = { ...createSplit(name), schedule: "weekdays" };
  for (const day of d.days) {
    split = addDay(split, day.name);
    const dayId = split.days.at(-1)!.id;
    split = { ...split, days: split.days.map((x) => (x.id === dayId ? { ...x, weekday: day.weekday } : x)) };
    for (const ex of day.exercises) {
      split = addPlannedStrength(split, dayId, { exerciseName: ex.name, exerciseId: ex.exerciseId, targets: { sets: ex.sets } });
    }
  }
  return split;
}
