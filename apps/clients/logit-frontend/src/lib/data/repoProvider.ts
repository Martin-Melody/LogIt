import { browser } from "$app/environment";
import type { WorkoutRepo } from "@logit/core/data/workoutRepo";
import type { SplitRepo } from "@logit/core/data/splitRepo";
import type { AssignedProgramRepo } from "@logit/core/data/coachProgramRepo";
import type { ExerciseRepo } from "@logit/core/data/exercise/exerciseRepo";
import type { ProgressionRepo } from "@logit/core/data/progressionRepo";
import type { AlgorithmRegistry } from "@logit/core/progression/algorithmRegistry";
import type { AnalyticsRegistry } from "@logit/core/domain/analytics";
import type { NutritionAlgorithmRegistry } from "@logit/core/domain/nutritionAlgorithm";
import type { NutritionAnalyticsRegistry } from "@logit/core/domain/nutritionAnalytics";

import { isNativePlatform } from "$lib/platform/isNative";

import { initSqlite, initFoodDb, getFoodDb } from "$lib/data/db/sqlite";
import { createSqliteExerciseRepo } from "$lib/data/exercise/exerciseRepo.sqlite";
import { createSqliteNutritionRepo } from "$lib/data/nutrition/nutritionRepo.sqlite";
import { createLocalNutritionRepo } from "$lib/data/nutrition/nutritionRepo.local";
import { createSqliteFoodDbRepo } from "$lib/data/nutrition/foodDbRepo.sqlite";
import { createSqliteFoodCacheStore } from "$lib/data/nutrition/foodCacheStore.sqlite";
import { createLocalFoodCacheStore } from "$lib/data/nutrition/foodCacheStore.local";
import { createCachingFoodDbRepo } from "@logit/core/data/cachingFoodDbRepo";
import { createOpenFoodFactsRepo } from "@logit/core/data/remote/openFoodFactsRepo";
import { createSqliteCoachNutritionPlanRepo } from "$lib/data/nutrition/coachNutritionPlanRepo.sqlite";
import { createLocalCoachNutritionPlanRepo } from "$lib/data/nutrition/coachNutritionPlanRepo.local";
import type { NutritionRepo } from "@logit/core/data/nutritionRepo";
import type { FoodDbRepo } from "@logit/core/data/foodDbRepo";
import type { AssignedNutritionPlanRepo } from "@logit/core/data/coachNutritionPlanRepo";

import { createLocalWorkoutRepo } from "$lib/data/workoutRepo.local";
import { createLocalSplitRepo } from "$lib/data/splitRepo.local";
import { createLocalCoachProgramRepo } from "$lib/data/coachProgram/coachProgramRepo.local";
import { createSqliteCoachProgramRepo } from "$lib/data/coachProgram/coachProgramRepo.sqlite";
import { createLocalAuthoredProgramRepo } from "$lib/data/coachProgram/authoredProgramRepo.local";
import { createSqliteAuthoredProgramRepo } from "$lib/data/coachProgram/authoredProgramRepo.sqlite";
import type { AuthoredProgramRepo } from "$lib/data/coachProgram/authoredProgramRepo.sqlite";
import { createLocalCheckinRepo } from "$lib/data/checkin/checkinRepo.local";
import { createSqliteCheckinRepo } from "$lib/data/checkin/checkinRepo.sqlite";
import { createLocalAuthoredCheckinRepo } from "$lib/data/checkin/authoredCheckinRepo.local";
import { createSqliteAuthoredCheckinRepo } from "$lib/data/checkin/authoredCheckinRepo.sqlite";
import type { AuthoredCheckinRepo } from "$lib/data/checkin/authoredCheckinRepo.sqlite";
import type { AssignedCheckinRepo } from "@logit/core/data/checkinRepo";
import { createLocalMessagesRepo } from "$lib/data/messages/messagesRepo.local";
import { createSqliteMessagesRepo } from "$lib/data/messages/messagesRepo.sqlite";
import type { MessagesRepo } from "$lib/data/messages/messagesRepo";
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
let coachProgramRepo: AssignedProgramRepo | null = null;
let authoredProgramRepo: AuthoredProgramRepo | null = null;
let checkinRepo: AssignedCheckinRepo | null = null;
let authoredCheckinRepo: AuthoredCheckinRepo | null = null;
let messagesRepo: MessagesRepo | null = null;
let nutritionRepo: NutritionRepo | null = null;
let foodDbRepo: FoodDbRepo | null = null;
let coachNutritionPlanRepo: AssignedNutritionPlanRepo | null = null;
let progressionRepo: ProgressionRepo | null = null;
let algorithmRegistry: AlgorithmRegistry | null = null;
let analyticsRegistry: AnalyticsRegistry | null = null;
let nutritionAlgorithmRegistry: NutritionAlgorithmRegistry | null = null;
let nutritionAnalyticsRegistry: NutritionAnalyticsRegistry | null = null;

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
  nutritionAlgorithmRegistry = pluginRuntime.nutritionAlgorithms;
  nutritionAnalyticsRegistry = pluginRuntime.nutritionAnalytics;

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
    coachProgramRepo = createSqliteCoachProgramRepo();
    authoredProgramRepo = createSqliteAuthoredProgramRepo();
    checkinRepo = createSqliteCheckinRepo();
    authoredCheckinRepo = createSqliteAuthoredCheckinRepo();
    messagesRepo = createSqliteMessagesRepo();
    nutritionRepo = createSqliteNutritionRepo();
    coachNutritionPlanRepo = createSqliteCoachNutritionPlanRepo();
    progressionRepo = createSqliteProgressionRepo();

    // Bundled food DB is optional. Whether or not this build shipped one, layer the online
    // Open Food Facts lookup on top and cache its hits locally for offline reuse.
    await initFoodDb().catch(() => {});
    foodDbRepo = createCachingFoodDbRepo({
      bundled: getFoodDb() ? createSqliteFoodDbRepo() : null,
      cache: createSqliteFoodCacheStore(),
      online: createOpenFoodFactsRepo(),
    });

    didInit = true;
    return;
  }

  // Web: load active owner from localStorage for consistency (data isolation via owner_id not enforced on web localStorage repos)
  loadActiveOwnerId();

  workoutRepo = createLocalWorkoutRepo();
  exerciseRepo = createLocalExerciseRepo();
  splitRepo = createLocalSplitRepo();
  coachProgramRepo = createLocalCoachProgramRepo();
  authoredProgramRepo = createLocalAuthoredProgramRepo();
  checkinRepo = createLocalCheckinRepo();
  authoredCheckinRepo = createLocalAuthoredCheckinRepo();
  messagesRepo = createLocalMessagesRepo();
  nutritionRepo = createLocalNutritionRepo();
  coachNutritionPlanRepo = createLocalCoachNutritionPlanRepo();
  foodDbRepo = createCachingFoodDbRepo({
    bundled: null,
    cache: createLocalFoodCacheStore(),
    online: createOpenFoodFactsRepo(),
  });
  progressionRepo = createLocalProgressionRepo();
  didInit = true;
}

/** Call after logout/login to re-initialize repos with the new active owner. */
export function resetRepos(): void {
  didInit = false;
  workoutRepo = null;
  exerciseRepo = null;
  splitRepo = null;
  coachProgramRepo = null;
  authoredProgramRepo = null;
  checkinRepo = null;
  authoredCheckinRepo = null;
  messagesRepo = null;
  nutritionRepo = null;
  coachNutritionPlanRepo = null;
  foodDbRepo = null;
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

export function getCoachProgramRepo(): AssignedProgramRepo {
  if (!coachProgramRepo)
    throw new Error("CoachProgramRepo not initialized. Call initRepos() first.");
  return coachProgramRepo;
}

export function getAuthoredProgramRepo(): AuthoredProgramRepo {
  if (!authoredProgramRepo)
    throw new Error("AuthoredProgramRepo not initialized. Call initRepos() first.");
  return authoredProgramRepo;
}

export function getCheckinRepo(): AssignedCheckinRepo {
  if (!checkinRepo)
    throw new Error("CheckinRepo not initialized. Call initRepos() first.");
  return checkinRepo;
}

export function getAuthoredCheckinRepo(): AuthoredCheckinRepo {
  if (!authoredCheckinRepo)
    throw new Error("AuthoredCheckinRepo not initialized. Call initRepos() first.");
  return authoredCheckinRepo;
}

export function getMessagesRepo(): MessagesRepo {
  if (!messagesRepo)
    throw new Error("MessagesRepo not initialized. Call initRepos() first.");
  return messagesRepo;
}

export function getNutritionRepo(): NutritionRepo {
  if (!nutritionRepo)
    throw new Error("NutritionRepo not initialized. Call initRepos() first.");
  return nutritionRepo;
}

export function getCoachNutritionPlanRepo(): AssignedNutritionPlanRepo {
  if (!coachNutritionPlanRepo)
    throw new Error("CoachNutritionPlanRepo not initialized. Call initRepos() first.");
  return coachNutritionPlanRepo;
}

export function getFoodDbRepo(): FoodDbRepo {
  if (!foodDbRepo)
    throw new Error("FoodDbRepo not initialized. Call initRepos() first.");
  return foodDbRepo;
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

export function getNutritionAlgorithmRegistry(): NutritionAlgorithmRegistry {
  if (!nutritionAlgorithmRegistry)
    throw new Error("NutritionAlgorithmRegistry not initialized. Call initRepos() first.");
  return nutritionAlgorithmRegistry;
}

export function getNutritionAnalyticsRegistry(): NutritionAnalyticsRegistry {
  if (!nutritionAnalyticsRegistry)
    throw new Error("NutritionAnalyticsRegistry not initialized. Call initRepos() first.");
  return nutritionAnalyticsRegistry;
}
