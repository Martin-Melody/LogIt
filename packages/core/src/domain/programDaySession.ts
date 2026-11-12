// The workout a coach program day starts: one exercise per strength block, one
// (uncompleted) set per prescribed set with the target reps/weight already entered so the
// user just confirms or adjusts. Cardio blocks are added empty. Blocks the coach gave the
// same `supersetGroup` become one superset (two) or circuit (more).

import type { ProgramDay, ProgramStrength } from "./CoachProgram";
import {
  type WorkoutSession,
  createSession,
  addExercise,
  addSet,
  addCardioBlock,
  getExercises,
  groupIntoSuperset,
} from "./workout";

function sortByOrderIndex<T extends { orderIndex: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.orderIndex - b.orderIndex);
}

function targetReps(set: ProgramStrength["sets"][number]): number {
  return set.reps ?? set.repsMin ?? 0;
}

/** The workout a coach program day starts, not yet saved. */
export function programDaySession(day: ProgramDay): WorkoutSession {
  let session = createSession();
  const groups = new Map<string, string[]>();

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
    const group = block.supersetGroup?.trim();
    if (group) groups.set(group, [...(groups.get(group) ?? []), session.blocks.at(-1)!.id]);
  }

  for (const ids of groups.values()) {
    if (ids.length >= 2) session = groupIntoSuperset(session, ids);
  }
  return session;
}
