import type { MealSlot } from "@logit/core/domain/nutrition";

export const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/** The meal people most likely mean right now: breakfast before 11, lunch until 3,
 * snacks until 5, dinner until 9, snacks after. */
export function mealForNow(d = new Date()): MealSlot {
  const h = d.getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 17) return "snack";
  if (h < 21) return "dinner";
  return "snack";
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

/** "P 54 · C 32 · F 12" */
export function macroLine(m: { proteinG: number; carbsG: number; fatG: number }): string {
  return `P ${Math.round(m.proteinG)} · C ${Math.round(m.carbsG)} · F ${Math.round(m.fatG)}`;
}
