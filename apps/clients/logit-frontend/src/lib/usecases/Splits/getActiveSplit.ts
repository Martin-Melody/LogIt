import { getSplitRepo } from "$lib/data/repoProvider";

export async function getActiveSplit(): Promise<string | null> {
  return await getSplitRepo().getActiveSplitId();
}

