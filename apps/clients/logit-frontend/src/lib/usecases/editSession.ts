import { getWorkoutRepo } from "$lib/data/repoProvider";
import { getExercises } from "@logit/core/domain/workout";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { refreshProgressionState } from "@logit/core/usecases/progression/getSuggestion";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";

export async function editSession(session: WorkoutSession): Promise<void> {
  await getWorkoutRepo().saveSession(session);
  for (const ex of getExercises(session)) {
    await refreshProgressionState({ id: ex.exerciseId, name: ex.exerciseName }, getProgressionDeps());
  }
}
