import { getProgressionRepo } from "$lib/data/repoProvider";

export async function resetExerciseProgression(exercise: { id?: string; name: string }): Promise<void> {
  const repo = getProgressionRepo();
  const keys = new Set<string>();
  if (exercise.id) keys.add(exercise.id);
  // Legacy fallback: state may have been saved under the name key before the exercise had an id.
  keys.add(exercise.name.toLowerCase().trim());
  await Promise.all([...keys].map((key) => repo.resetExerciseState(key)));
}
