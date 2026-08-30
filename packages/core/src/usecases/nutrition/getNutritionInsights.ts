import { localDateIso, resolveAnalyticsId } from "../../domain/nutrition";
import type {
  NutritionAnalyticsOutput,
  NutritionAnalyticsPluginMeta,
} from "../../domain/nutritionAnalytics";
import type { NutritionDeps } from "./deps";
import { getNutritionTargets } from "./getNutritionTargets";

const DAY_MS = 86_400_000;

export type NutritionInsightsView = {
  plugin: NutritionAnalyticsPluginMeta | null;
  output: NutritionAnalyticsOutput | null;
  range: { startIso: string; endIso: string; days: number };
};

/** Run the configured nutrition analytics plugin over the last `rangeDays` of data. */
export async function getNutritionInsights(
  deps: Pick<
    NutritionDeps,
    "nutritionRepo" | "nutritionAlgorithmRegistry" | "nutritionAnalyticsRegistry"
  >,
  opts: { rangeDays?: number; fallbackWeightKg?: number | null; now?: number } = {},
): Promise<NutritionInsightsView> {
  const now = opts.now ?? Date.now();
  const rangeDays = opts.rangeDays ?? 30;
  const startIso = localDateIso(new Date(now - rangeDays * DAY_MS));
  const endIso = localDateIso(new Date(now));

  const [state, days, weightEntries] = await Promise.all([
    getNutritionTargets(deps, { fallbackWeightKg: opts.fallbackWeightKg, now }),
    deps.nutritionRepo.listDaysInRange(startIso, endIso),
    deps.nutritionRepo.listWeightEntries(),
  ]);

  const analyticsId = resolveAnalyticsId(state.goal);
  const plugin = await deps.nutritionAnalyticsRegistry.get(analyticsId);
  const range = { startIso, endIso, days: rangeDays };

  if (!plugin) return { plugin: null, output: null, range };

  const output = plugin.compute({
    days,
    weightEntries,
    goal: state.goal,
    targets: state.targets?.macros ?? null,
    range: { startIso, endIso },
    now,
  });

  return {
    plugin: {
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      author: plugin.author,
      metricDefinitions: plugin.metricDefinitions,
    },
    output,
    range,
  };
}
