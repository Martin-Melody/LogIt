import { browser } from "$app/environment";
import type { WorkoutRepo } from "$lib/data/workoutRepo";
import type { SplitRepo } from "$lib/data/splitRepo";

import { createLocalWorkoutRepo } from "$lib/data/workoutRepo.local";
import { createLocalSplitRepo } from "$lib/data/splitRepo.local";

import { isNativePlatform } from "$lib/platform/isNative";
import type { ExerciseRepo } from "./exercise/exerciseRepo";
import { createLocalExerciseRepo } from "./exercise/localExerciseRepo";

let didInit = false;

let workoutRepo: WorkoutRepo | null = null;
let exerciseRepo: ExerciseRepo | null = null;
let splitRepo: SplitRepo | null = null;

export async function initRepos(): Promise<void> {
  if (!browser) return;
  if (didInit) return;
  didInit = true;

  const isNative = isNativePlatform();

  void isNative;

  workoutRepo = createLocalWorkoutRepo();
  exerciseRepo = createLocalExerciseRepo();
  splitRepo = createLocalSplitRepo();
}

export function getWorkoutRepo(): WorkoutRepo {
  if (!workoutRepo) {
    throw new Error("WorkoutRepo not initialized. Call initRepos() first.");
  }
  return workoutRepo;
}

export function getExerciseRepo(): ExerciseRepo {
  if (!exerciseRepo) {
    throw new Error("ExerciseRepo not initialized. Call initRepos() first.");
  }
  return exerciseRepo;
}

export function getSplitRepo(): SplitRepo {
  if (!splitRepo) {
    throw new Error("SplitRepo not initialized. Call initRepos() first.");
  }
  return splitRepo;
}
