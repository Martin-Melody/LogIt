import { getSplitRepo } from "$lib/data/repoProvider";
import { addDay as addDayDomain } from "$lib/domain/WorkoutSplit";

export async function addDay(splitId: string, name?: string): Promise<void> {
  const repo = getSplitRepo();
  const split = await repo.getSplit(splitId);
  if (!split) throw new Error("Split not found");

  const next = addDayDomain(split, name);
  await repo.saveSplit(next);
}

