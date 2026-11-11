import { get, writable } from "svelte/store";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { startSession } from "$lib/usecases/startSession";
import { loadDraftSession } from "$lib/usecases/loadDraftSession";
import { finishCurrentSession } from "$lib/usecases/finishCurrentSession";
import type { SplitDay } from "@logit/core/domain/WorkoutSplit";
import type { ProgramDay } from "@logit/core/domain/CoachProgram";
import { startSessionFromSplitDay, startPlannedSession } from "$lib/usecases/startSessionFromSplitDay";
import { startSessionFromProgramDay } from "$lib/usecases/startSessionFromProgramDay";
import { repeatLastSession } from "$lib/usecases/repeatLastSession";
import { getWorkoutRepo } from "$lib/data/repoProvider";

type CurrentSessionState = {
  session: WorkoutSession | null;
  transitioning: boolean; // prevents UI flash when draft/session is cleared during nav
};

type CurrentSessionStore = {
  subscribe: (run: (value: WorkoutSession | null) => void) => () => void;
  subscribeState: (run: (value: CurrentSessionState) => void) => () => void;

  start: () => Promise<WorkoutSession>;
  startFromSplitDay: (day: SplitDay) => Promise<WorkoutSession>;
  /** Start a session already built and planned (the "Today's plan" screen). */
  startPlanned: (session: WorkoutSession) => Promise<WorkoutSession>;
  startFromProgramDay: (day: ProgramDay) => Promise<WorkoutSession>;
  repeatLast: () => Promise<WorkoutSession | null>;
  loadDraft: () => Promise<WorkoutSession | null>;
  finish: () => Promise<WorkoutSession | null>;

  beginTransition: () => void;
  endTransition: () => void;

  clear: () => void;
  setSession: (session: WorkoutSession | null) => void;
  /**
   * Change the in-progress session and save the draft. Changes run one at a time, each on
   * the latest session, so two writers (the session screen and the rest timer) can't undo
   * each other. Does nothing while there's no session or it's being finished. Resolves to
   * the saved session (or null when nothing was done).
   */
  mutate: (updater: (session: WorkoutSession) => WorkoutSession) => Promise<WorkoutSession | null>;
  getTransitioning: () => boolean;
};

function createCurrentSessionStore(): CurrentSessionStore {
  const store = writable<CurrentSessionState>({
    session: null,
    transitioning: false,
  });
  let mutateQueue: Promise<unknown> = Promise.resolve();

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

    async startPlanned(planned: WorkoutSession) {
      const session = await startPlannedSession(planned);
      store.set({ session, transitioning: false });
      return session;
    },

    async startFromProgramDay(day: ProgramDay) {
      const session = await startSessionFromProgramDay(day);
      store.set({ session, transitioning: false });
      return session;
    },

    async repeatLast() {
      const session = await repeatLastSession();
      if (session) store.set({ session, transitioning: false });
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

    mutate(updater) {
      const run = mutateQueue.then(async () => {
        const { session, transitioning } = get(store);
        if (!session || transitioning) return null;
        const next = updater(session);
        if (next === session) return session;
        store.update((s) => ({ ...s, session: next }));
        await getWorkoutRepo().saveDraftSession(next);
        return next;
      });
      // Keep the queue going after a failure; the caller still sees its own error.
      mutateQueue = run.catch(() => {});
      return run;
    },
  };
}

export const currentSession = createCurrentSessionStore();
