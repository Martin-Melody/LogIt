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
