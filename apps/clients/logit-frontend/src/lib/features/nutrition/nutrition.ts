import { dayTotals, type DiaryDay, type MacroTotals, type WeightEntry } from "@logit/core/domain/nutrition";

// Target derivation + insights moved into @logit/core usecases (getNutritionTargets /
// getNutritionInsights) now that the algorithm is pluggable. This file keeps the small
// presentation helpers the nutrition routes share.

export type { NutritionState, ResolvedTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";

// ── Units ────────────────────────────────────────────────────────────────────

export type WeightUnit = "kg" | "lbs";
const LB_PER_KG = 2.2046226218;

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === "lbs" ? kg * LB_PER_KG : kg;
}
export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === "lbs" ? value / LB_PER_KG : value;
}
export function fmtWeight(kg: number | null, unit: WeightUnit): string {
  if (kg == null) return "—";
  return `${kgToDisplay(kg, unit).toFixed(1)} ${unit}`;
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmtKcal(n: number): string {
  return `${Math.round(n)}`;
}
export function fmtGrams(n: number): string {
  return `${Math.round(n)} g`;
}

// ── Small data helpers ───────────────────────────────────────────────────────

export function totalsFor(day: DiaryDay | null): MacroTotals {
  return day ? dayTotals(day) : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
}

export function latestWeight(entries: WeightEntry[]): WeightEntry | null {
  const live = entries.filter((e) => !e.deletedAtMs);
  return live.length ? live.reduce((a, b) => (a.dateIso >= b.dateIso ? a : b)) : null;
}
