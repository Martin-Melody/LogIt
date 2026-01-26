import { get, writable } from "svelte/store";
import type { WorkoutSession } from "$lib/domain/workout";
import { startSession } from "$lib/usecases/startSession";
import { loadDraftSession } from "$lib/usecases/loadDraftSession";
import { finishCurrentSession } from "$lib/usecases/finnishCurrentSession";

type CurrentSessionStore = {
  subscribe: (run: (value: WorkoutSession | null) => void) => () => void;
  start: () => Promise<WorkoutSession>;
  loadDraft: () => Promise<WorkoutSession | null>;
  finish: () => Promise<WorkoutSession | null>;
  clear: () => void;
  setSession: (session: WorkoutSession | null) => void;
};

function createCurrentSessionStore(): CurrentSessionStore {
  const store = writable<WorkoutSession | null>(null);

  return {
    subscribe: store.subscribe,

    async start() {
      const session = await startSession();
      store.set(session);
      return session;
    },

    async loadDraft() {
      const draft = await loadDraftSession();
      store.set(draft);
      return draft;
    },

    async finish() {
      const session = get(store);
      if (!session) return null;

      const finished = await finishCurrentSession(session);
      store.set(null); // clear current session in UI
      return finished;
    },

    clear() {
      store.set(null);
    },

    setSession(session) {
      store.set(session);
    },
  };
}

export const currentSession = createCurrentSessionStore();
