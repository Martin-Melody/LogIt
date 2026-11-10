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
  // The session being logged right now. On the phone the draft lives in the same
  // table as finished sessions, so without this it reads as "last time".
  opts: { excludeSessionId?: string } = {},
): Promise<ExerciseHistoryResult> {
  const [sessions, exerciseData] = await Promise.all([
    deps.workoutRepo.listAllSessions(),
    exercise.id
      ? deps.exerciseRepo.getById(exercise.id)
      : deps.exerciseRepo.getByName(exercise.name),
  ]);

  const history: ExerciseHistoryEntry[] = sessions
    .filter((session) => !session.excludeFromProgression && session.id !== opts.excludeSessionId)
    .flatMap((session) => {
      const sessionPosition = findExerciseIndexInSession(session, exercise);
      if (sessionPosition === -1) return [];
      const match = getExercises(session)[sessionPosition]!;
      return [{
        sessionId: session.id,
        performedAtMs: session.endedAtMs ?? session.startedAtMs,
        // A set that was planned but never done (no reps, not ticked) isn't history.
        sets: match.sets.filter((s) => s.completed || s.reps > 0),
        sessionPosition,
      } satisfies ExerciseHistoryEntry];
    })
    .sort((a, b) => a.performedAtMs - b.performedAtMs); // oldest first

  return { history, exerciseData };
}
