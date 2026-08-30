import type { NutritionRepo } from "../../data/nutritionRepo";
import type { FoodDbRepo } from "../../data/foodDbRepo";
import type { NutritionAlgorithmRegistry } from "../../domain/nutritionAlgorithm";
import type { NutritionAnalyticsRegistry } from "../../domain/nutritionAnalytics";

/** Repo + registry bundle for the @logit/core nutrition usecases. Each usecase takes only
 * the subset it needs via Pick, so callers can pass the whole bag. Mirrors ProgressionDeps. */
export type NutritionDeps = {
  nutritionRepo: NutritionRepo;
  foodDbRepo: FoodDbRepo;
  nutritionAlgorithmRegistry: NutritionAlgorithmRegistry;
  nutritionAnalyticsRegistry: NutritionAnalyticsRegistry;
};
