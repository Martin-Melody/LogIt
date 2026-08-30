import type { MacroTotals } from "../domain/nutrition";

// Adherence — how a day's intake compares to target. Trivial now; the coach dashboard in
// Phase 3 (client adherence %, macro-trend charts) is the real consumer.

export type MacroAdherence = {
  kcalPct: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
};

function pct(consumed: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((consumed / target) * 100);
}

export function dailyAdherence(consumed: MacroTotals, target: MacroTotals): MacroAdherence {
  return {
    kcalPct: pct(consumed.kcal, target.kcal),
    proteinPct: pct(consumed.proteinG, target.proteinG),
    carbsPct: pct(consumed.carbsG, target.carbsG),
    fatPct: pct(consumed.fatG, target.fatG),
  };
}

/** Mean of |1 − consumed/target| across a set of days, as a 0–100 "on target" score.
 * 100 = every day hit its calorie target exactly; drops as days drift over or under. */
export function calorieAdherenceScore(
  days: { consumedKcal: number; targetKcal: number }[],
): number | null {
  const usable = days.filter((d) => d.targetKcal > 0);
  if (usable.length === 0) return null;
  const meanErr =
    usable.reduce((a, d) => a + Math.abs(1 - d.consumedKcal / d.targetKcal), 0) /
    usable.length;
  return Math.max(0, Math.round((1 - meanErr) * 100));
}
