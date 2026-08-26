import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { WorkoutSession } from "@logit/core/domain/workout";

export async function loadDraftSession(): Promise<WorkoutSession | null> {
  const repo = getWorkoutRepo();
  return repo.loadDraftSession();
}
