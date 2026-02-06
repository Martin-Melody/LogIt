import { getSplitRepo } from "$lib/data/repoProvider";
import { createSplit, touchSplit, type WorkoutSplit } from "$lib/domain/WorkoutSplit";

export async function createSplitUsecase(name?: string): Promise<WorkoutSplit> {
  const split = touchSplit(createSplit(name));
  await getSplitRepo().saveSplit(split);
  return split;
}
