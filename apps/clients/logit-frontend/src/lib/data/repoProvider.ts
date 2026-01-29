import { browser } from "$app/environment";
import type { WorkoutRepo } from "$lib/data/workoutRepo";
import type { SplitRepo } from "$lib/data/splitRepo";

import { createLocalWorkoutRepo } from "$lib/data/workoutRepo.local";
import { createLocalSplitRepo } from "$lib/data/splitRepo.local";

import { isNativePlatform } from "$lib/platform/isNative";

let didInit = false;

let workoutRepo: WorkoutRepo | null = null;
let splitRepo: SplitRepo | null = null;

export async function initRepos(): Promise<void> {
  if (!browser) return;
  if (didInit) return;
  didInit = true;

  const isNative = isNativePlatform(); // or await if yours is async

  // MVP: localStorage everywhere
  // Later:
  // if (isNative) { workoutRepo = createSqliteWorkoutRepo(); splitRepo = createSqliteSplitRepo(); }
  // else { workoutRepo = createLocalWorkoutRepo(); splitRepo = createLocalSplitRepo(); }

  void isNative;

  workoutRepo = createLocalWorkoutRepo();
  splitRepo = createLocalSplitRepo();
}

export function getWorkoutRepo(): WorkoutRepo {
  if (!workoutRepo) {
    throw new Error("WorkoutRepo not initialized. Call initRepos() first.");
  }
  return workoutRepo;
}

export function getSplitRepo(): SplitRepo {
  if (!splitRepo) {
    throw new Error("SplitRepo not initialized. Call initRepos() first.");
  }
  return splitRepo;
}

