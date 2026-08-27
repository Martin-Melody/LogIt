import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { ProgramDay, ProgramStrength } from "@logit/core/domain/CoachProgram";
import {
  type WorkoutSession,
  createSession,
  addExercise,
  addSet,
  addCardioBlock,
  getExercises,
} from "@logit/core/domain/workout";

function sortByOrderIndex<T extends { orderIndex: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.orderIndex - b.orderIndex);
}

function targetReps(set: ProgramStrength["sets"][number]): number {
  return set.reps ?? set.repsMin ?? 0;
}

/** Builds a draft session pre-filled from a coach program day: one exercise per strength
 * block, one (uncompleted) set per prescribed set with the target reps/weight already
 * entered so the user just confirms or adjusts. Cardio blocks are added empty. */
export async function startSessionFromProgramDay(day: ProgramDay): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();
  let session = createSession();

  for (const block of sortByOrderIndex(day.blocks)) {
    if (block.type === "strength") {
      session = addExercise(session, {
        exerciseName: block.exerciseName,
        exerciseId: block.exerciseId,
      });
      const entryId = getExercises(session).at(-1)?.id;
      if (entryId) {
        for (const set of sortByOrderIndex(block.sets)) {
          session = addSet(session, entryId, {
            reps: targetReps(set),
            weight: set.weight ?? 0,
            setType: set.setType,
          });
        }
      }
    } else if (block.type === "cardio") {
      session = addCardioBlock(session, block.activityName);
    }
  }

  await repo.saveDraftSession(session);
  return session;
}
