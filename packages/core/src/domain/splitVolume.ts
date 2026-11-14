import type { MuscleGroup } from "./exercise";
import type { PlannedStrength, WorkoutSplit } from "./WorkoutSplit";
import { plannedSetCount } from "./WorkoutSplit";

/**
 * Planned hard sets per muscle for one pass through a split: one week for a weekday split,
 * one time round for a rotation. Each working set counts once for each of the exercise's
 * main (primary) muscles; secondary muscles aren't counted, so the numbers stay easy to
 * check by hand. Exercises the lookup doesn't know, or with no set target, are tallied in
 * `uncounted` instead.
 */
export type SplitMuscleSets = { byMuscle: Map<MuscleGroup, number>; uncounted: number };

export function plannedSetsByMuscle(
  split: Pick<WorkoutSplit, "days">,
  primaryMuscles: (block: PlannedStrength) => MuscleGroup[] | undefined,
): SplitMuscleSets {
  const byMuscle = new Map<MuscleGroup, number>();
  let uncounted = 0;
  for (const day of split.days) {
    if (day.rest) continue;
    for (const block of day.blocks) {
      if (block.type !== "strength") continue;
      const sets = plannedSetCount(day, block) ?? 0;
      const muscles = primaryMuscles(block);
      if (!muscles?.length || sets <= 0) {
        uncounted += Math.max(sets, 0);
        continue;
      }
      for (const m of muscles) byMuscle.set(m, (byMuscle.get(m) ?? 0) + sets);
    }
  }
  return { byMuscle, uncounted };
}

/**
 * Below this many hard sets a week a muscle is flagged as low. Around 6 a week is the low
 * end of what most hypertrophy guidelines suggest as worth doing; it's a nudge, not a rule.
 */
export const LOW_WEEKLY_SETS = 6;

/** The muscles the split editor always lists (shown even at 0 so a gap stands out). */
export const MAIN_MUSCLES: MuscleGroup[] = ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "biceps", "triceps"];
