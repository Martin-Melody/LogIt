import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { SplitDay, WorkoutSplit } from "$lib/domain/WorkoutSplit";
import {
  type WorkoutSession,
  createSession,
  addExercise,
  addSet,
} from "$lib/domain/workout";

function sortByOrderIndex<T extends { orderIndex: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function startSessionFromSplitDay(
  split: WorkoutSplit,
  day: SplitDay
): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();

  let session: WorkoutSession = {
    ...createSession(),
    origin: {
      splitId: split.id,
      splitName: split.name,
      dayId: day.id,
      dayName: day.name,
    },
  };

  const plannedExercises = sortByOrderIndex(day.exercises);

  for (const pex of plannedExercises) {
    session = addExercise(session, {
      exerciseName: pex.exerciseName,
      exerciseId: pex.exerciseId,
    });

    const addedExerciseEntry = session.exercises[session.exercises.length - 1];
    if (!addedExerciseEntry) continue;

    const targetSets = pex.targets?.sets ?? 0;

    for (let i = 0; i < targetSets; i++) {
      session = addSet(session, addedExerciseEntry.id, {
        setType: "normal",
        reps: pex.targets?.reps ?? 0,
        weight: pex.targets?.weight ?? 0,
      });
    }
  }

  await repo.saveDraftSession(session);
  return session;
}
