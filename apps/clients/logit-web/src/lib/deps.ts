import { createRemoteWorkoutRepo } from "@logit/core/data/remote/remoteWorkoutRepo";
import { createRemoteSplitRepo } from "@logit/core/data/remote/remoteSplitRepo";
import { createRemoteExerciseRepo } from "@logit/core/data/remote/remoteExerciseRepo";
import { createRemoteProgressionRepo } from "@logit/core/data/remote/remoteProgressionRepo";
import { createLocalAnalyticsRegistry } from "@logit/core/progression/localAnalyticsRegistry";
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
