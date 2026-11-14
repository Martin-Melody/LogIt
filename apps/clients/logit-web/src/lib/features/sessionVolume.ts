import type { WorkoutSession, StrengthBlockData } from "@logit/core/domain/workout";

/** Working sets only: weight × reps. Bodyweight work without added load counts as 0. */
export function sessionVolumeKg(s: WorkoutSession): number {
  let kg = 0;
  for (const b of s.blocks) {
    if (b.type !== "strength") continue;
    for (const set of (b.data as StrengthBlockData).sets) {
      if (set.setType && set.setType !== "normal") continue;
      if (set.completed === false) continue;
      kg += (set.weight || 0) * (set.reps || 0);
    }
  }
  return kg;
}
