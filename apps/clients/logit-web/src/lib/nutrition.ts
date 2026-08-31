import { dayTotals, type DiaryDay, type MacroTotals } from "@logit/core/domain/nutrition";

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
