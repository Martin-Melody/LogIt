import { writable } from "svelte/store";
import type { WorkoutSession } from "$lib/domain/workout";
import { listRecentSessions } from "$lib/usecases/listRecentSessions";

type RecentSessionsStore = {
  subscribe: (run: (value: WorkoutSession[]) => void) => () => void;
  refresh: (limit?: number) => Promise<WorkoutSession[]>;
  clear: () => void;
};

function createRecentSessionsStore(): RecentSessionsStore {
  const store = writable<WorkoutSession[]>([]);
  let refreshToken = 0;

  return {
    subscribe: store.subscribe,

    async refresh(limit = 5) {
      const token = ++refreshToken;

      const sessions = await listRecentSessions(limit);

      // If another refresh started after this one, ignore this result
      if (token !== refreshToken) return sessions;

      store.set(sessions);
      return sessions;
    },

    clear() {
      store.set([]);
    },
  };
}

export const recentSessions = createRecentSessionsStore();
