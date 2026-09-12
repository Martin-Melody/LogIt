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
