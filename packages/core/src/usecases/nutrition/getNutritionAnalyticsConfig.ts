import {
  DEFAULT_NUTRITION_ANALYTICS_ID,
  resolveAnalyticsId,
  withAnalytics,
  type NutritionGoal,
} from "../../domain/nutrition";
import type { NutritionAnalyticsPluginMeta } from "../../domain/nutritionAnalytics";
import type { NutritionDeps } from "./deps";

export { DEFAULT_NUTRITION_ANALYTICS_ID };

export type NutritionAnalyticsConfigView = {
  selectedId: string;
  plugins: NutritionAnalyticsPluginMeta[];
};

export async function getNutritionAnalyticsConfig(
  goal: NutritionGoal | null,
  deps: Pick<NutritionDeps, "nutritionAnalyticsRegistry">,
): Promise<NutritionAnalyticsConfigView> {
  const plugins = await deps.nutritionAnalyticsRegistry.list();
  return { selectedId: resolveAnalyticsId(goal), plugins };
}

/** Return the goal with the selected analytics plugin set — caller saves + pushes it. */
export function setNutritionAnalytics(goal: NutritionGoal, analyticsId: string): NutritionGoal {
  return withAnalytics(goal, analyticsId || DEFAULT_NUTRITION_ANALYTICS_ID);
}
