import { getWorkoutRepo, getProgressionRepo, getAlgorithmRegistry } from "$lib/data/repoProvider";
import type { ProgressionOutput, ExerciseHistoryEntry } from "$lib/domain/progression";
import { exerciseKey } from "$lib/domain/progression";
import { getExercises } from "$lib/domain/workout";
import { nowMs } from "$lib/domain/time";

const HISTORY_WINDOW = 20;

export async function getSuggestion(
  exercise: { id?: string; name: string },
): Promise<ProgressionOutput | null> {
  const progressionRepo = getProgressionRepo();
  const workoutRepo = getWorkoutRepo();
  const registry = getAlgorithmRegistry();

  const config = await progressionRepo.getConfig();
  if (!config) return null;

  const algorithm = await registry.get(config.algorithmId);
  if (!algorithm) return null;

  const key = exerciseKey(exercise);
  const saved = await progressionRepo.getExerciseState(key);

  const state =
    saved?.algorithmId === config.algorithmId
      ? saved.state
      : algorithm.defaultState;

  const recentSessions = await workoutRepo.listRecentSessions({ limit: HISTORY_WINDOW });

  const history: ExerciseHistoryEntry[] = recentSessions
    .flatMap((session) => {
      const match = getExercises(session).find((e) =>
        exercise.id ? e.exerciseId === exercise.id : e.exerciseName.toLowerCase() === exercise.name.toLowerCase(),
      );
      if (!match) return [];
      return [
        {
          sessionId: session.id,
          performedAtMs: session.endedAtMs ?? session.startedAtMs,
          sets: match.sets,
        } satisfies ExerciseHistoryEntry,
      ];
    })
    .sort((a, b) => b.performedAtMs - a.performedAtMs);

  return algorithm.suggest({ exercise, history, state });
}

export async function refreshProgressionState(
  exercise: { id?: string; name: string },
): Promise<void> {
  const output = await getSuggestion(exercise);
  if (!output) return;
  await applySessionProgression(exercise, output);
}

export async function applySessionProgression(
  exercise: { id?: string; name: string },
  output: ProgressionOutput,
): Promise<void> {
  const progressionRepo = getProgressionRepo();
  const config = await progressionRepo.getConfig();
  if (!config) return;

  const key = exerciseKey(exercise);

  await progressionRepo.saveExerciseState({
    key,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    algorithmId: config.algorithmId,
    state: output.nextState,
    updatedAtMs: nowMs(),
  });
}
