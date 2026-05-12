import { getWorkoutRepo, getProgressionRepo, getAlgorithmRegistry, getExerciseRepo } from "$lib/data/repoProvider";
import type { ProgressionOutput, ExerciseHistoryEntry, PrecedingExercise } from "$lib/domain/progression";
import { exerciseKey } from "$lib/domain/progression";
import { getExercises } from "$lib/domain/workout";
import type { WorkoutSession } from "$lib/domain/workout";
import { nowMs } from "$lib/domain/time";
import type { PlannedTargets } from "$lib/domain/WorkoutSplit";

const HISTORY_WINDOW = 20;

export async function getSuggestion(
  exercise: { id?: string; name: string },
  plannedTargets?: PlannedTargets,
  currentSession?: WorkoutSession,
): Promise<ProgressionOutput | null> {
  const progressionRepo = getProgressionRepo();
  const workoutRepo = getWorkoutRepo();
  const exerciseRepo = getExerciseRepo();
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

  // Build session context from exercises that appear before this one in the current session
  const exerciseData = exercise.id
    ? await exerciseRepo.getById(exercise.id)
    : await exerciseRepo.getByName(exercise.name);

  const exerciseWithMuscles = {
    ...exercise,
    primaryMuscles: exerciseData?.primaryMuscles ?? [],
    secondaryMuscles: exerciseData?.secondaryMuscles ?? [],
  };

  let sessionContext: { precedingExercises: PrecedingExercise[] } | undefined;

  if (currentSession) {
    const allBlocks = getExercises(currentSession).sort((a, b) => a.orderIndex - b.orderIndex);
    const targetIndex = allBlocks.findIndex((e) =>
      exercise.id ? e.exerciseId === exercise.id : e.exerciseName.toLowerCase() === exercise.name.toLowerCase(),
    );

    if (targetIndex > 0) {
      const precedingEntries = allBlocks.slice(0, targetIndex);
      const precedingExercises: PrecedingExercise[] = await Promise.all(
        precedingEntries.map(async (entry) => {
          const data = entry.exerciseId
            ? await exerciseRepo.getById(entry.exerciseId)
            : await exerciseRepo.getByName(entry.exerciseName);

          const completedSets = entry.sets.filter(
            (s) => s.completed && (s.setType === "normal" || !s.setType),
          ).length;

          return {
            name: entry.exerciseName,
            id: entry.exerciseId,
            primaryMuscles: data?.primaryMuscles ?? [],
            secondaryMuscles: data?.secondaryMuscles ?? [],
            completedSets,
          } satisfies PrecedingExercise;
        }),
      );

      sessionContext = { precedingExercises };
    }
  }

  return algorithm.suggest({
    exercise: exerciseWithMuscles,
    history,
    state,
    plannedTargets,
    sessionContext,
  });
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
