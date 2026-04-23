import { getSplitRepo } from "$lib/data/repoProvider";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { getSplit } from "./getSplit";

export async function setActiveSplit(id: string | null): Promise<void> {
  await getSplitRepo().setActiveSplitId(id);

  if (!id) {
    activeSplit.clear();
    return;
  }

  const split = await getSplit(id);
  activeSplit.set(split);
}
