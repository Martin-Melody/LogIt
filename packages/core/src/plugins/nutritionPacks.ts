import { createCoachNutritionPlan, type CoachNutritionPlan } from "../domain/CoachNutritionPlan";
import { recomputeRecipe, type Recipe } from "../domain/nutrition";

/**
 * Meal plan packs and recipe packs: content plugins (canvas Q1). Pure data a coach copies into
 * their own meal plans or recipes; no code, so they install whatever Restricted Mode says.
 * Copying makes the coach's own; a newer pack version never changes it.
 */

export const NUTRITION_PACK_FORMAT_VERSION = 1 as const;
export const MAX_PACK_PLANS = 20, MAX_PACK_MEALS = 10, MAX_PACK_FOODS = 30, MAX_PACK_RECIPES = 100, MAX_PACK_INGREDIENTS = 40;

export type MealPlanPack = { formatVersion: 1; pluginId: string; plans: CoachNutritionPlan[] };
export type RecipePack = { formatVersion: 1; pluginId: string; recipes: Recipe[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function parseMealPlanPack(raw: unknown, pluginId: string): MealPlanPack {
  if (!isObject(raw)) throw new Error("This pack isn't a meal plan pack.");
  if (raw.formatVersion !== NUTRITION_PACK_FORMAT_VERSION) throw new Error("This pack needs a newer LogIt.");
  if (!Array.isArray(raw.plans) || raw.plans.length === 0) throw new Error("This pack has no meal plans.");
  if (raw.plans.length > MAX_PACK_PLANS) throw new Error(`A pack can have up to ${MAX_PACK_PLANS} meal plans.`);
  const plans = raw.plans.map((p, i): CoachNutritionPlan => {
    if (!isObject(p) || typeof p.name !== "string" || !p.name.trim()) throw new Error(`Meal plan ${i + 1} is missing its name.`);
    if (!num(p.kcalTarget)) throw new Error(`"${p.name}" needs a daily calorie target.`);
    const meals = Array.isArray(p.meals) ? p.meals : [];
    if (meals.length > MAX_PACK_MEALS) throw new Error(`"${p.name}" has more than ${MAX_PACK_MEALS} meals.`);
    for (const m of meals) {
      if (!isObject(m) || typeof m.name !== "string" || !Array.isArray(m.foods) || m.foods.length > MAX_PACK_FOODS) throw new Error(`"${p.name}" has a meal without a name, or too many foods.`);
      for (const f of m.foods) if (!isObject(f) || typeof f.name !== "string" || !num(f.grams) || !isObject(f.computed)) throw new Error(`"${p.name}" has a food missing its name, grams or totals.`);
    }
    // A pack's ids are only its own: they're replaced when copied.
    return { ...createCoachNutritionPlan(p.name), ...(p as object), id: `${pluginId}#${i}`, archived: false, createdAtMs: 0, updatedAtMs: 0 } as CoachNutritionPlan;
  });
  return { formatVersion: NUTRITION_PACK_FORMAT_VERSION, pluginId, plans };
}

export function parseRecipePack(raw: unknown, pluginId: string): RecipePack {
  if (!isObject(raw)) throw new Error("This pack isn't a recipe pack.");
  if (raw.formatVersion !== NUTRITION_PACK_FORMAT_VERSION) throw new Error("This pack needs a newer LogIt.");
  if (!Array.isArray(raw.recipes) || raw.recipes.length === 0) throw new Error("This pack has no recipes.");
  if (raw.recipes.length > MAX_PACK_RECIPES) throw new Error(`A pack can have up to ${MAX_PACK_RECIPES} recipes.`);
  const recipes = raw.recipes.map((r, i): Recipe => {
    if (!isObject(r) || typeof r.name !== "string" || !r.name.trim()) throw new Error(`Recipe ${i + 1} is missing its name.`);
    if (!num(r.servings) || (r.servings as number) < 1) throw new Error(`"${r.name}" needs a number of servings.`);
    if (!Array.isArray(r.ingredients) || r.ingredients.length === 0 || r.ingredients.length > MAX_PACK_INGREDIENTS) throw new Error(`"${r.name}" needs 1 to ${MAX_PACK_INGREDIENTS} ingredients.`);
    for (const g of r.ingredients) if (!isObject(g) || typeof g.name !== "string" || !num(g.grams) || !isObject(g.computed)) throw new Error(`"${r.name}" has an ingredient missing its name, grams or totals.`);
    return recomputeRecipe({ ...(r as object), id: `${pluginId}#${i}` } as Recipe);
  });
  return { formatVersion: NUTRITION_PACK_FORMAT_VERSION, pluginId, recipes };
}
