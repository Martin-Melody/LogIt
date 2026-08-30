import { createId } from "./ids";
import { nowMs } from "./time";
import type { MacroTotals } from "./nutrition";

// A nutrition target set a coach assigns to one client. The mirror image of the coach-read
// path (SyncEndpoints / CoachProgram): the coach owns and writes this row, the client pulls
// it read-only via GET /coach/nutrition-plans/assigned. It never touches the client's
// Synced* rows.
//
// v1 is just the numbers + a note — structured meal-by-meal plans (foods, swaps, grocery
// list) come later (roadmap Phase 3 Stage C).

export type CoachNutritionPlan = {
  id: string;
  name: string;
  /** Daily calorie target the coach wants the client to hit. */
  kcalTarget: number;
  /** Absolute macro targets in grams. Any omitted macro is left to the client's own split. */
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  /** Free-text guidance shown to the client. */
  note?: string;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export function createCoachNutritionPlan(name = "Nutrition plan"): CoachNutritionPlan {
  const now = nowMs();
  return {
    id: createId("cnplan"),
    name: name.trim() || "Nutrition plan",
    kcalTarget: 2000,
    proteinG: 150,
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function touchCoachNutritionPlan(plan: CoachNutritionPlan): CoachNutritionPlan {
  return { ...plan, updatedAtMs: nowMs() };
}

export function updateCoachNutritionPlan(
  plan: CoachNutritionPlan,
  patch: Partial<Omit<CoachNutritionPlan, "id" | "createdAtMs" | "updatedAtMs">>,
): CoachNutritionPlan {
  return touchCoachNutritionPlan({ ...plan, ...patch });
}

/** The plan's targets as MacroTotals, filling unset macros with 0 (the UI shows "—"). */
export function planMacros(plan: CoachNutritionPlan): MacroTotals {
  return {
    kcal: plan.kcalTarget,
    proteinG: plan.proteinG ?? 0,
    carbsG: plan.carbsG ?? 0,
    fatG: plan.fatG ?? 0,
  };
}
