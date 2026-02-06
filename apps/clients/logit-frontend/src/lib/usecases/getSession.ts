import type { WorkoutSession } from "$lib/domain/workout";
import { getWorkoutRepo } from "$lib/data/repoProvider";

export async function getSession(id: string): Promise<WorkoutSession | null> {
  return getWorkoutRepo().getSession(id);
}

