import { getSplitRepo } from "$lib/data/repoProvider";
import { touchSplit, type WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import { pushSplit } from "$lib/sync/syncService";

export async function saveSplit(split: WorkoutSplit): Promise<void> {
  const touched = touchSplit(split);
  await getSplitRepo().saveSplit(touched);
  pushSplit(touched);
}
