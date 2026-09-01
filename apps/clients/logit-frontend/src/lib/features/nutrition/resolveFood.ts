import {
  loggedItemPer100g,
  recipeAsFood,
  type FoodRef,
  type LoggedItem,
  type MacroTotals,
  type ServingOption,
} from "@logit/core/domain/nutrition";
import { getNutritionRepo, getFoodDbRepo } from "$lib/data/repoProvider";

/**
 * Look a food id up across all three sources the diary can log from: the user's custom
 * foods, their recipes, and the bundled reference DB. Returns null if none match (e.g. a
 * reference food that isn't in this build of the DB).
 */
export async function resolveFoodRef(id: string): Promise<FoodRef | null> {
  const repo = getNutritionRepo();
  const custom = await repo.getCustomFood(id).catch(() => null);
  if (custom && !custom.deletedAtMs) return custom.food;

  const recipe = await repo.getRecipe(id).catch(() => null);
  if (recipe && !recipe.deletedAtMs) return recipeAsFood(recipe);

  return getFoodDbRepo().getFood(id).catch(() => null);
}

export type ItemBasis = {
  /** Per-100 g macros to rescale from. */
  per100g: MacroTotals;
  /** Portions to offer (always includes raw units in the UI). */
  servings: ServingOption[];
  /** True when the numbers came from the live source food, false when recovered from the
   * logged snapshot (source gone, or a quick-add). */
  fromSource: boolean;
};

/**
 * The macro basis to use when editing a logged item's amount. Prefers the current source
 * food (so a corrected portion reflects any later fix to that food); falls back to the
 * per-100 g basis recovered from the item's own snapshot.
 */
export async function basisForItem(item: LoggedItem): Promise<ItemBasis | null> {
  if (item.sourceId) {
    const food = await resolveFoodRef(item.sourceId);
    if (food) return { per100g: food.per100g, servings: food.servings, fromSource: true };
  }
  const per100g = loggedItemPer100g(item);
  if (per100g) return { per100g, servings: [{ id: "g", label: "100 g", grams: 100 }], fromSource: false };
  return null;
}
