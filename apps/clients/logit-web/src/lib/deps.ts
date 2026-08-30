import { createRemoteWorkoutRepo } from "@logit/core/data/remote/remoteWorkoutRepo";
import { createRemoteSplitRepo } from "@logit/core/data/remote/remoteSplitRepo";
import { createRemoteCoachProgramRepo } from "@logit/core/data/remote/remoteCoachProgramRepo";
import { createRemoteCheckinRepo, fetchClientCheckinSubmissions } from "@logit/core/data/remote/remoteCheckinRepo";
import { createRemoteExerciseRepo } from "@logit/core/data/remote/remoteExerciseRepo";
import { createRemoteProgressionRepo } from "@logit/core/data/remote/remoteProgressionRepo";
import { createRemoteNutritionRepo } from "@logit/core/data/remote/remoteNutritionRepo";
import { createRemoteCoachNutritionPlanRepo } from "@logit/core/data/remote/remoteCoachNutritionPlanRepo";
import { createLocalAnalyticsRegistry } from "@logit/core/progression/localAnalyticsRegistry";
import { createLocalNutritionAlgorithmRegistry } from "@logit/core/nutrition/algorithmRegistry";
import { createLocalNutritionAnalyticsRegistry } from "@logit/core/nutrition/analyticsRegistry";
import type { NutritionDeps } from "@logit/core/usecases/nutrition/deps";
import type { ProgressionDeps } from "@logit/core/usecases/progression/deps";
import type { AlgorithmRegistry } from "@logit/core/progression/algorithmRegistry";

// Progression *suggestions* (what weight to lift next) are a mobile-only workflow —
// out of scope for this read-only web dashboard. This stub satisfies ProgressionDeps
// without pretending any algorithm is actually available.
const stubAlgorithmRegistry: AlgorithmRegistry = {
  async list() {
    return [];
  },
  async get() {
    return null;
  },
};

/** Repos/registries scoped to whichever account the token belongs to (default), or to a
 * specific client's data when `clientId` is given — a Studio-tier coach viewing a client
 * uses the exact same analytics usecases this way, no new analytics logic needed. Not
 * cached: these are cheap closures with no setup cost, and caching would risk serving a
 * previous client's repos after switching. */
export function getWebDeps(clientId?: string): ProgressionDeps {
  return {
    workoutRepo: createRemoteWorkoutRepo(clientId),
    progressionRepo: createRemoteProgressionRepo(),
    exerciseRepo: createRemoteExerciseRepo(clientId),
    algorithmRegistry: stubAlgorithmRegistry,
    analyticsRegistry: createLocalAnalyticsRegistry(),
  };
}

export function getWebSplitRepo(clientId?: string) {
  return createRemoteSplitRepo(clientId);
}

/** Coach-side authoring of training programs. Unscoped (always writes the caller's own
 * authored programs) — the read-only client-scoping the other repos do doesn't apply here. */
export function getWebCoachProgramRepo() {
  return createRemoteCoachProgramRepo();
}

/** Coach-side authoring of check-in schedules. */
export function getWebCheckinRepo() {
  return createRemoteCheckinRepo();
}

/** Coach-side authoring of a client's nutrition plan. */
export function getWebCoachNutritionPlanRepo() {
  return createRemoteCoachNutritionPlanRepo();
}

/** Read-only nutrition usecase deps scoped to one client's data — for the coach's
 * monitoring view (diary / weight / adherence). */
export function getWebNutritionDeps(clientId: string): NutritionDeps {
  return {
    nutritionRepo: createRemoteNutritionRepo(clientId),
    foodDbRepo: {
      isOfflineAvailable: () => false,
      async searchFoods() {
        return [];
      },
      async getFood() {
        return null;
      },
      async getFoodByBarcode() {
        return null;
      },
    },
    nutritionAlgorithmRegistry: createLocalNutritionAlgorithmRegistry(),
    nutritionAnalyticsRegistry: createLocalNutritionAnalyticsRegistry(),
  };
}

export { fetchClientCheckinSubmissions };
