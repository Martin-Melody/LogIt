import type { StrengthBlockData, WorkoutSession } from "./workout";
import type { WorkoutSplit } from "./WorkoutSplit";
import type { GoalTarget } from "./goals";

/**
 * "Same as Belt Squat?" (design canvas I3): an exercise someone made by name turns out to be
 * one in the library. Everything that names the made one is pointed at the library one instead;
 * these say what changes, and return null when nothing does (so only changed rows are saved).
 */
export type ExerciseRef = { id: string; name: string };

/** A block of the made exercise: by its id, or by its name when the block has no id. */
const isFrom = (b: { exerciseId?: string; exerciseName: string }, from: ExerciseRef) =>
  b.exerciseId ? b.exerciseId === from.id : b.exerciseName.trim().toLowerCase() === from.name.trim().toLowerCase();

export function mergeExerciseInSession(s: WorkoutSession, from: ExerciseRef, to: ExerciseRef): WorkoutSession | null {
  let changed = false;
  const blocks = s.blocks.map((b) => {
    if (b.type !== "strength" || !isFrom(b.data as StrengthBlockData, from)) return b;
    changed = true;
    return { ...b, data: { ...(b.data as StrengthBlockData), exerciseId: to.id, exerciseName: to.name } };
  });
  return changed ? { ...s, blocks } : null;
}

export function mergeExerciseInSplit(split: WorkoutSplit, from: ExerciseRef, to: ExerciseRef): WorkoutSplit | null {
  let changed = false;
  const days = split.days.map((d) => ({
    ...d,
    blocks: d.blocks.map((b) => {
      if (b.type !== "strength" || !isFrom(b, from)) return b;
      changed = true;
      return { ...b, exerciseId: to.id, exerciseName: to.name };
    }),
  }));
  return changed ? { ...split, days, updatedAtMs: Date.now() } : null;
}

export function mergeExerciseInGoal(target: GoalTarget, from: ExerciseRef, to: ExerciseRef): GoalTarget | null {
  if (target.type === "count" || !isFrom(target, from)) return null;
  return { ...target, exerciseId: to.id, exerciseName: to.name };
}
