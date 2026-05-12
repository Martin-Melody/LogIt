import { getWorkoutRepo } from "$lib/data/repoProvider";
import { getExercises } from "$lib/domain/workout";
import type { WorkoutSession } from "$lib/domain/workout";
import { refreshProgressionState } from "$lib/usecases/progression/getSuggestion";

export async function editSession(session: WorkoutSession): Promise<void> {
  await getWorkoutRepo().saveSession(session);
  for (const ex of getExercises(session)) {
    await refreshProgressionState({ id: ex.exerciseId, name: ex.exerciseName });
  }
}
