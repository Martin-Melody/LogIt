// src/lib/data/repoProvider.ts
import { browser } from "$app/environment";
import type { WorkoutRepo } from "$lib/data/workoutRepo";
import type { SplitRepo } from "$lib/data/splitRepo";
import type { ExerciseRepo } from "$lib/data/exercise/exerciseRepo";

import { isNativePlatform } from "$lib/platform/isNative";

import { initSqlite } from "$lib/data/db/sqlite";
import { createSqliteExerciseRepo } from "$lib/data/exercise/exerciseRepo.sqlite";

import { createLocalWorkoutRepo } from "$lib/data/workoutRepo.local";
import { createLocalSplitRepo } from "$lib/data/splitRepo.local";
import { createLocalExerciseRepo } from "$lib/data/exercise/localExerciseRepo";
import { createSqliteWorkoutRepo } from "./workouts/workoutRepo.sqlite";
import { createSqliteSplitRepo } from "./splts/splitRepo.sqlite";

let didInit = false;

let workoutRepo: WorkoutRepo | null = null;
let exerciseRepo: ExerciseRepo | null = null;
let splitRepo: SplitRepo | null = null;

export async function initRepos(): Promise<void> {
  if (!browser) return;
  if (didInit) return;
  didInit = true;

  const native = isNativePlatform();

  if (native) {
    await initSqlite();
    workoutRepo = createSqliteWorkoutRepo();
    exerciseRepo = createSqliteExerciseRepo();
    splitRepo = createSqliteSplitRepo();
    return;
  }

  workoutRepo = createLocalWorkoutRepo();
  exerciseRepo = createLocalExerciseRepo();
  splitRepo = createLocalSplitRepo();
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
