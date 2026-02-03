import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { SplitDay } from "$lib/domain/WorkoutSplit";
import {
  type WorkoutSession,
  createSession,
  addExercise,
  addSet,
} from "$lib/domain/workout";

function sortByOrderIndex<T extends { orderIndex: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function startSessionFromSplitDay(day: SplitDay): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();

  let session = createSession();

  const plannedExercises = sortByOrderIndex(day.exercises);

  for (const pex of plannedExercises) {
    // Add exercise entry
    session = addExercise(session, {
      exerciseName: pex.exerciseName,
      exerciseId: pex.exerciseId,
    });

    const addedExerciseEntry = session.exercises[session.exercises.length - 1];
    if (!addedExerciseEntry) continue;

    // Pre-create sets if a target exists
    const targetSets = pex.targets?.sets ?? 0;

    for (let i = 0; i < targetSets; i++) {
      session = addSet(session, addedExerciseEntry.id, {
        setType: "normal",
        reps: pex.targets?.reps ?? 0,
        weight: pex.targets?.weight ?? 0,
      });
    }
  }

  // Persist draft immediately so the user can resume after app close
  await repo.saveDraftSession(session);

  return session;
}

