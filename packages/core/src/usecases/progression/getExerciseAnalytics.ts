import type { AnalyticsMetricDefinition, AnalyticsOutput } from "../../domain/analytics";
import { resolveAnalyticsId } from "./getAnalyticsConfig";
import { getExerciseHistory } from "./getExerciseHistory";
import type { ProgressionDeps } from "./deps";

export type ExerciseAnalyticsResult = {
  output: AnalyticsOutput;
  metricDefinitions: AnalyticsMetricDefinition[];
};

export async function getExerciseAnalytics(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo" | "progressionRepo" | "analyticsRegistry">,
): Promise<ExerciseAnalyticsResult | null> {
  const [{ history, exerciseData }, analyticsId] = await Promise.all([
    getExerciseHistory(exercise, deps),
    resolveAnalyticsId(deps),
  ]);

  const plugin = await deps.analyticsRegistry.get(analyticsId);
  if (!plugin) return null;
  if (history.length === 0) return null;

  const exerciseWithType = {
    ...exercise,
    exerciseType: exerciseData?.exerciseType,
  };

  const output = await plugin.compute({ exercise: exerciseWithType, history });
  return { output, metricDefinitions: plugin.metricDefinitions };
}
