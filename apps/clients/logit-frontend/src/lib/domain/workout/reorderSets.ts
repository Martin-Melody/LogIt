import type { WorkoutSession, SetEntry } from "$lib/domain/workout";

export function reorderSetsInExercise(
  session: WorkoutSession,
  exerciseEntryId: string,
  nextSets: SetEntry[],
): WorkoutSession {
  const nextExercises = session.exercises.map((ex) => {
    if (ex.id !== exerciseEntryId) return ex;

    const reindexed = nextSets.map((s, i) => ({
      ...s,
      orderIndex: i,
    }));

    return { ...ex, sets: reindexed };
  });

  return { ...session, exercises: nextExercises };
}

