import { getWorkoutRepo, getAnalyticsRegistry, getExerciseRepo } from "$lib/data/repoProvider";
import { getExercises } from "$lib/domain/workout";
import type { ExerciseHistoryEntry } from "$lib/domain/progression";
import type { AnalyticsMetricDefinition, AnalyticsOutput } from "$lib/domain/analytics";
import { resolveAnalyticsId } from "./getAnalyticsConfig";

export type ExerciseAnalyticsResult = {
  output: AnalyticsOutput;
  metricDefinitions: AnalyticsMetricDefinition[];
};

export async function getExerciseAnalytics(
  exercise: { id?: string; name: string },
): Promise<ExerciseAnalyticsResult | null> {
  const [sessions, registry, analyticsId, exerciseData] = await Promise.all([
    getWorkoutRepo().listAllSessions(),
    getAnalyticsRegistry(),
    resolveAnalyticsId(),
    exercise.id
      ? getExerciseRepo().getById(exercise.id)
      : getExerciseRepo().getByName(exercise.name),
  ]);

  const plugin = await registry.get(analyticsId);
  if (!plugin) return null;

  const lowerName = exercise.name.toLowerCase();

  const history: ExerciseHistoryEntry[] = sessions
    .filter((session) => !session.excludeFromProgression)
    .flatMap((session) => {
      const match = getExercises(session).find((e) =>
        (exercise.id && e.exerciseId === exercise.id) ||
        e.exerciseName.toLowerCase() === lowerName,
      );
      if (!match) return [];
      return [{
        sessionId: session.id,
        performedAtMs: session.endedAtMs ?? session.startedAtMs,
        sets: match.sets,
      } satisfies ExerciseHistoryEntry];
    })
    .sort((a, b) => a.performedAtMs - b.performedAtMs); // oldest first for analytics

  if (history.length === 0) return null;

  const exerciseWithType = {
    ...exercise,
    exerciseType: exerciseData?.exerciseType,
  };

  const output = plugin.compute({ exercise: exerciseWithType, history });
  return { output, metricDefinitions: plugin.metricDefinitions };
}
