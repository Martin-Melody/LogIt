/**
 * Estimated 1-rep max via the Epley formula: weight × (1 + reps / 30).
 * At reps === 1 the formula degenerates to the lift itself, so that case is
 * returned directly rather than passed through the multiplication.
 *
 * Shared so every surface that shows an estimated 1RM — /progress analytics,
 * the exercise header, the workout recap — and any community plugin agree on
 * one formula, rather than each computing it independently. Previously lived
 * only as a private helper inside basicAnalytics.ts.
 */
export function estimated1RM(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/**
 * Reps done at one load, expressed as reps at another load: the rep count at
 * `toKg` with the same Epley estimate as `reps` at `fromKg`. Used to judge a set
 * done at a different weight from the plan (5 at +2.5 kg ≈ 6 at the planned
 * weight). Not rounded and never below 0; null when either load isn't positive.
 */
export function repsAtLoad(reps: number, fromKg: number, toKg: number): number | null {
  if (!(fromKg > 0) || !(toKg > 0) || reps <= 0) return null;
  return Math.max(0, (fromKg / toKg) * (30 + reps) - 30);
}

/**
 * The load for a percentage of a 1RM (e.g. 80% of a 130 kg e1RM), rounded to the nearest
 * `stepKg` (2.5 kg by default: the smallest jump most gyms can make on a barbell). Null
 * when either number isn't positive.
 */
export function loadFromPercent(oneRepMaxKg: number, percent: number, stepKg = 2.5): number | null {
  if (!(oneRepMaxKg > 0) || !(percent > 0) || !(stepKg > 0)) return null;
  const raw = (oneRepMaxKg * percent) / 100;
  return Math.round(Math.round(raw / stepKg) * stepKg * 1000) / 1000;
}
