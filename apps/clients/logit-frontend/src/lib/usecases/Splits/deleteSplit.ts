import { getSplitRepo } from "$lib/data/repoProvider";

export async function deleteSplit(id: string): Promise<void> {
  await getSplitRepo().deleteSplit(id);
}
