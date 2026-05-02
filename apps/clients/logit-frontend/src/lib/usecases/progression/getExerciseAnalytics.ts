import { getWorkoutRepo, getAnalyticsRegistry } from "$lib/data/repoProvider";
import { getExercises } from "$lib/domain/workout";
import type { ExerciseHistoryEntry } from "$lib/domain/progression";
import type { AnalyticsOutput } from "$lib/domain/analytics";

const DEFAULT_ANALYTICS_ID = "basic-analytics";

export async function getExerciseAnalytics(
  exercise: { id?: string; name: string },
): Promise<AnalyticsOutput | null> {
  const [sessions, registry] = await Promise.all([
    getWorkoutRepo().listAllSessions(),
    getAnalyticsRegistry(),
  ]);

  const plugin = await registry.get(DEFAULT_ANALYTICS_ID);
  if (!plugin) return null;

  const history: ExerciseHistoryEntry[] = sessions
    .flatMap((session) => {
      const match = getExercises(session).find((e) =>
        exercise.id ? e.exerciseId === exercise.id : e.exerciseName.toLowerCase() === exercise.name.toLowerCase(),
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

  return plugin.compute({ exercise, history });
}
