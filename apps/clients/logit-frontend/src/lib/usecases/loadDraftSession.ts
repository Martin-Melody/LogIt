import { getRepo } from "$lib/data/repoProvider";
import type { WorkoutSession } from "$lib/domain/workout";

export async function loadDraftSession(): Promise<WorkoutSession | null> {
  const repo = getRepo();
  return repo.loadDraftSession();
}
