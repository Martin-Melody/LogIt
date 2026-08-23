import { getAnalyticsRegistry } from "$lib/data/repoProvider";
import type { AnalyticsMetricDefinition, AnalyticsOutput } from "$lib/domain/analytics";
import { resolveAnalyticsId } from "./getAnalyticsConfig";
import { getExerciseHistory } from "./getExerciseHistory";

export type ExerciseAnalyticsResult = {
  output: AnalyticsOutput;
  metricDefinitions: AnalyticsMetricDefinition[];
};

export async function getExerciseAnalytics(
  exercise: { id?: string; name: string },
): Promise<ExerciseAnalyticsResult | null> {
  const [{ history, exerciseData }, registry, analyticsId] = await Promise.all([
    getExerciseHistory(exercise),
    getAnalyticsRegistry(),
    resolveAnalyticsId(),
  ]);

  const plugin = await registry.get(analyticsId);
  if (!plugin) return null;
  if (history.length === 0) return null;

  const exerciseWithType = {
    ...exercise,
    exerciseType: exerciseData?.exerciseType,
  };

  const output = plugin.compute({ exercise: exerciseWithType, history });
  return { output, metricDefinitions: plugin.metricDefinitions };
}
