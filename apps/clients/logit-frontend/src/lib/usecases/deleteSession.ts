
import { getWorkoutRepo } from "$lib/data/repoProvider";
import { pushDeletedSession } from "$lib/sync/syncService";

export async function deleteSession(id: string): Promise<void> {
  await getWorkoutRepo().deleteSession(id);
  pushDeletedSession(id);
}
