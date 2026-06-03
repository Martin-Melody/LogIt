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
  let saved = await progressionRepo.getExerciseState(key);
  // Fall back to name-based key for state saved before the exercise had an ID
  // (e.g. from split blocks that stored no exerciseId, or older sessions).
  if (!saved && exercise.id) {
    const nameKey = exercise.name.toLowerCase().trim();
    if (nameKey !== key) saved = await progressionRepo.getExerciseState(nameKey);
  }

  const state =
    saved?.algorithmId === config.algorithmId
      ? saved.state
      : algorithm.defaultState;

  const recentSessions = await workoutRepo.listRecentSessions({ limit: HISTORY_WINDOW });

  const lowerName = exercise.name.toLowerCase();
  const history: ExerciseHistoryEntry[] = recentSessions
    .filter((session) => !session.excludeFromProgression)
    .flatMap((session) => {
      const allExercises = getExercises(session);
      const matchIndex = allExercises.findIndex((e) =>
        (exercise.id && e.exerciseId && e.exerciseId === exercise.id) ||
        e.exerciseName.toLowerCase() === lowerName,
      );
      if (matchIndex === -1) return [];
      const match = allExercises[matchIndex]!;
      return [
        {
          sessionId: session.id,
          performedAtMs: session.endedAtMs ?? session.startedAtMs,
          sets: match.sets,
          sessionPosition: matchIndex,
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
    exerciseType: exerciseData?.exerciseType,
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

          const normalSets = entry.sets.filter((s) => s.completed && (s.setType === "normal" || !s.setType)).length;
          const highEffortSets = entry.sets.filter((s) => s.completed && (s.setType === "failure" || s.setType === "amrap")).length;
          const warmupSets = entry.sets.filter((s) => s.completed && s.setType === "warmup").length;
          const effortFactor = Math.min(1, (normalSets + highEffortSets * 1.5 + warmupSets * 0.25) / 3);

          return {
            name: entry.exerciseName,
            id: entry.exerciseId,
            primaryMuscles: data?.primaryMuscles ?? [],
            secondaryMuscles: data?.secondaryMuscles ?? [],
            completedSets,
            effortFactor,
          } satisfies PrecedingExercise;
        }),
      );

      sessionContext = { precedingExercises };
    }
  }

  const storedPrefs = await progressionRepo.getAlgorithmPreferences(config.algorithmId);
  const userPreferences = storedPrefs ?? algorithm.defaultPreferences ?? {};

  return algorithm.suggest({
    exercise: exerciseWithMuscles,
    history,
    state,
    userPreferences,
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
