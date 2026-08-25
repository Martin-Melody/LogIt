import { getSplitRepo } from "$lib/data/repoProvider";
import type { ListSplitsOptions } from "@logit/core/data/splitRepo";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";

export async function listSplits(options?: ListSplitsOptions): Promise<WorkoutSplit[]> {
  return getSplitRepo().getListSplits(options);
}
