import { get, writable } from "svelte/store";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { startSession } from "$lib/usecases/startSession";
import { loadDraftSession } from "$lib/usecases/loadDraftSession";
import { finishCurrentSession } from "$lib/usecases/finnishCurrentSession";
import type { SplitDay } from "@logit/core/domain/WorkoutSplit";
import { startSessionFromSplitDay } from "$lib/usecases/startSessionFromSplitDay";

type CurrentSessionState = {
  session: WorkoutSession | null;
  transitioning: boolean; // prevents UI flash when draft/session is cleared during nav
};

type CurrentSessionStore = {
  subscribe: (run: (value: WorkoutSession | null) => void) => () => void;
  subscribeState: (run: (value: CurrentSessionState) => void) => () => void;

  start: () => Promise<WorkoutSession>;
  startFromSplitDay: (day: SplitDay) => Promise<WorkoutSession>;
  loadDraft: () => Promise<WorkoutSession | null>;
  finish: () => Promise<WorkoutSession | null>;

  beginTransition: () => void;
  endTransition: () => void;

  clear: () => void;
  setSession: (session: WorkoutSession | null) => void;
  getTransitioning: () => boolean;
};

function createCurrentSessionStore(): CurrentSessionStore {
  const store = writable<CurrentSessionState>({
    session: null,
    transitioning: false,
  });

  return {
    subscribe: (run) => store.subscribe((s) => run(s.session)),
    subscribeState: store.subscribe,

    beginTransition() {
      store.update((s) => ({ ...s, transitioning: true }));
    },

    endTransition() {
      store.update((s) => ({ ...s, transitioning: false }));
    },

    getTransitioning() {
      return get(store).transitioning;
    },

    async start() {
      const session = await startSession();
      store.set({ session, transitioning: false });
      return session;
    },

    async startFromSplitDay(day: SplitDay) {
      const session = await startSessionFromSplitDay(day);
      store.set({ session, transitioning: false });
      return session;
    },

    async loadDraft() {
      const draft = await loadDraftSession();
      store.set({ session: draft, transitioning: false });
      return draft;
    },

    async finish() {
      const { session } = get(store);
      if (!session) return null;

      // mark transition BEFORE the usecase clears the draft in storage
      store.update((s) => ({ ...s, transitioning: true }));

      const finished = await finishCurrentSession(session);

      // clear session in memory (transition stays true until caller navigates away)
      store.update((s) => ({ ...s, session: null }));

      return finished;
    },

    clear() {
      store.set({ session: null, transitioning: false });
    },

    setSession(session) {
      store.update((s) => ({ ...s, session }));
    },
  };
}

export const currentSession = createCurrentSessionStore();
