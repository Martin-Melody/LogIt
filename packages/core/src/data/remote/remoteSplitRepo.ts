import type { SplitRepo, ListSplitsOptions } from "../splitRepo";
import type { WorkoutSplit } from "../../domain/WorkoutSplit";
import { syncApi } from "../../api/syncApi";

const NOT_SUPPORTED = "Not supported in read-only remote mode.";

async function fetchAllSplits(clientId?: string): Promise<WorkoutSplit[]> {
  const { splits } = await syncApi.pullSplits(0, clientId);
  const parsed: WorkoutSplit[] = [];
  for (const entry of splits) {
    if (entry.deletedAtMs || !entry.dataJson) continue;
    try {
      parsed.push(JSON.parse(entry.dataJson) as WorkoutSplit);
    } catch {}
  }
  return parsed;
}

/** Read-only SplitRepo backed by the sync API's pull endpoint. See
 * remoteWorkoutRepo.ts for the rationale. Pass `clientId` to view a client's data
 * instead of the caller's own (requires an Active coach relationship — enforced
 * server-side). */
export function createRemoteSplitRepo(clientId?: string): SplitRepo {
  return {
    async saveSplit(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async getSplit(id: string): Promise<WorkoutSplit | null> {
      const splits = await fetchAllSplits(clientId);
      return splits.find((s) => s.id === id) ?? null;
    },

    async getListSplits(options?: ListSplitsOptions): Promise<WorkoutSplit[]> {
      let splits = await fetchAllSplits(clientId);
      if (!options?.includeArchived) splits = splits.filter((s) => !s.archived);
      splits = [...splits].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      if (options?.offset) splits = splits.slice(options.offset);
      if (options?.limit) splits = splits.slice(0, options.limit);
      return splits;
    },

    async deleteSplit(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async setActiveSplitId(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async getActiveSplitId(): Promise<string | null> {
      return null;
    },
  };
}
