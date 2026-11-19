import { get, writable } from "svelte/store";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { startSession } from "$lib/usecases/startSession";
import { loadDraftSession } from "$lib/usecases/loadDraftSession";
import { finishCurrentSession } from "$lib/usecases/finishCurrentSession";
import type { SplitDay } from "@logit/core/domain/WorkoutSplit";
import type { ProgramDay } from "@logit/core/domain/CoachProgram";
import { startSessionFromSplitDay, startPlannedSession } from "$lib/usecases/startSessionFromSplitDay";
import { startSessionFromProgramDay } from "$lib/usecases/startSessionFromProgramDay";
import { repeatLastSession, repeatPastSession } from "$lib/usecases/repeatLastSession";
import { getWorkoutRepo } from "$lib/data/repoProvider";
import { describeWorkoutChange, type WorkoutChange } from "@logit/core/domain/workoutChange";

/** What Undo and Redo would do now, for the ⋯ menu and the toast. `steps` counts recorded
 * steps, so the screen can tell a new step from an undo. */
export type WorkoutHistory = { undo: WorkoutChange | null; redo: WorkoutChange | null; steps: number };
type Step = { before: WorkoutSession; after: WorkoutSession; change: WorkoutChange };
/** Plenty for one workout; the oldest steps drop off after this. */
const MAX_STEPS = 200;

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
  /** `program` names it in the history. */
  startFromProgramDay: (day: ProgramDay, program?: { id: string; name: string; coachId?: string }) => Promise<WorkoutSession>;
  /** A copy of a past workout, to do again. */
  repeat: (session: WorkoutSession) => Promise<WorkoutSession>;
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
  mutate: (updater: (session: WorkoutSession) => WorkoutSession, opts?: { auto?: boolean }) => Promise<WorkoutSession | null>;
  /** Undo and redo for this workout. Every mutate is a step unless it's `auto` (the rest
   * timer, a circuit moving on, plans filled in by the app): those never become steps.
   * Undo goes back to the workout as it was before the step. */
  history: { subscribe: (run: (value: WorkoutHistory) => void) => () => void };
  undo: () => Promise<WorkoutChange | null>;
  redo: () => Promise<WorkoutChange | null>;
  getTransitioning: () => boolean;
};

function createCurrentSessionStore(): CurrentSessionStore {
  const store = writable<CurrentSessionState>({
    session: null,
    transitioning: false,
  });
  let mutateQueue: Promise<unknown> = Promise.resolve();
  let undoStack: Step[] = [];
  let redoStack: Step[] = [];
  let steps = 0;
  const history = writable<WorkoutHistory>({ undo: null, redo: null, steps: 0 });
  const publish = () => history.set({ undo: undoStack.at(-1)?.change ?? null, redo: redoStack.at(-1)?.change ?? null, steps });
  // A new or finished workout starts with no history.
  const forget = () => {
    undoStack = [];
    redoStack = [];
    publish();
  };

  /** Run one change in the queue, on the latest session, and save the draft. */
  function enqueue<T>(fn: (session: WorkoutSession) => { next: WorkoutSession; result: T } | null): Promise<T | null> {
    const run = mutateQueue.then(async () => {
      const { session, transitioning } = get(store);
      if (!session || transitioning) return null;
      const out = fn(session);
      if (!out) return null;
      if (out.next !== session) {
        store.update((s) => ({ ...s, session: out.next }));
        await getWorkoutRepo().saveDraftSession(out.next);
      }
      return out.result;
    });
    // Keep the queue going after a failure; the caller still sees its own error.
    mutateQueue = run.catch(() => {});
    return run;
  }

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
      forget();
      return session;
    },

    async startFromSplitDay(day: SplitDay) {
      const session = await startSessionFromSplitDay(day);
      store.set({ session, transitioning: false });
      forget();
      return session;
    },

    async startPlanned(planned: WorkoutSession) {
      const session = await startPlannedSession(planned);
      store.set({ session, transitioning: false });
      forget();
      return session;
    },

    async startFromProgramDay(day: ProgramDay, program?: { id: string; name: string; coachId?: string }) {
      const session = await startSessionFromProgramDay(day, program);
      store.set({ session, transitioning: false });
      forget();
      return session;
    },

    async repeat(past: WorkoutSession) {
      const session = await repeatPastSession(past);
      store.set({ session, transitioning: false });
      forget();
      return session;
    },

    async repeatLast() {
      const session = await repeatLastSession();
      if (session) {
        store.set({ session, transitioning: false });
        forget();
      }
      forget();
      return session;
    },

    async loadDraft() {
      const draft = await loadDraftSession();
      store.set({ session: draft, transitioning: false });
      forget();
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
      forget();

      return finished;
    },

    clear() {
      store.set({ session: null, transitioning: false });
      forget();
    },

    setSession(session) {
      store.update((s) => ({ ...s, session }));
    },

    mutate(updater, opts) {
      return enqueue((session) => {
        const next = updater(session);
        if (next !== session && !opts?.auto) {
          undoStack.push({ before: session, after: next, change: describeWorkoutChange(session, next) });
          if (undoStack.length > MAX_STEPS) undoStack.shift();
          redoStack = [];
          steps++;
          publish();
        }
        return { next, result: next };
      });
    },

    history: { subscribe: history.subscribe },

    undo() {
      return enqueue((session) => {
        const step = undoStack.pop();
        if (!step) return null;
        // What's on screen now (with anything the app did since) is what Redo brings back.
        redoStack.push({ before: step.before, after: session, change: step.change });
        publish();
        return { next: step.before, result: step.change };
      });
    },

    redo() {
      return enqueue((session) => {
        const step = redoStack.pop();
        if (!step) return null;
        undoStack.push({ before: session, after: step.after, change: step.change });
        publish();
        return { next: step.after, result: step.change };
      });
    },
  };
}

export const currentSession = createCurrentSessionStore();
