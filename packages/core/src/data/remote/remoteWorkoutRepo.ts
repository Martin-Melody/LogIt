import type { WorkoutRepo, ListRecentSessionsOptions } from "../workoutRepo";
import type { WorkoutSession } from "../../domain/workout";
import type { SetTypeOption } from "../types";
import { syncApi } from "../../api/syncApi";

const NOT_SUPPORTED = "Not supported in read-only remote mode.";

function sortByMostRecent(a: WorkoutSession, b: WorkoutSession): number {
  const aTime = a.endedAtMs ?? a.startedAtMs;
  const bTime = b.endedAtMs ?? b.startedAtMs;
  return bTime - aTime;
}

async function fetchAllSessions(clientId?: string): Promise<WorkoutSession[]> {
  const { sessions } = await syncApi.pullSessions(0, clientId);
  const parsed: WorkoutSession[] = [];
  for (const entry of sessions) {
    if (entry.deletedAtMs || !entry.dataJson) continue;
    try {
      parsed.push(JSON.parse(entry.dataJson) as WorkoutSession);
    } catch {}
  }
  return parsed;
}

/** Read-only WorkoutRepo backed by the sync API's pull endpoint, scoped to
 * whichever account the caller's access token belongs to. Used by the web
 * app to render analytics for cloud-synced data without a local device
 * copy. Write methods throw — this repo never mutates server state. */
export function createRemoteWorkoutRepo(clientId?: string): WorkoutRepo {
  return {
    async saveSession(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async getSession(id: string): Promise<WorkoutSession | null> {
      const sessions = await fetchAllSessions(clientId);
      return sessions.find((s) => s.id === id) ?? null;
    },

    async listRecentSessions(
      options: ListRecentSessionsOptions,
    ): Promise<WorkoutSession[]> {
      const sessions = await fetchAllSessions(clientId);
      return sessions.sort(sortByMostRecent).slice(0, options.limit);
    },

    async listAllSessions(): Promise<WorkoutSession[]> {
      return fetchAllSessions(clientId);
    },

    async deleteSession(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async clearAllSessions(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async saveDraftSession(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async loadDraftSession(): Promise<WorkoutSession | null> {
      return null;
    },

    async clearDraftSession(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },

    async getSetTypes(): Promise<SetTypeOption[]> {
      return [
        { id: "normal", code: "normal", label: "Normal" },
        { id: "warmup", code: "warmup", label: "Warm-up" },
        { id: "dropset", code: "dropset", label: "Drop set" },
        { id: "amrap", code: "amrap", label: "AMRAP" },
        { id: "failure", code: "failure", label: "To failure" },
      ];
    },
  };
}
