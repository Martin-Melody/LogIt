// A coach suggesting a change to a client's own goal (canvas GL1). Goals are the client's;
// targets and programs are the coach's. The coach suggests; the client uses it or keeps theirs,
// and either way the coach is told.

import type { GoalType, NutritionGoal } from "./nutrition";

export type GoalSuggestion = {
  id: string;
  goalType: GoalType;
  /** kg a week, always positive (the direction is goalType). */
  rateKgPerWeek: number;
  targetWeightKg?: number;
  note?: string;
};

export function parseGoalSuggestion(json: string | null | undefined): GoalSuggestion | null {
  try {
    const s = JSON.parse(json ?? "") as GoalSuggestion;
    return s && typeof s.id === "string" && (s.goalType === "lose" || s.goalType === "gain" || s.goalType === "maintain") && typeof s.rateKgPerWeek === "number" ? s : null;
  } catch {
    return null;
  }
}

/** "−0.3 kg a week, 65 kg by June" (by when, worked out from their current weight). */
export function goalLine(g: Pick<GoalSuggestion, "goalType" | "rateKgPerWeek" | "targetWeightKg">, currentKg: number | null, now = new Date()): string {
  if (g.goalType === "maintain") return g.targetWeightKg ? `keep at ${g.targetWeightKg} kg` : "keep my weight steady";
  const pace = `${g.goalType === "lose" ? "−" : "+"}${g.rateKgPerWeek} kg a week`;
  if (!g.targetWeightKg) return pace;
  if (currentKg == null || g.rateKgPerWeek <= 0) return `${pace}, to ${g.targetWeightKg} kg`;
  const weeks = Math.abs(currentKg - g.targetWeightKg) / g.rateKgPerWeek;
  const by = new Date(now.getTime() + weeks * 7 * 86_400_000);
  return `${pace}, ${g.targetWeightKg} kg by ${by.toLocaleDateString(undefined, { month: "long", ...(by.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })}`;
}

/** Their goal with the suggestion in it; everything else in it stays theirs. */
export function useGoalSuggestion(goal: NutritionGoal, s: GoalSuggestion): NutritionGoal {
  return { ...goal, goalType: s.goalType, targetRateKgPerWeek: s.rateKgPerWeek, ...(s.targetWeightKg ? { targetWeightKg: s.targetWeightKg } : {}) };
}
