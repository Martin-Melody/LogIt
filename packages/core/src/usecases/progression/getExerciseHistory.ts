import { getExercises } from "../../domain/workout";
import type { ExerciseHistoryEntry } from "../../domain/progression";
import type { Exercise } from "../../domain/exercise";
import type { ProgressionDeps } from "./deps";

export type ExerciseHistoryResult = {
  history: ExerciseHistoryEntry[]; // oldest first
  exerciseData: Exercise | null;
};

export async function getExerciseHistory(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo">,
): Promise<ExerciseHistoryResult> {
  const [sessions, exerciseData] = await Promise.all([
    deps.workoutRepo.listAllSessions(),
    exercise.id
      ? deps.exerciseRepo.getById(exercise.id)
      : deps.exerciseRepo.getByName(exercise.name),
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
