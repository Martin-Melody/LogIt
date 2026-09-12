import { getExercises, findExerciseIndexInSession } from "../../domain/workout";
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

  const history: ExerciseHistoryEntry[] = sessions
    .filter((session) => !session.excludeFromProgression)
    .flatMap((session) => {
      const sessionPosition = findExerciseIndexInSession(session, exercise);
      if (sessionPosition === -1) return [];
      const match = getExercises(session)[sessionPosition]!;
      return [{
        sessionId: session.id,
        performedAtMs: session.endedAtMs ?? session.startedAtMs,
        sets: match.sets,
        sessionPosition,
      } satisfies ExerciseHistoryEntry];
    })
    .sort((a, b) => a.performedAtMs - b.performedAtMs); // oldest first

  return { history, exerciseData };
}
