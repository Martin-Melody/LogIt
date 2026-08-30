import type { WeightEntry } from "../domain/nutrition";
import { localDateIso } from "../domain/nutrition";

// Bodyweight trend smoothing. Daily scale readings are dominated by water/gut/glycogen
// noise (±1 kg day to day), so raw numbers are useless for judging progress. We fill a
// daily series between the first and last entry and run an exponential moving average
// (half-life ~10 days), then take the recent slope as the weekly rate.

const DAY_MS = 24 * 60 * 60 * 1000;

/** EMA smoothing factor. alpha = 1 − 0.5^(1/halfLifeDays). */
function alphaForHalfLife(halfLifeDays: number): number {
  return 1 - Math.pow(0.5, 1 / halfLifeDays);
}

/** Midnight-UTC epoch for a YYYY-MM-DD string. Date math on these is timezone-safe. */
function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** YYYY-MM-DD from a midnight-UTC epoch. */
function utcMsToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export type WeightTrendPoint = {
  dateIso: string;
  /** The day's actual reading (mean of that day's entries), or null if none. */
  actualKg: number | null;
  smoothedKg: number;
};

export type WeightTrend = {
  points: WeightTrendPoint[];
  /** Latest smoothed value — the number to show as "current weight". */
  currentKg: number | null;
  /** Latest raw reading. */
  currentActualKg: number | null;
  /** Slope of the smoothed series over the recent window, kg/week (signed). */
  weeklyRateKg: number;
};

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((isoToUtcMs(bIso) - isoToUtcMs(aIso)) / DAY_MS);
}

function addDays(iso: string, n: number): string {
  return utcMsToIso(isoToUtcMs(iso) + n * DAY_MS);
}

/** Least-squares slope (kg/day) of the smoothed series over its last `windowDays`. */
function recentSlopePerDay(points: WeightTrendPoint[], windowDays: number): number {
  const tail = points.slice(-Math.max(2, windowDays));
  if (tail.length < 2) return 0;
  const n = tail.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  tail.forEach((p, i) => {
    sx += i;
    sy += p.smoothedKg;
    sxx += i * i;
    sxy += i * p.smoothedKg;
  });
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

export function smoothWeightSeries(
  entries: WeightEntry[],
  opts: { halfLifeDays?: number; rateWindowDays?: number } = {},
): WeightTrend {
  const halfLife = opts.halfLifeDays ?? 10;
  const rateWindow = opts.rateWindowDays ?? 21;

  const live = entries.filter((e) => !e.deletedAtMs);
  if (live.length === 0) {
    return { points: [], currentKg: null, currentActualKg: null, weeklyRateKg: 0 };
  }

  // Mean per day, sorted ascending.
  const byDay = new Map<string, number[]>();
  for (const e of live) {
    const arr = byDay.get(e.dateIso) ?? [];
    arr.push(e.weightKg);
    byDay.set(e.dateIso, arr);
  }
  const dayMeans = new Map<string, number>();
  for (const [iso, vals] of byDay) {
    dayMeans.set(iso, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  const dates = [...dayMeans.keys()].sort();
  const firstIso = dates[0]!;
  const lastIso = dates[dates.length - 1]!;

  const alpha = alphaForHalfLife(halfLife);
  const points: WeightTrendPoint[] = [];
  let smoothed = dayMeans.get(firstIso)!;
  const span = daysBetween(firstIso, lastIso);

  for (let i = 0; i <= span; i++) {
    const iso = addDays(firstIso, i);
    const actual = dayMeans.has(iso) ? dayMeans.get(iso)! : null;
    if (actual != null) smoothed = alpha * actual + (1 - alpha) * smoothed;
    points.push({ dateIso: iso, actualKg: actual, smoothedKg: smoothed });
  }

  const perDay = recentSlopePerDay(points, rateWindow);

  return {
    points,
    currentKg: points[points.length - 1]!.smoothedKg,
    currentActualKg: dayMeans.get(lastIso)!,
    weeklyRateKg: perDay * 7,
  };
}

export type GoalProjection = {
  /** Projected date the target weight is reached, YYYY-MM-DD, or null if not projectable. */
  etaIso: string | null;
  weeksRemaining: number | null;
};

/** Straight-line projection from current smoothed weight to a target at the observed rate.
 * Returns nulls when there's no target, the trend is flat, or the trend moves away from
 * the target. */
export function projectGoalDate(input: {
  currentKg: number | null;
  targetKg?: number;
  weeklyRateKg: number;
  now?: Date;
}): GoalProjection {
  const { currentKg, targetKg, weeklyRateKg } = input;
  if (currentKg == null || targetKg == null || Math.abs(weeklyRateKg) < 0.01) {
    return { etaIso: null, weeksRemaining: null };
  }
  const now = input.now ?? new Date();
  const remaining = targetKg - currentKg;
  if (Math.abs(remaining) < 0.05) return { etaIso: localDateIso(now), weeksRemaining: 0 };
  // Rate must point toward the target.
  if (Math.sign(remaining) !== Math.sign(weeklyRateKg)) {
    return { etaIso: null, weeksRemaining: null };
  }
  const weeks = remaining / weeklyRateKg;
  const eta = new Date(now.getTime() + weeks * 7 * DAY_MS);
  return { etaIso: localDateIso(eta), weeksRemaining: Math.round(weeks * 10) / 10 };
}
