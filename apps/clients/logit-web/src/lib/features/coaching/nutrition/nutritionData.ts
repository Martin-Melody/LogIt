import { getOwnNutritionDeps, getWebCoachNutritionPlanRepo } from "$lib/deps";
import type { MyCoachNutritionPlan } from "@logit/core/data/coachNutritionPlanRepo";
import type { Recipe } from "@logit/core/domain/nutrition";

/** Nutrition › everything the three tabs show: your meal plans (and clients' copies, to count
 * them) and your recipes (the same ones as your own Recipes). */
export async function loadCoachNutrition(): Promise<{ rows: MyCoachNutritionPlan[]; recipes: Recipe[] }> {
  const [rows, recipes] = await Promise.all([
    getWebCoachNutritionPlanRepo().listMine().catch(() => []),
    getOwnNutritionDeps().nutritionRepo.listRecipes().catch(() => []),
  ]);
  return { rows, recipes: recipes.filter((r) => !r.deletedAtMs) };
}
