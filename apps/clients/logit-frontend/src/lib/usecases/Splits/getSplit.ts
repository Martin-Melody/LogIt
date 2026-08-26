import { getSplitRepo } from "$lib/data/repoProvider";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";

export async function getSplit(id: string): Promise<WorkoutSplit | null> {
  return getSplitRepo().getSplit(id);
}
