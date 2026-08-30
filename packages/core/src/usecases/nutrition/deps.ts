import type { NutritionRepo } from "../../data/nutritionRepo";
import type { FoodDbRepo } from "../../data/foodDbRepo";
import type { AssignedNutritionPlanRepo } from "../../data/coachNutritionPlanRepo";
import type { NutritionAlgorithmRegistry } from "../../domain/nutritionAlgorithm";
import type { NutritionAnalyticsRegistry } from "../../domain/nutritionAnalytics";

/** Repo + registry bundle for the @logit/core nutrition usecases. Each usecase takes only
 * the subset it needs via Pick, so callers can pass the whole bag. Mirrors ProgressionDeps. */
export type NutritionDeps = {
  nutritionRepo: NutritionRepo;
  foodDbRepo: FoodDbRepo;
  nutritionAlgorithmRegistry: NutritionAlgorithmRegistry;
  nutritionAnalyticsRegistry: NutritionAnalyticsRegistry;
  /** Coach-assigned nutrition plan mirror. Present on the mobile client; a coach-assigned
   * plan supersedes the algorithm's target. Absent when there's no coach layer in play. */
  assignedNutritionPlanRepo?: AssignedNutritionPlanRepo;
};
