import { loggedExercises } from "../../domain/loggedSets";
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
  // includeExcluded: also sessions marked "Exclude from progression" (goals count a real
  // set wherever it was done).
  opts: { excludeSessionId?: string; includeExcluded?: boolean } = {},
): Promise<ExerciseHistoryResult> {
  const [sessions, exerciseData] = await Promise.all([
    deps.workoutRepo.listAllSessions(),
    exercise.id
      ? deps.exerciseRepo.getById(exercise.id)
      : deps.exerciseRepo.getByName(exercise.name),
  ]);

  const history: ExerciseHistoryEntry[] = sessions
    .filter((session) => (opts.includeExcluded || !session.excludeFromProgression) && session.id !== opts.excludeSessionId)
    .flatMap((session) => {
      // Every set of this lift that session, whichever block logged it (Phase 6.1): a normal
      // exercise, or a plugin block whose entries count as sets.
      const all = loggedExercises(session);
      const lower = exercise.name.toLowerCase();
      const matches = all.map((e, i) => ({ e, i })).filter(({ e }) => (exercise.id && e.exerciseId === exercise.id) || e.exerciseName.toLowerCase() === lower);
      if (matches.length === 0) return [];
      const sessionPosition = matches[0]!.i;
      // A set that was planned but never done (no reps, not ticked) isn't history,
      // and an exercise with nothing done that session (skipped) isn't either —
      // otherwise skipping it once wiped its plan back to 0kg.
      // Sets done without the kit the plan counted on (a forgotten pin, 6.15) aren't a step back.
      const done = matches.flatMap(({ e }) => e.sets).filter((s) => (s.completed || s.reps > 0) && !s.withoutKit?.length);
      if (done.length === 0) return [];
      return [{
        sessionId: session.id,
        performedAtMs: session.endedAtMs ?? session.startedAtMs,
        sets: done,
        sessionPosition,
        ...(matches.some(({ e }) => e.from) ? { from: matches.find(({ e }) => e.from)!.e.from } : {}),
      } satisfies ExerciseHistoryEntry];
    })
    .sort((a, b) => a.performedAtMs - b.performedAtMs); // oldest first

  return { history, exerciseData };
}
