import type { ProgressionRepo } from "../progressionRepo";

const NOT_SUPPORTED = "Not supported in read-only remote mode.";

/** Read-only ProgressionRepo stub for the web app. Per-device progression-algorithm
 * state (active algorithm, per-exercise plateau state, analytics plugin choice) was
 * never designed to sync — it's out of scope for a read-only cloud analytics view.
 * All reads come back empty so usecases that optionally enrich with this data (e.g.
 * getProgressData's algorithmState) degrade gracefully instead of crashing. See
 * remoteWorkoutRepo.ts for the pattern this follows. */
export function createRemoteProgressionRepo(): ProgressionRepo {
  return {
    async getConfig() {
      return null;
    },
    async saveConfig() {
      throw new Error(NOT_SUPPORTED);
    },
    async clearConfig() {
      throw new Error(NOT_SUPPORTED);
    },

    async getAnalyticsConfig() {
      return null;
    },
    async saveAnalyticsConfig() {
      throw new Error(NOT_SUPPORTED);
    },
    async clearAnalyticsConfig() {
      throw new Error(NOT_SUPPORTED);
    },

    async getExerciseState() {
      return null;
    },
    async saveExerciseState() {
      throw new Error(NOT_SUPPORTED);
    },
    async listExerciseStates() {
      return [];
    },
    async clearStates() {
      throw new Error(NOT_SUPPORTED);
    },
    async resetExerciseState() {
      throw new Error(NOT_SUPPORTED);
    },

    async getAlgorithmPreferences() {
      return null;
    },
    async setAlgorithmPreferences() {
      throw new Error(NOT_SUPPORTED);
    },
  };
}
