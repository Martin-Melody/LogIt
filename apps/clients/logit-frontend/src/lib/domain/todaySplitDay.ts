import type { WorkoutSplit, SplitDay } from "@logit/core/domain/WorkoutSplit";
import { getNextDay } from "$lib/usecases/Splits/splitRotation";

export function getTodaySplitDay(split: WorkoutSplit): SplitDay | null {
  return getNextDay(split);
}
