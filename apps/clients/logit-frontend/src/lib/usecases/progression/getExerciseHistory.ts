import { getWorkoutRepo, getExerciseRepo } from "$lib/data/repoProvider";
import { getExercises } from "$lib/domain/workout";
import type { ExerciseHistoryEntry } from "$lib/domain/progression";
import type { Exercise } from "$lib/domain/exercise";

export type ExerciseHistoryResult = {
  history: ExerciseHistoryEntry[]; // oldest first
  exerciseData: Exercise | null;
};

export async function getExerciseHistory(
  exercise: { id?: string; name: string },
): Promise<ExerciseHistoryResult> {
  const [sessions, exerciseData] = await Promise.all([
    getWorkoutRepo().listAllSessions(),
    exercise.id
      ? getExerciseRepo().getById(exercise.id)
      : getExerciseRepo().getByName(exercise.name),
  ]);

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
    .sort((a, b) => a.performedAtMs - b.performedAtMs); // oldest first

  return { history, exerciseData };
}
