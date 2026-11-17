import type { ProgressionDeps } from "@logit/core/usecases/progression/deps";
import {
  getWorkoutRepo,
  getProgressionRepo,
  getExerciseRepo,
  getAlgorithmRegistry,
  getAnalyticsRegistry,
  getMobilityAlgorithmRegistry,
  getTrainingBlockTagRepo,
  getMuscleGroupInsightAlgorithmRegistry,
} from "$lib/data/repoProvider";
import { loadBodyweightLookup } from "$lib/features/bodyweight/bodyweight";
import { get } from "svelte/store";
import { activeGoals, goalsStore } from "$lib/features/goals/goalsStore";

/** The mobile app's repo/registry bundle for the @logit/core progression
 * usecases, which take their dependencies as an explicit parameter instead
 * of reaching for a singleton (so the same usecases can run against a
 * remote, cloud-backed repo bundle on the web app). */
export function getProgressionDeps(): ProgressionDeps {
  return {
    workoutRepo: getWorkoutRepo(),
    progressionRepo: getProgressionRepo(),
    exerciseRepo: getExerciseRepo(),
    algorithmRegistry: getAlgorithmRegistry(),
    analyticsRegistry: getAnalyticsRegistry(),
    mobilityAlgorithmRegistry: getMobilityAlgorithmRegistry(),
    trainingBlockTagRepo: getTrainingBlockTagRepo(),
    muscleGroupInsightAlgorithmRegistry: getMuscleGroupInsightAlgorithmRegistry(),
    loadBodyweight: loadBodyweightLookup,
    loadGoals: async () => activeGoals(get(goalsStore)),
  };
}
