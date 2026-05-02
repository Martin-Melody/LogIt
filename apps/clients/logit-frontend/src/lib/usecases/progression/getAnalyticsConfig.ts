import { getProgressionRepo, getAnalyticsRegistry } from "$lib/data/repoProvider";
import type { AnalyticsPluginMeta, UserAnalyticsConfig } from "$lib/domain/analytics";

export const DEFAULT_ANALYTICS_ID = "basic-analytics";

export type AnalyticsConfigView = {
  config: UserAnalyticsConfig | null;
  plugins: AnalyticsPluginMeta[];
};

export async function getAnalyticsConfig(): Promise<AnalyticsConfigView> {
  const [config, plugins] = await Promise.all([
    getProgressionRepo().getAnalyticsConfig(),
    getAnalyticsRegistry().list(),
  ]);
  return { config, plugins };
}

export async function setAnalyticsPlugin(analyticsId: string): Promise<void> {
  if (!analyticsId) {
    await getProgressionRepo().clearAnalyticsConfig();
    return;
  }
  await getProgressionRepo().saveAnalyticsConfig({ analyticsId });
}

export async function resolveAnalyticsId(): Promise<string> {
  const config = await getProgressionRepo().getAnalyticsConfig();
  return config?.analyticsId ?? DEFAULT_ANALYTICS_ID;
}
