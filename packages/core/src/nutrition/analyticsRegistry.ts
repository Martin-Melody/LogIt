import type {
  NutritionAnalyticsPlugin,
  NutritionAnalyticsPluginMeta,
  NutritionAnalyticsRegistry,
} from "../domain/nutritionAnalytics";
import { basicNutritionAnalytics } from "./analytics/basicNutritionAnalytics";

const BUILTIN: NutritionAnalyticsPlugin[] = [basicNutritionAnalytics];

export function createLocalNutritionAnalyticsRegistry(): NutritionAnalyticsRegistry {
  return {
    async list(): Promise<NutritionAnalyticsPluginMeta[]> {
      return BUILTIN.map(({ id, name, description, author, metricDefinitions }) => ({
        id,
        name,
        description,
        author,
        metricDefinitions,
      }));
    },
    async get(id: string): Promise<NutritionAnalyticsPlugin | null> {
      return BUILTIN.find((p) => p.id === id) ?? null;
    },
  };
}
