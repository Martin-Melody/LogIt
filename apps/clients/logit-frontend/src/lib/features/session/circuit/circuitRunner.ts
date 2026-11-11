import { get, writable } from "svelte/store";
import { toast } from "$lib/components/ui/sonner/index";
import { currentSession } from "$lib/stores/currentSession.store";
import type { WorkoutSession } from "@logit/core/domain/workout";
import {
  applyCircuitSaves,
  extendCircuit,
  finishRepsCircuit,
  pauseCircuit,
  phaseRemainingMs,
  resumeCircuit,
  skipCircuit,
  startCircuit,
  startNowCircuit,
  tickCircuit,
  type CircuitPhase,
  type CircuitRun,
  type CircuitUpdate,
} from "@logit/core/domain/circuit";
import { cueEnd, cueGo, cueTick, keepScreenOn, unlockAudio } from "./cues";

// ── The running circuit ──────────────────────────────────────────────────────
// One circuit runs at a time. The run itself is the pure state from
// `@logit/core/domain/circuit`; this module ticks it, writes its saves into the
// workout (through currentSession.mutate, so each change sees the latest workout),
// plays the cues and keeps the screen on. It lives outside the page, so leaving
// the workout screen doesn't stop the countdown. A reload does (it isn't stored).

export type CircuitRunnerState = { run: CircuitRun | null; expanded: boolean };

const state = writable<CircuitRunnerState>({ run: null, expanded: true });
/** The clock the overlay draws from, updated a few times a second while running. */
export const circuitNow = writable(Date.now());

const TICK_MS = 200;
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
let lastSecond: number | null = null;

function setRun(run: CircuitRun | null): void {
  const prev = get(state).run;
  if (prev && run) cueFor(prev.phase, run.phase);
  if (run?.phase.kind === "done") {
    stop();
    toast("Circuit done");
    return;
  }
  state.update((s) => ({ ...s, run }));
  circuitNow.set(Date.now());
}

function cueFor(prev: CircuitPhase, next: CircuitPhase): void {
  const work = (p: CircuitPhase) => p.kind === "hold" || p.kind === "reps";
  if (prev.kind === "lead" && work(next)) cueGo();
  else if ((prev.kind === "hold" || prev.kind === "rest") && next.kind !== prev.kind) cueEnd();
}

/** Run one change against the latest workout and save what it logged. */
async function act(fn: (s: WorkoutSession, run: CircuitRun) => CircuitUpdate): Promise<void> {
  const result = await currentSession
    .mutate((s) => {
      const run = get(state).run;
      if (!run) return s;
      const u = fn(s, run);
      setRun(u.run);
      return applyCircuitSaves(s, u.saves);
    })
    .catch(() => null);
  // The workout was finished or discarded under us.
  if (result === null && get(state).run) stop();
}

function onTick(): void {
  const now = Date.now();
  circuitNow.set(now);
  const run = get(state).run;
  if (!run || run.pausedAtMs !== null) return;

  // Count the last three seconds of a lead-in or hold out loud.
  const p = run.phase;
  if (p.kind === "lead" || p.kind === "hold") {
    const sec = Math.ceil(phaseRemainingMs(run, now) / 1000);
    if (sec !== lastSecond && sec >= 1 && sec <= 3) cueTick();
    lastSecond = sec;
  } else {
    lastSecond = null;
  }

  const due = (p.kind === "lead" || p.kind === "hold" || p.kind === "rest") && p.endsAtMs <= now;
  if (due && !busy) {
    busy = true;
    void act((s, r) => tickCircuit(s, r, Date.now())).finally(() => {
      busy = false;
    });
  }
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  lastSecond = null;
  keepScreenOn(false);
  state.set({ run: null, expanded: true });
}

let watchingSession = false;

export const circuitRunner = {
  subscribe: state.subscribe,

  /** Start (from a tap, so sound can play). Does nothing if the group has no drill left. */
  start(supersetId: string): boolean {
    const session = get(currentSession);
    if (!session) return false;
    const run = startCircuit(session, supersetId, Date.now());
    if (!run) {
      toast("Nothing left to run in this circuit");
      return false;
    }
    unlockAudio();
    keepScreenOn(true);
    if (!watchingSession) {
      watchingSession = true;
      currentSession.subscribe((s) => {
        if (!s && get(state).run) stop();
      });
    }
    state.set({ run, expanded: true });
    circuitNow.set(Date.now());
    if (timer) clearInterval(timer);
    timer = setInterval(onTick, TICK_MS);
    return true;
  },

  /** End the run. What was logged stays logged. */
  end(): void {
    stop();
  },

  pause(): void {
    const run = get(state).run;
    if (run) state.update((s) => ({ ...s, run: pauseCircuit(run, Date.now()) }));
  },

  resume(): void {
    const run = get(state).run;
    if (run) state.update((s) => ({ ...s, run: resumeCircuit(run, Date.now()) }));
  },

  /** +10 s on the hold or rest. */
  extend(ms = 10_000): void {
    const run = get(state).run;
    if (run) state.update((s) => ({ ...s, run: extendCircuit(run, ms) }));
  },

  /** "Start now" in a lead-in, or "Skip rest". */
  startNow(): Promise<void> {
    return act((s, r) => ({ run: startNowCircuit(s, r, Date.now()), saves: [] }));
  },

  skip(): Promise<void> {
    return act((s, r) => skipCircuit(s, r, Date.now()));
  },

  finishReps(reps: number): Promise<void> {
    return act((s, r) => finishRepsCircuit(s, r, reps, Date.now()));
  },

  shrink(): void {
    state.update((s) => ({ ...s, expanded: false }));
  },

  expand(): void {
    state.update((s) => ({ ...s, expanded: true }));
  },
};
