// src/lib/data/repoProvider.ts
import { browser } from "$app/environment";
import type { WorkoutRepo } from "$lib/data/workoutRepo";
import type { SplitRepo } from "$lib/data/splitRepo";
import type { ExerciseRepo } from "$lib/data/exercise/exerciseRepo";
import type { ProgressionRepo } from "$lib/data/progressionRepo";
import type { AlgorithmRegistry } from "$lib/progression/algorithmRegistry";

import { isNativePlatform } from "$lib/platform/isNative";

import { initSqlite } from "$lib/data/db/sqlite";
import { createSqliteExerciseRepo } from "$lib/data/exercise/exerciseRepo.sqlite";

import { createLocalWorkoutRepo } from "$lib/data/workoutRepo.local";
import { createLocalSplitRepo } from "$lib/data/splitRepo.local";
import { createLocalExerciseRepo } from "$lib/data/exercise/localExerciseRepo";
import { createLocalProgressionRepo } from "$lib/data/progressionRepo.local";
import { createLocalAlgorithmRegistry } from "$lib/progression/localAlgorithmRegistry";
import { createSqliteWorkoutRepo } from "./workouts/workoutRepo.sqlite";
import { createSqliteSplitRepo } from "./splts/splitRepo.sqlite";

let didInit = false;

let workoutRepo: WorkoutRepo | null = null;
let exerciseRepo: ExerciseRepo | null = null;
let splitRepo: SplitRepo | null = null;
let progressionRepo: ProgressionRepo | null = null;
let algorithmRegistry: AlgorithmRegistry | null = null;

export async function initRepos(): Promise<void> {
  if (!browser) return;
  if (didInit) return;

  algorithmRegistry = createLocalAlgorithmRegistry();

  const native = isNativePlatform();

  if (native) {
    try {
      await initSqlite();
      workoutRepo = createSqliteWorkoutRepo();
      exerciseRepo = createSqliteExerciseRepo();
      splitRepo = createSqliteSplitRepo();
      progressionRepo = createLocalProgressionRepo();
      didInit = true;
      return;
    } catch (error) {
      console.warn(
        "[repoProvider] native SQLite init failed, falling back to local storage",
        error,
      );
    }
  }

  workoutRepo = createLocalWorkoutRepo();
  exerciseRepo = createLocalExerciseRepo();
  splitRepo = createLocalSplitRepo();
  progressionRepo = createLocalProgressionRepo();
  didInit = true;
}

export function getWorkoutRepo(): WorkoutRepo {
  if (!workoutRepo)
    throw new Error("WorkoutRepo not initialized. Call initRepos() first.");
  return workoutRepo;
}

export function getExerciseRepo(): ExerciseRepo {
  if (!exerciseRepo)
    throw new Error("ExerciseRepo not initialized. Call initRepos() first.");
  return exerciseRepo;
}

export function getSplitRepo(): SplitRepo {
  if (!splitRepo)
    throw new Error("SplitRepo not initialized. Call initRepos() first.");
  return splitRepo;
}

export function getProgressionRepo(): ProgressionRepo {
  if (!progressionRepo)
    throw new Error("ProgressionRepo not initialized. Call initRepos() first.");
  return progressionRepo;
}

export function getAlgorithmRegistry(): AlgorithmRegistry {
  if (!algorithmRegistry)
    throw new Error("AlgorithmRegistry not initialized. Call initRepos() first.");
  return algorithmRegistry;
}
