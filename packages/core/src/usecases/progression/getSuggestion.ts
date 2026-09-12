import type { ProgressionOutput, PrecedingExercise } from "../../domain/progression";
import { exerciseKey, resolveExerciseIncrement, resolveExerciseMachine } from "../../domain/progression";
import { snapToMachine } from "../../domain/machine";
import { getExercises } from "../../domain/workout";
import type { WorkoutSession } from "../../domain/workout";
import { nowMs } from "../../domain/time";
import type { PlannedTargets } from "../../domain/WorkoutSplit";
import { getExerciseHistory } from "./getExerciseHistory";
import type { ProgressionDeps } from "./deps";

// How many of *this exercise's own* most recent sessions the algorithm sees —
// not a global cap across every exercise (that was the bug: fetching "the last
// 20 sessions total, then filtering" silently starved anyone who trains several
// different exercises regularly, diluting a single exercise's own history below
// what calibration/trial thresholds need long before 20 of ITS sessions existed).
const HISTORY_WINDOW = 20;

export async function getSuggestion(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "algorithmRegistry" | "exerciseRepo">,
  plannedTargets?: PlannedTargets,
  currentSession?: WorkoutSession,
  liveInput?: { rpe?: number; readiness?: number },
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

  // Same fetch/match logic getExerciseHistory already uses (uncapped, oldest
  // first) — reused rather than re-implemented, then capped to this exercise's
  // own most recent HISTORY_WINDOW and reversed to the newest-first order this
  // usecase has always returned.
  const { history: fullHistory, exerciseData } = await getExerciseHistory(exercise, { workoutRepo, exerciseRepo });
  const history = fullHistory.slice(-HISTORY_WINDOW).reverse();

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

  // Bespoke to the rep-range-experimentation feature (§10) — a warm-start value for
  // a *new* trial, informed by what's already worked for other exercises sharing
  // this one's primary muscle. Only linear-progression's state shape is understood
  // here; this whole computation is a known v1 compromise, tracked to generalize
  // once the feature proves out beyond one built-in algorithm.
  let suggestedTrialRepRange: [number, number] | undefined;
  let allStates: Awaited<ReturnType<typeof progressionRepo.listExerciseStates>> | undefined;
  if (config.algorithmId === "linear-progression" && exerciseWithMuscles.primaryMuscles.length > 0) {
    allStates = await progressionRepo.listExerciseStates();
    for (const other of allStates) {
      if (other.key === key || other.algorithmId !== "linear-progression") continue;
      const otherState = other.state as {
        repRangeTrial?: { trialRepRange: [number, number]; result?: { switched?: boolean } };
      } | null;
      const trial = otherState?.repRangeTrial;
      if (!trial?.result?.switched) continue;
      const otherExercise = other.exerciseId
        ? await exerciseRepo.getById(other.exerciseId)
        : await exerciseRepo.getByName(other.exerciseName);
      const sharesMuscle = otherExercise?.primaryMuscles?.some((m) =>
        exerciseWithMuscles.primaryMuscles.includes(m),
      );
      if (sharesMuscle) {
        suggestedTrialRepRange = trial.trialRepRange;
        break;
      }
    }
  }

  let output = await algorithm.suggest({
    exercise: exerciseWithMuscles,
    history,
    state,
    userPreferences,
    plannedTargets,
    incrementOverride,
    sessionContext,
    suggestedTrialRepRange,
    liveInput,
  });

  // An algorithm decides *whether* to ask for help generating signal; whether the
  // user has already seen and dismissed that specific ask is a generic concern the
  // algorithm shouldn't need to implement itself — so it's filtered here, once, for
  // every algorithm (built-in or plugin).
  if (output.nudge && saved?.dismissedNudges?.includes(output.nudge.id)) {
    output = { ...output, nudge: undefined };
  }

  // A nudge marked `exclusive` (e.g. "start a new experiment") only makes sense if
  // no OTHER exercise already has one running — checked generically here via
  // `activeExperiment`, without needing to know what kind of experiment it is.
  if (output.nudge?.exclusive) {
    allStates ??= await progressionRepo.listExerciseStates();
    const anotherActive = allStates.some((s) => s.key !== key && s.activeExperiment);
    if (anotherActive) output = { ...output, nudge: undefined };
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

  // dismissedNudges is app-managed, not something suggest() computes — must be
  // carried forward explicitly, or a completed session would silently wipe it
  // (saveExerciseState replaces the whole row, not a per-field merge).
  const existing = await progressionRepo.getExerciseState(key);

  // activeExperiment is a generic mirror of "does this algorithm's own opaque
  // state have an experiment running", re-derived on every save rather than
  // trusted from before — bespoke to linear-progression's repRangeTrial shape for
  // now (§10), same known v1 compromise as the warm-start lookup above.
  let activeExperiment: { id: string; startedAtMs: number } | undefined;
  if (config.algorithmId === "linear-progression") {
    const trial = (output.nextState as { repRangeTrial?: { status: string; startedAtMs: number } } | null)
      ?.repRangeTrial;
    if (trial?.status === "active") {
      activeExperiment = { id: "rep-range-trial", startedAtMs: trial.startedAtMs };
    }
  }

  await progressionRepo.saveExerciseState({
    key,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    algorithmId: config.algorithmId,
    state: output.nextState,
    updatedAtMs: nowMs(),
    dismissedNudges: existing?.dismissedNudges,
    activeExperiment,
  });
}
