import type { ProgressionOutput, ExerciseHistoryEntry, PrecedingExercise } from "../../domain/progression";
import { exerciseKey, resolveExerciseIncrement, resolveExerciseMachine } from "../../domain/progression";
import { snapToMachine } from "../../domain/machine";
import { getExercises, findExerciseIndexInSession } from "../../domain/workout";
import type { WorkoutSession } from "../../domain/workout";
import { nowMs } from "../../domain/time";
import type { PlannedTargets } from "../../domain/WorkoutSplit";
import type { ProgressionDeps } from "./deps";

const HISTORY_WINDOW = 20;

export async function getSuggestion(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "algorithmRegistry" | "exerciseRepo">,
  plannedTargets?: PlannedTargets,
  currentSession?: WorkoutSession,
): Promise<ProgressionOutput | null> {
  const { progressionRepo, workoutRepo, exerciseRepo, algorithmRegistry: registry } = deps;

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

  const history: ExerciseHistoryEntry[] = recentSessions
    .filter((session) => !session.excludeFromProgression)
    .flatMap((session) => {
      const matchIndex = findExerciseIndexInSession(session, exercise);
      if (matchIndex === -1) return [];
      const match = getExercises(session)[matchIndex]!;
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

  const incrementOverride = resolveExerciseIncrement(exerciseData ?? {}, history);

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

  let output = await algorithm.suggest({
    exercise: exerciseWithMuscles,
    history,
    state,
    userPreferences,
    plannedTargets,
    incrementOverride,
    sessionContext,
  });

  // An algorithm decides *whether* to ask for help generating signal; whether the
  // user has already seen and dismissed that specific ask is a generic concern the
  // algorithm shouldn't need to implement itself — so it's filtered here, once, for
  // every algorithm (built-in or plugin).
  if (output.nudge && saved?.dismissedNudges?.includes(output.nudge.id)) {
    output = { ...output, nudge: undefined };
  }

  // If the exercise is done on a machine with a known set of achievable weights,
  // round the suggested weights to what the machine can actually be set to.
  const machine = resolveExerciseMachine(exerciseData ?? {}, history);
  if (machine?.weights && output.sets.length > 0) {
    return {
      ...output,
      sets: output.sets.map((s) => ({ ...s, weight: snapToMachine(machine, s.weight).kg })),
    };
  }

  return output;
}

export async function refreshProgressionState(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "algorithmRegistry" | "exerciseRepo">,
): Promise<void> {
  const output = await getSuggestion(exercise, deps);
  if (!output) return;
  await applySessionProgression(exercise, output, deps);
}

export async function applySessionProgression(
  exercise: { id?: string; name: string },
  output: ProgressionOutput,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  const progressionRepo = deps.progressionRepo;
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
