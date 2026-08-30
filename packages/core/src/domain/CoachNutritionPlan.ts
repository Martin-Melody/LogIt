import { createId } from "./ids";
import { nowMs } from "./time";
import {
  addMacros,
  roundMacros,
  ZERO_MACROS,
  type LoggedItem,
  type MacroTotals,
  type MealSlot,
} from "./nutrition";

// A nutrition target set a coach assigns to one client. The mirror image of the coach-read
// path (SyncEndpoints / CoachProgram): the coach owns and writes this row, the client pulls
// it read-only via GET /coach/nutrition-plans/assigned. It never touches the client's
// Synced* rows.
//
// The daily numbers (kcalTarget + macros + note) are always present; a structured
// meal-by-meal plan (meals → foods, with coach-approved swaps) is optional.

/** One food the coach has prescribed, at a fixed amount. */
export type PlannedFood = {
  id: string;
  name: string;
  brand?: string;
  /** Grams (or ml) of this food. */
  grams: number;
  /** Human portion for display, e.g. "1 scoop (30 g)". */
  servingLabel?: string;
  /** Macros for `grams` of this food. */
  computed: MacroTotals;
  /** Coach-approved alternatives the client may log instead. */
  swaps?: PlannedFood[];
};

export type PlannedMeal = {
  id: string;
  name: string;
  foods: PlannedFood[];
};

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
  /** Optional structured plan. When present, the client sees the meals with a "Log" (and,
   * where swaps exist, "Swap") action per food, plus a grocery list. */
  meals?: PlannedMeal[];
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

// ── Structured meal plan ─────────────────────────────────────────────────────

export function createPlannedMeal(name = "Meal"): PlannedMeal {
  return { id: createId("pmeal"), name: name.trim() || "Meal", foods: [] };
}

export function addMeal(plan: CoachNutritionPlan, name?: string): CoachNutritionPlan {
  return touchCoachNutritionPlan({
    ...plan,
    meals: [...(plan.meals ?? []), createPlannedMeal(name)],
  });
}

export function removeMeal(plan: CoachNutritionPlan, mealId: string): CoachNutritionPlan {
  return touchCoachNutritionPlan({
    ...plan,
    meals: (plan.meals ?? []).filter((m) => m.id !== mealId),
  });
}

export function updateMeal(
  plan: CoachNutritionPlan,
  mealId: string,
  fn: (meal: PlannedMeal) => PlannedMeal,
): CoachNutritionPlan {
  return touchCoachNutritionPlan({
    ...plan,
    meals: (plan.meals ?? []).map((m) => (m.id === mealId ? fn(m) : m)),
  });
}

export function addPlannedFood(meal: PlannedMeal, food: Omit<PlannedFood, "id">): PlannedMeal {
  return { ...meal, foods: [...meal.foods, { ...food, id: createId("pfood") }] };
}

export function removePlannedFood(meal: PlannedMeal, foodId: string): PlannedMeal {
  return { ...meal, foods: meal.foods.filter((f) => f.id !== foodId) };
}

export function mealTotals(meal: PlannedMeal): MacroTotals {
  return roundMacros(
    meal.foods.reduce((acc, f) => addMacros(acc, f.computed), { ...ZERO_MACROS }),
  );
}

export function planTotals(plan: CoachNutritionPlan): MacroTotals {
  return roundMacros(
    (plan.meals ?? []).reduce((acc, m) => addMacros(acc, mealTotals(m)), { ...ZERO_MACROS }),
  );
}

/** Best-guess diary slot for a planned meal, from its name. */
export function slotForMeal(meal: PlannedMeal): MealSlot {
  const n = meal.name.toLowerCase();
  if (n.includes("breakfast") || n.includes("morning")) return "breakfast";
  if (n.includes("lunch") || n.includes("midday")) return "lunch";
  if (n.includes("dinner") || n.includes("evening")) return "dinner";
  return "snack";
}

/** Turn a coach-prescribed food into a diary item the client can log verbatim. */
export function plannedFoodToLoggedItem(
  food: PlannedFood,
  meal: MealSlot,
): Omit<LoggedItem, "id"> {
  return {
    meal,
    name: food.name,
    brand: food.brand,
    grams: food.grams,
    servingLabel: food.servingLabel,
    computed: food.computed,
  };
}

/** Flat, de-duplicated shopping list (by name+brand), grams summed across meals. */
export function groceryList(plan: CoachNutritionPlan): { name: string; brand?: string; grams: number }[] {
  const byKey = new Map<string, { name: string; brand?: string; grams: number }>();
  for (const meal of plan.meals ?? []) {
    for (const f of meal.foods) {
      const key = `${f.name}::${f.brand ?? ""}`.toLowerCase();
      const cur = byKey.get(key);
      if (cur) cur.grams += f.grams;
      else byKey.set(key, { name: f.name, brand: f.brand, grams: f.grams });
    }
  }
  return [...byKey.values()].map((x) => ({ ...x, grams: Math.round(x.grams) }));
}
