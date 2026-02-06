import { getSplitRepo } from "$lib/data/repoProvider";
import type { ListSplitsOptions } from "$lib/data/splitRepo";
import type { WorkoutSplit } from "$lib/domain/WorkoutSplit";

export async function listSplits(options?: ListSplitsOptions): Promise<WorkoutSplit[]> {
  return getSplitRepo().getListSplits(options);
}
