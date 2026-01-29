import { getSplitRepo } from "$lib/data/repoProvider";
import { renameSplit as renameSplitDomain } from "$lib/domain/WorkoutSplit";

export async function renameSplit(splitId: string, name: string): Promise<void> {
  const repo = getSplitRepo();
  const split = await repo.getSplit(splitId);
  if (!split) throw new Error("Split not found");

  const next = renameSplitDomain(split, name);
  await repo.saveSplit(next);
}

