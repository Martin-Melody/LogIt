// A client's day on a coach's meal plan (canvas MP7, MP8, SW2, Q7): what they see (a swap in
// place of food they don't eat), logging it as planned, as a swap, or with changed amounts, the
// grocery list for the days ahead, and how the day went against the plan (for the coach).

import { roundMacros, type DietTag, type DiaryDay, type LoggedItem, type MealSlot } from "./nutrition";
import { foodBreaks, planDay, slotForMeal, type CoachNutritionPlan, type PlannedFood, type PlannedMeal } from "./CoachNutritionPlan";

/** A swap at the amount that matches the planned food's protein (130 g salmon → 150 g chicken),
 * or its calories when either has no protein. */
export function swapAmount(planned: PlannedFood, swap: PlannedFood): PlannedFood {
  const byProtein = planned.computed.proteinG > 1 && swap.computed.proteinG > 1;
  const k = byProtein ? planned.computed.proteinG / swap.computed.proteinG : swap.computed.kcal > 0 ? planned.computed.kcal / swap.computed.kcal : 1;
  if (!Number.isFinite(k) || k <= 0) return swap;
  const c = swap.computed;
  return {
    ...swap,
    grams: Math.round(swap.grams * k),
    ...(swap.recipe ? { servingsUsed: Math.round((swap.servingsUsed ?? 1) * k * 4) / 4 } : {}),
    computed: roundMacros({ kcal: c.kcal * k, proteinG: c.proteinG * k, carbsG: c.carbsG * k, fatG: c.fatG * k }),
  };
}

/** What a client sees for a planned food: a swap that fits, in place of food they said they
 * don't eat (canvas MP7 "She sees the tahini swap"). */
export function foodForThem(food: PlannedFood, avoid: DietTag[]): { food: PlannedFood; swappedFor: string | null } {
  if (!avoid.length || !foodBreaks(food, avoid).length) return { food, swappedFor: null };
  const fits = food.swaps?.find((s) => !foodBreaks(s, avoid).length);
  return fits ? { food: swapAmount(food, fits), swappedFor: food.name } : { food, swappedFor: null };
}

/** A diary item for a planned food, marked as from the plan. */
export function loggedFromPlan(
  planId: string, meal: PlannedMeal, planned: PlannedFood, eaten: PlannedFood, how: NonNullable<LoggedItem["plan"]>["how"],
): Omit<LoggedItem, "id"> {
  const slot: MealSlot = slotForMeal(meal);
  return {
    meal: slot,
    name: eaten.name,
    ...(eaten.brand ? { brand: eaten.brand } : {}),
    grams: eaten.grams,
    ...(eaten.servingLabel ? { servingLabel: eaten.servingLabel } : {}),
    ...(eaten.recipe ? { sourceId: eaten.recipe.id, sourceKind: "recipe" as const } : {}),
    computed: eaten.computed,
    ...(eaten.nutrients ? { nutrients: eaten.nutrients } : {}),
    plan: { planId, mealId: meal.id, foodId: planned.id, how },
  };
}

/** A planned food at a new amount (canvas Q7 "Change amounts"); 0 = skipped (null). */
export function atAmount(food: PlannedFood, grams: number): PlannedFood | null {
  if (!(grams > 0)) return null;
  const k = grams / food.grams;
  const c = food.computed;
  return { ...food, grams: Math.round(grams), computed: roundMacros({ kcal: c.kcal * k, proteinG: c.proteinG * k, carbsG: c.carbsG * k, fatG: c.fatG * k }) };
}

/** Which planned meals a day has logged (any of their foods). */
export function loggedMeals(day: DiaryDay | null, planId: string): Set<string> {
  return new Set((day?.items ?? []).filter((i) => i.plan?.planId === planId).map((i) => i.plan!.mealId));
}

/** The shopping for the days ahead (canvas MP8): each day's own meals (training or rest), with
 * recipes as their ingredients scaled to the servings, and what they see in place of food they
 * don't eat. */
export function groceryForDays(plan: CoachNutritionPlan, days: { dateIso: string; training: boolean }[], avoid: DietTag[] = []): { name: string; brand?: string; grams: number }[] {
  const byKey = new Map<string, { name: string; brand?: string; grams: number }>();
  const add = (name: string, brand: string | undefined, grams: number) => {
    const key = `${name}::${brand ?? ""}`.toLowerCase();
    const cur = byKey.get(key) ?? { name, ...(brand ? { brand } : {}), grams: 0 };
    cur.grams += grams;
    byKey.set(key, cur);
  };
  for (const d of days) {
    for (const m of planDay(plan, d.dateIso, d.training).meals) {
      for (const planned of m.foods) {
        const f = foodForThem(planned, avoid).food;
        if (f.recipe) for (const i of f.recipe.ingredients) add(i.name, i.brand, (i.grams / Math.max(1, f.recipe.servings)) * (f.servingsUsed ?? 1));
        else add(f.name, f.brand, f.grams);
      }
    }
  }
  return [...byKey.values()].map((x) => ({ ...x, grams: Math.round(x.grams) })).filter((x) => x.grams > 0).sort((a, b) => a.name.localeCompare(b.name));
}

/** How a day went against the plan, for the coach (canvas MP6 "4 of 5 · swapped dinner"). */
export function dayAgainstPlan(day: DiaryDay, plan: CoachNutritionPlan, meals: PlannedMeal[]): { logged: number; of: number; swapped: string[]; changed: boolean; offPlan: number } {
  const planned = meals.filter((m) => m.foods.length);
  const mine = day.items.filter((i) => i.plan?.planId === plan.id);
  const swapped = [...new Set(mine.filter((i) => i.plan!.how === "swapped").map((i) => planned.find((m) => m.id === i.plan!.mealId)?.name.toLowerCase()).filter((x): x is string => !!x))];
  return {
    logged: planned.filter((m) => mine.some((i) => i.plan!.mealId === m.id)).length,
    of: planned.length,
    swapped,
    changed: mine.some((i) => i.plan!.how === "changed"),
    offPlan: day.items.filter((i) => !i.plan).length,
  };
}
