import { browser } from "$app/environment";
import type { WorkoutRepo } from "@logit/core/data/workoutRepo";
import type { SplitRepo } from "@logit/core/data/splitRepo";
import type { ExerciseRepo } from "@logit/core/data/exercise/exerciseRepo";
import type { ProgressionRepo } from "@logit/core/data/progressionRepo";
import type { AlgorithmRegistry } from "@logit/core/progression/algorithmRegistry";
import type { AnalyticsRegistry } from "@logit/core/domain/analytics";

import { isNativePlatform } from "$lib/platform/isNative";

import { initSqlite } from "$lib/data/db/sqlite";
import { createSqliteExerciseRepo } from "$lib/data/exercise/exerciseRepo.sqlite";

import { createLocalWorkoutRepo } from "$lib/data/workoutRepo.local";
import { createLocalSplitRepo } from "$lib/data/splitRepo.local";
import { createLocalExerciseRepo } from "$lib/data/exercise/localExerciseRepo";
import { createLocalProgressionRepo } from "$lib/data/progressionRepo.local";
import { createSqliteProgressionRepo } from "$lib/data/progressionRepo.sqlite";
import { createSqliteWorkoutRepo } from "./workouts/workoutRepo.sqlite";
import { createSqliteSplitRepo } from "./splts/splitRepo.sqlite";
import { pluginRuntime } from "$lib/plugins";
import { loadActiveOwnerId, getActiveOwnerId, setActiveOwnerId } from "$lib/data/activeOwner";
import {
  createLocalAccount,
  listLocalAccounts,
  claimOrphanedData,
  type LocalAccount,
} from "$lib/data/localAccountRepo";
import { needsAccountAuth } from "$lib/stores/appReady.store";
import { profile } from "$lib/stores/profile.store";
import { onboarding } from "$lib/stores/onboarding.store";
import * as localAccountRepo from "$lib/data/localAccountRepo";

let didInit = false;

let workoutRepo: WorkoutRepo | null = null;
let exerciseRepo: ExerciseRepo | null = null;
let splitRepo: SplitRepo | null = null;
let progressionRepo: ProgressionRepo | null = null;
let algorithmRegistry: AlgorithmRegistry | null = null;
let analyticsRegistry: AnalyticsRegistry | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function ensureLocalAccount(): Promise<LocalAccount | null> {
  loadActiveOwnerId();
  const currentId = getActiveOwnerId();

  if (currentId) {
    const existing = await localAccountRepo.getLocalAccount(currentId);
    if (existing) return existing;
    // Stored owner ID points to a deleted account — clear it
    setActiveOwnerId(null);
  }

  const all = await listLocalAccounts();
  if (all.length === 0) {
    if (localStorage.getItem("logit:had_account")) {
      // Device has had accounts before but user deleted them all — let them create a new one
      needsAccountAuth.set(true);
      return null;
    }
    // True first launch: create a default local account and claim any orphaned data
    const account = await createLocalAccount({ username: "local", displayName: "" });
    setActiveOwnerId(account.id);
    await claimOrphanedData(account.id);
    return account;
  }

  // Accounts exist but no active owner — user needs to authenticate
  return null;
}

export async function initRepos(): Promise<void> {
  if (!browser) return;
  if (didInit) return;

  algorithmRegistry = pluginRuntime.algorithms;
  analyticsRegistry = pluginRuntime.analytics;

  if (isNativePlatform()) {
    await withTimeout(initSqlite(), 10_000, "initSqlite");

    const account = await ensureLocalAccount();

    if (account) {
      profile.initFromLocalAccount(account, localAccountRepo, getActiveOwnerId);
      onboarding.init(account, localAccountRepo, getActiveOwnerId);
    } else {
      needsAccountAuth.set(true);
    }

    workoutRepo = createSqliteWorkoutRepo();
    exerciseRepo = createSqliteExerciseRepo();
    splitRepo = createSqliteSplitRepo();
    progressionRepo = createSqliteProgressionRepo();
    didInit = true;
    return;
  }

  // Web: load active owner from localStorage for consistency (data isolation via owner_id not enforced on web localStorage repos)
  loadActiveOwnerId();

  workoutRepo = createLocalWorkoutRepo();
  exerciseRepo = createLocalExerciseRepo();
  splitRepo = createLocalSplitRepo();
  progressionRepo = createLocalProgressionRepo();
  didInit = true;
}

/** Call after logout/login to re-initialize repos with the new active owner. */
export function resetRepos(): void {
  didInit = false;
  workoutRepo = null;
  exerciseRepo = null;
  splitRepo = null;
  progressionRepo = null;
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

export function getAnalyticsRegistry(): AnalyticsRegistry {
  if (!analyticsRegistry)
    throw new Error("AnalyticsRegistry not initialized. Call initRepos() first.");
  return analyticsRegistry;
}
