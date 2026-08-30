import type { WeightEntry } from "../domain/nutrition";
import { KCAL_PER_KG } from "./targets";

// Adaptive expenditure estimate (MacroFactor-style). Over a rolling window, energy balance
// says:  Σintake − Σexpenditure ≈ ΔbodyMass × KCAL_PER_KG.
// Rearranged, mean daily expenditure ≈ meanDailyIntake − (weightSlope × KCAL_PER_KG).
// This learns the user's real TDEE from their own data instead of trusting a formula, and
// self-corrects as metabolism adapts. It needs a couple of weeks of both weight and food
// logging; below that it returns null and callers fall back to the calculated TDEE.
//
// The weight slope is a least-squares fit over the raw daily means in the window (not the
// EMA trend line — regression is unbiased for a noisy linear trend and doesn't need a long
// burn-in the way an EMA does).

const DAY_MS = 24 * 60 * 60 * 1000;

function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export type DailyIntake = { dateIso: string; kcal: number };

export type ExpenditureEstimate = {
  /** Estimated maintenance calories, kcal/day. */
  tdee: number;
  /** 0–1 — how much of the window had usable data. */
  confidence: number;
} | null;

/** Least-squares slope in units-per-day for points spaced by real day offsets. */
function slopePerDay(points: { day: number; value: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sx += p.day;
    sy += p.value;
    sxx += p.day * p.day;
    sxy += p.day * p.value;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

export function estimateExpenditure(input: {
  weightEntries: WeightEntry[];
  dailyIntakeKcal: DailyIntake[];
  windowDays?: number;
  /** Minimum distinct weigh-in days required inside the window. */
  minWeighDays?: number;
  /** Minimum intake-logged days required inside the window. */
  minLoggedDays?: number;
}): ExpenditureEstimate {
  const windowDays = input.windowDays ?? 21;
  const minWeighDays = input.minWeighDays ?? 7;
  const minLoggedDays = input.minLoggedDays ?? 10;

  const live = input.weightEntries.filter((e) => !e.deletedAtMs);
  if (live.length < minWeighDays) return null;

  // Daily mean weight, sorted.
  const byDay = new Map<string, number[]>();
  for (const e of live) {
    const arr = byDay.get(e.dateIso) ?? [];
    arr.push(e.weightKg);
    byDay.set(e.dateIso, arr);
  }
  const allDays = [...byDay.keys()].sort();
  const lastIso = allDays[allDays.length - 1]!;
  const windowStartMs = isoToUtcMs(lastIso) - (windowDays - 1) * DAY_MS;

  const weighPoints = allDays
    .filter((iso) => isoToUtcMs(iso) >= windowStartMs)
    .map((iso) => {
      const vals = byDay.get(iso)!;
      return {
        day: Math.round((isoToUtcMs(iso) - windowStartMs) / DAY_MS),
        value: vals.reduce((a, b) => a + b, 0) / vals.length,
      };
    });
  if (weighPoints.length < minWeighDays) return null;

  const spanDays = weighPoints[weighPoints.length - 1]!.day - weighPoints[0]!.day;
  if (spanDays < minWeighDays - 1) return null;

  const weightSlopePerDay = slopePerDay(weighPoints);

  // Mean intake over logged days inside the window.
  const startIso = new Date(windowStartMs).toISOString().slice(0, 10);
  const logged = input.dailyIntakeKcal.filter(
    (d) => d.kcal > 0 && d.dateIso >= startIso && d.dateIso <= lastIso,
  );
  if (logged.length < minLoggedDays) return null;
  const meanIntake = logged.reduce((a, d) => a + d.kcal, 0) / logged.length;

  const tdee = meanIntake - weightSlopePerDay * KCAL_PER_KG;
  if (!Number.isFinite(tdee) || tdee <= 0) return null;

  const coverage = Math.min(1, logged.length / windowDays);
  const spanCoverage = Math.min(1, spanDays / (windowDays - 1));
  const confidence = Math.max(0, Math.min(1, coverage * spanCoverage));

  return { tdee, confidence };
}

/**
 * Blend the formula TDEE with the adaptive estimate, weighted by confidence, and clamp the
 * result to ±`clampPct`% of the formula figure so a bad estimate (sloppy logging, a whoosh)
 * can't send the target somewhere absurd. `clampPct` defaults to 35.
 */
export function blendExpenditure(
  calculatedTdee: number,
  estimate: ExpenditureEstimate,
  clampPct = 35,
): number {
  if (!estimate || calculatedTdee <= 0) return calculatedTdee;
  const f = Math.max(0, clampPct) / 100;
  const clamped = Math.max(
    calculatedTdee * (1 - f),
    Math.min(calculatedTdee * (1 + f), estimate.tdee),
  );
  const w = estimate.confidence;
  return calculatedTdee * (1 - w) + clamped * w;
}
