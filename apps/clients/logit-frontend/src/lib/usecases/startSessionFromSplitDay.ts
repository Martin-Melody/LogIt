import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { SplitDay } from "$lib/domain/WorkoutSplit";
import {
  type WorkoutSession,
  createSession,
  addExercise,
  addCardioBlock,
} from "$lib/domain/workout";

function sortByOrderIndex<T extends { orderIndex: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function startSessionFromSplitDay(day: SplitDay): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();

  let session = createSession();

  for (const block of sortByOrderIndex(day.blocks)) {
    if (block.type === "strength") {
      session = addExercise(session, {
        exerciseName: block.exerciseName,
        exerciseId: block.exerciseId,
      });
    } else if (block.type === "cardio") {
      session = addCardioBlock(session, block.activityName);
    }
  }

  await repo.saveDraftSession(session);

  return session;
}
