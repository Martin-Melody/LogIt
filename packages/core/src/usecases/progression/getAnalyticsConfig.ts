import type { AnalyticsPluginMeta, UserAnalyticsConfig } from "../../domain/analytics";
import type { ProgressionDeps } from "./deps";

export const DEFAULT_ANALYTICS_ID = "basic-analytics";

export type AnalyticsConfigView = {
  config: UserAnalyticsConfig | null;
  plugins: AnalyticsPluginMeta[];
};

export async function getAnalyticsConfig(
  deps: Pick<ProgressionDeps, "progressionRepo" | "analyticsRegistry">,
): Promise<AnalyticsConfigView> {
  const [config, plugins] = await Promise.all([
    deps.progressionRepo.getAnalyticsConfig(),
    deps.analyticsRegistry.list(),
  ]);
  return { config, plugins };
}

export async function setAnalyticsPlugin(
  analyticsId: string,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  if (!analyticsId) {
    await deps.progressionRepo.clearAnalyticsConfig();
    return;
  }
  await deps.progressionRepo.saveAnalyticsConfig({ analyticsId });
}

export async function resolveAnalyticsId(
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<string> {
  const config = await deps.progressionRepo.getAnalyticsConfig();
  return config?.analyticsId ?? DEFAULT_ANALYTICS_ID;
}
