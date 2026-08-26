import { getSplitRepo } from "$lib/data/repoProvider";
import { archiveSplit as archiveSplitDomain } from "@logit/core/domain/WorkoutSplit";
"$lib/d"

export async function archiveSplit(id: string, archived = true): Promise<void> {
  const repo = getSplitRepo();
  const split = await repo.getSplit(id);
  if (!split) throw new Error("Split not found");

  const next = archiveSplitDomain(split, archived);
  await repo.saveSplit(next);
}

