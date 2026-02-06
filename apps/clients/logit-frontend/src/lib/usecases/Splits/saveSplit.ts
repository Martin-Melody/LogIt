import { getSplitRepo } from "$lib/data/repoProvider";
import { touchSplit, type WorkoutSplit } from "$lib/domain/WorkoutSplit";

export async function saveSplit(split: WorkoutSplit): Promise<void> {
  await getSplitRepo().saveSplit(touchSplit(split));
}
