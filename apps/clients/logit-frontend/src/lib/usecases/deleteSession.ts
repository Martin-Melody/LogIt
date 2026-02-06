
import { getWorkoutRepo } from "$lib/data/repoProvider";

export async function deleteSession(id: string): Promise<void> {
  await getWorkoutRepo().deleteSession(id);
}
