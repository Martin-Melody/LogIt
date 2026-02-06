import { getSplitRepo } from "$lib/data/repoProvider";

export async function setActiveSplit(id: string | null): Promise<void> {
  await getSplitRepo().setActiveSplitId(id);
}
