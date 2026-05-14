import { getSplitRepo } from "$lib/data/repoProvider";
import { pushDeletedSplit } from "$lib/sync/syncService";

export async function deleteSplit(id: string): Promise<void> {
  await getSplitRepo().deleteSplit(id);
  pushDeletedSplit(id);
}
