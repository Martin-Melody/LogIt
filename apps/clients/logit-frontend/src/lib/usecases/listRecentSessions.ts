import { getRepo } from "$lib/data/repoProvider";
import type { WorkoutSession } from "$lib/domain/workout";

export async function listRecentSessions(
  limit: number,
): Promise<WorkoutSession[]> {
  const repo = getRepo();
  return repo.listRecentSessions({ limit });
}
