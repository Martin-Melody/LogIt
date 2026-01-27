import type { WorkoutSession } from "$lib/domain/workout";
import { getRepo } from "$lib/data/repoProvider";

export async function getSession(id: string): Promise<WorkoutSession | null> {
  return getRepo().getSession(id);
}

