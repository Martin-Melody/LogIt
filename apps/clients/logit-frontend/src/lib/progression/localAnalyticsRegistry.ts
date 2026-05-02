import type { AnalyticsPlugin, AnalyticsPluginMeta, AnalyticsRegistry } from "$lib/domain/analytics";
import { basicAnalytics } from "./analytics/basicAnalytics";

const BUILTIN: AnalyticsPlugin[] = [basicAnalytics];

export function createLocalAnalyticsRegistry(): AnalyticsRegistry {
  return {
    async list(): Promise<AnalyticsPluginMeta[]> {
      return BUILTIN.map(({ id, name, description, author, metricDefinitions }) => ({
        id,
        name,
        description,
        author,
        metricDefinitions,
      }));
    },

    async get(id: string): Promise<AnalyticsPlugin | null> {
      return BUILTIN.find((p) => p.id === id) ?? null;
    },
  };
}
