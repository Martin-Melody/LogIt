import type { NutritionDeps } from "@logit/core/usecases/nutrition/deps";
import {
  getNutritionRepo,
  getFoodDbRepo,
  getNutritionAlgorithmRegistry,
  getNutritionAnalyticsRegistry,
} from "$lib/data/repoProvider";

/** Repo + registry bundle for the @logit/core nutrition usecases — the same shape a
 * cloud-backed web build would provide, so the usecases stay platform-agnostic. */
export function getNutritionDeps(): NutritionDeps {
  return {
    nutritionRepo: getNutritionRepo(),
    foodDbRepo: getFoodDbRepo(),
    nutritionAlgorithmRegistry: getNutritionAlgorithmRegistry(),
    nutritionAnalyticsRegistry: getNutritionAnalyticsRegistry(),
  };
}
