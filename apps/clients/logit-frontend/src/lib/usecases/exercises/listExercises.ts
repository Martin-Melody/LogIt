import type { Exercise } from "$lib/domain/exercise";
import { getExerciseRepo } from "$lib/data/repoProvider";

export type ListExercisesInput = {
  query?: string;
  limit?: number;
  offset?: number;
};

export async function listExercises(
  input?: ListExercisesInput,
): Promise<Exercise[]> {
  return getExerciseRepo().list(input);
}
