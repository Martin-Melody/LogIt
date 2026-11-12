// ── Running a circuit with the countdown ─────────────────────────────────────
// A circuit (or superset) of mobility drills is run one set at a time, round by
// round: A1 B1 C1, A2 B2 C2… (per-side drills do both sides back to back). Each
// set gets a 3-2-1 lead-in, then a hold that counts down and stops on its own (or,
// for rep drills, a goal with a Done button). Rests can run between exercises (on by
// default in a circuit) and between rounds.
//
// Everything here is pure: the run is a small state value, every action takes the
// current time, and what has to be written to the workout comes back as `saves`.
// The app ticks it and applies the saves. Times are absolute (ms since epoch), so a
// run that was in the background catches up on the next tick.

import {
  blockGroup,
  groupKindOf,
  mobilitySetGroups,
  type MobilityBlockData,
  type MobilityMetric,
  type MobilitySetPatch,
  type MobilitySide,
  type SessionBlock,
  type SupersetInfo,
  type WorkoutSession,
} from "./workout";

export const LEAD_IN_MS = 3_000;
export const SWITCH_SIDES_MS = 5_000;
export const DEFAULT_HOLD_SEC = 30;
export const DEFAULT_REPS = 10;
/** How long a rep counts for in the time estimate, ms. */
export const ESTIMATE_MS_PER_REP = 3_000;

/** The app-wide defaults a group falls back to (Settings). */
export type CircuitDefaults = {
  /** Get-ready before each exercise. */
  leadInMs: number;
  /** Rest between exercises in a circuit (supersets default to none). */
  memberRestMs: number;
};
export const DEFAULT_CIRCUIT_SETTINGS: CircuitDefaults = { leadInMs: LEAD_IN_MS, memberRestMs: 15_000 };

/** A group's timings with its defaults filled in, ms. */
export type GroupTiming = { leadInMs: number; memberRestMs: number; roundRestMs: number };

/** One set of one drill in one round, in the order the circuit runs. */
export type CircuitStep = {
  blockId: string;
  setId: string;
  drillName: string;
  metric: MobilityMetric;
  side?: MobilitySide;
  /** 0-based round. */
  round: number;
  /** Position among the circuit's drills (0-based), for "exercise 2 of 5". */
  memberIndex: number;
  memberCount: number;
  roundCount: number;
  /** Hold goal: the set's target, else the drill's last hold, else 30 s. */
  goalSec: number;
  /** Rep goal: the set's reps, else the drill's last reps, else 10. */
  reps: number;
  completed: boolean;
};

export type CircuitPhase =
  | { kind: "lead"; setId: string; endsAtMs: number; durationMs: number; switching: boolean }
  | { kind: "hold"; setId: string; startedAtMs: number; endsAtMs: number }
  | { kind: "reps"; setId: string; startedAtMs: number }
  /** `between`: rest between exercises in a round; else between rounds. */
  | { kind: "rest"; nextSetId: string; endsAtMs: number; durationMs: number; between?: boolean }
  | { kind: "done" };

export type CircuitRun = {
  supersetId: string;
  phase: CircuitPhase;
  /** Set while paused; resuming shifts every time in the phase by the pause. */
  pausedAtMs: number | null;
  /** Sets skipped before they started this run, so they aren't offered again. */
  skipped: string[];
  /** The app defaults the group's own timings fall back to. Missing = the built-in ones. */
  defaults?: CircuitDefaults;
};

export type CircuitSave = { blockId: string; setId: string; patch: MobilitySetPatch };
export type CircuitUpdate = { run: CircuitRun; saves: CircuitSave[] };

/** Only the blocks are read, so a group's own blocks can be passed as `{ blocks }`. */
type HasBlocks = Pick<WorkoutSession, "blocks">;

function groupMembers(session: HasBlocks, supersetId: string): SessionBlock[] {
  return [...session.blocks]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((b) => blockGroup(b)?.id === supersetId);
}

/** The group's rest between rounds, ms (0 = none). */
export function circuitRoundRestMs(session: HasBlocks, supersetId: string): number {
  const first = groupMembers(session, supersetId)[0];
  return (first && blockGroup(first)?.roundRestMs) || 0;
}

/**
 * The countdown's timings for a group: its own settings, else the app defaults. Rest
 * between exercises defaults on for a circuit and off for a superset.
 */
export function groupTiming(
  session: HasBlocks,
  supersetId: string,
  defaults: CircuitDefaults = DEFAULT_CIRCUIT_SETTINGS,
): GroupTiming {
  const members = groupMembers(session, supersetId);
  return resolveGroupTiming(members[0] ? blockGroup(members[0]) : undefined, members.length, defaults);
}

/** `groupTiming` for a group's settings and size, wherever they're kept (a split day too). */
export function resolveGroupTiming(
  info: Pick<SupersetInfo, "kind" | "leadInMs" | "memberRestMs" | "roundRestMs"> | undefined,
  memberCount: number,
  defaults: CircuitDefaults = DEFAULT_CIRCUIT_SETTINGS,
): GroupTiming {
  const kind = groupKindOf(memberCount, info?.kind);
  return {
    leadInMs: info?.leadInMs ?? defaults.leadInMs,
    memberRestMs: info?.memberRestMs ?? (kind === "circuit" ? defaults.memberRestMs : 0),
    roundRestMs: info?.roundRestMs ?? 0,
  };
}

/**
 * Every set the countdown runs, in order: round by round, drills in workout order,
 * the leading side first. Only mobility drills take part for now; strength and
 * cardio members are left to be logged by hand.
 */
export function circuitSteps(session: HasBlocks, supersetId: string): CircuitStep[] {
  const drills = groupMembers(session, supersetId).filter((b) => b.type === "mobility");
  const perDrill = drills.map((b) => mobilitySetGroups(b.data as MobilityBlockData));
  const roundCount = Math.max(0, ...perDrill.map((g) => g.length));
  const steps: CircuitStep[] = [];

  for (let round = 0; round < roundCount; round++) {
    drills.forEach((block, memberIndex) => {
      const data = block.data as MobilityBlockData;
      const group = perDrill[memberIndex]![round];
      if (!group) return;
      const sets =
        group.kind === "single"
          ? [group.set]
          : group.lead === "right"
            ? [group.right, group.left]
            : [group.left, group.right];
      for (const set of sets) {
        if (!set) continue;
        // Earlier sets of this drill (same side), latest first, for goal fallbacks.
        const earlier = perDrill[memberIndex]!
          .slice(0, round)
          .reverse()
          .flatMap((g) => (g.kind === "single" ? [g.set] : [g.left, g.right]))
          .filter((s) => s && (!data.perSide || s.side === set.side));
        const goalSec =
          set.targetSec ??
          earlier.map((s) => s?.targetSec ?? s?.durationSec).find((v) => !!v) ??
          DEFAULT_HOLD_SEC;
        const reps = set.reps ?? earlier.map((s) => s?.reps).find((v) => !!v) ?? DEFAULT_REPS;
        steps.push({
          blockId: block.id,
          setId: set.id,
          drillName: data.drillName,
          metric: data.metric,
          ...(data.perSide && set.side ? { side: set.side } : {}),
          round,
          memberIndex,
          memberCount: drills.length,
          roundCount,
          goalSec,
          reps,
          completed: !!set.completed,
        });
      }
    });
  }
  return steps;
}

/** Steps still to do, in order: not completed, not skipped this run, not `exceptSetId`. */
export function pendingSteps(
  session: WorkoutSession,
  run: Pick<CircuitRun, "supersetId" | "skipped">,
  exceptSetId?: string,
): CircuitStep[] {
  return circuitSteps(session, run.supersetId).filter(
    (s) => !s.completed && !run.skipped.includes(s.setId) && s.setId !== exceptSetId,
  );
}

/** The set the run is on (lead-in, hold or reps), or the one after the rest. */
export function currentStep(session: WorkoutSession, run: CircuitRun): CircuitStep | null {
  const p = run.phase;
  const setId = p.kind === "rest" ? p.nextSetId : p.kind === "done" ? null : p.setId;
  if (!setId) return null;
  return circuitSteps(session, run.supersetId).find((s) => s.setId === setId) ?? null;
}

/** What comes after the current set, for "Up next" (and "Then …"). */
export function upcomingSteps(session: WorkoutSession, run: CircuitRun, count = 2): CircuitStep[] {
  const current = currentStep(session, run);
  return pendingSteps(session, run, current?.setId).slice(0, count);
}

/** True when the group has a drill set left to run. */
export function canRunCircuit(session: HasBlocks, supersetId: string): boolean {
  return circuitSteps(session, supersetId).some((s) => !s.completed);
}

function timingOf(session: HasBlocks, run: CircuitRun): GroupTiming {
  return groupTiming(session, run.supersetId, run.defaults);
}

function leadInto(step: CircuitStep, at: number, switching: boolean, leadInMs: number): CircuitPhase {
  const durationMs = switching ? SWITCH_SIDES_MS : leadInMs;
  return { kind: "lead", setId: step.setId, endsAtMs: at + durationMs, durationMs, switching };
}

/** Start at the first set not done yet. Null when there's nothing to run. */
export function startCircuit(
  session: WorkoutSession,
  supersetId: string,
  nowMs: number,
  defaults?: CircuitDefaults,
): CircuitRun | null {
  const run: CircuitRun = {
    supersetId,
    phase: { kind: "done" },
    pausedAtMs: null,
    skipped: [],
    ...(defaults ? { defaults } : {}),
  };
  const first = pendingSteps(session, run)[0];
  if (!first) return null;
  return { ...run, phase: leadInto(first, nowMs, false, timingOf(session, run).leadInMs) };
}

/** What comes between `from` and `next`: nothing, a side switch, or a rest. */
function gapKind(from: CircuitStep | null, next: CircuitStep): "none" | "switch" | "between" | "round" {
  if (!from) return "none";
  if (next.round > from.round) return "round";
  if (next.blockId === from.blockId) return "switch";
  return "between";
}

/** Move on from `from` (just finished or skipped) at time `at`. */
function moveOn(session: WorkoutSession, run: CircuitRun, from: CircuitStep | null, at: number): CircuitRun {
  const next = pendingSteps(session, run, from?.setId)[0];
  if (!next) return { ...run, phase: { kind: "done" }, pausedAtMs: null };
  const timing = timingOf(session, run);
  const gap = gapKind(from, next);
  const restMs = gap === "round" ? timing.roundRestMs : gap === "between" ? timing.memberRestMs : 0;
  if (restMs > 0) {
    return {
      ...run,
      phase: {
        kind: "rest",
        nextSetId: next.setId,
        endsAtMs: at + restMs,
        durationMs: restMs,
        ...(gap === "between" ? { between: true } : {}),
      },
    };
  }
  return { ...run, phase: leadInto(next, at, gap === "switch", timing.leadInMs) };
}

function stepFor(session: WorkoutSession, run: CircuitRun, setId: string): CircuitStep | null {
  return circuitSteps(session, run.supersetId).find((s) => s.setId === setId) ?? null;
}

function beginWork(step: CircuitStep, at: number): CircuitPhase {
  return step.metric === "reps"
    ? { kind: "reps", setId: step.setId, startedAtMs: at }
    : { kind: "hold", setId: step.setId, startedAtMs: at, endsAtMs: at + step.goalSec * 1000 };
}

function holdSave(step: CircuitStep, heldMs: number, session: WorkoutSession): CircuitSave {
  const patch: MobilitySetPatch = {
    durationSec: Math.round(heldMs / 1000),
    completed: true,
    restStartedAtMs: null,
  };
  // Keep the goal on the set so the row shows "/ 30s" like a planned one.
  if (!hasTarget(session, step)) patch.targetSec = step.goalSec;
  return { blockId: step.blockId, setId: step.setId, patch };
}

function hasTarget(session: WorkoutSession, step: CircuitStep): boolean {
  const block = session.blocks.find((b) => b.id === step.blockId);
  const set = (block?.data as MobilityBlockData | undefined)?.sets.find((s) => s.id === step.setId);
  return typeof set?.targetSec === "number" && set.targetSec > 0;
}

/**
 * Bring the run up to `nowMs`: lead-ins turn into holds, holds that ran out are
 * saved, rests end. Loops so a run left in the background catches up fully.
 */
export function tickCircuit(session: WorkoutSession, run: CircuitRun, nowMs: number): CircuitUpdate {
  const saves: CircuitSave[] = [];
  let r = run;
  let s = session;
  for (let guard = 0; guard < 1000 && r.pausedAtMs === null; guard++) {
    const p = r.phase;
    if (p.kind === "lead" && p.endsAtMs <= nowMs) {
      const step = stepFor(s, r, p.setId);
      r = step ? { ...r, phase: beginWork(step, p.endsAtMs) } : moveOn(s, r, null, p.endsAtMs);
    } else if (p.kind === "hold" && p.endsAtMs <= nowMs) {
      const step = stepFor(s, r, p.setId);
      if (step) {
        const save = holdSave(step, p.endsAtMs - p.startedAtMs, s);
        saves.push(save);
        s = applyCircuitSaves(s, [save]);
      }
      r = moveOn(s, r, step, p.endsAtMs);
    } else if (p.kind === "rest" && p.endsAtMs <= nowMs) {
      const step = stepFor(s, r, p.nextSetId);
      r = step ? { ...r, phase: leadInto(step, p.endsAtMs, false, timingOf(s, r).leadInMs) } : moveOn(s, r, null, p.endsAtMs);
    } else {
      break;
    }
  }
  return { run: r, saves };
}

export function pauseCircuit(run: CircuitRun, nowMs: number): CircuitRun {
  if (run.pausedAtMs !== null || run.phase.kind === "done") return run;
  return { ...run, pausedAtMs: nowMs };
}

export function resumeCircuit(run: CircuitRun, nowMs: number): CircuitRun {
  if (run.pausedAtMs === null) return run;
  const d = nowMs - run.pausedAtMs;
  const p = run.phase;
  const phase: CircuitPhase =
    p.kind === "lead" || p.kind === "rest"
      ? { ...p, endsAtMs: p.endsAtMs + d }
      : p.kind === "hold"
        ? { ...p, startedAtMs: p.startedAtMs + d, endsAtMs: p.endsAtMs + d }
        : p.kind === "reps"
          ? { ...p, startedAtMs: p.startedAtMs + d }
          : p;
  return { ...run, phase, pausedAtMs: null };
}

/** +10 s (or any amount) on the get-ready, the hold or the rest. */
export function extendCircuit(run: CircuitRun, ms: number): CircuitRun {
  const p = run.phase;
  if (p.kind === "hold") return { ...run, phase: { ...p, endsAtMs: p.endsAtMs + ms } };
  if (p.kind === "rest" || p.kind === "lead") {
    return { ...run, phase: { ...p, endsAtMs: p.endsAtMs + ms, durationMs: p.durationMs + ms } };
  }
  return run;
}

/** "Start now" during a lead-in, or "Skip rest". */
export function startNowCircuit(session: WorkoutSession, run: CircuitRun, nowMs: number): CircuitRun {
  const p = run.phase;
  if (p.kind !== "lead" && p.kind !== "rest") return run;
  // Unpauses too: the next part starts from now.
  return tickCircuit(session, { ...run, pausedAtMs: null, phase: { ...p, endsAtMs: nowMs } }, nowMs).run;
}

/**
 * Skip the current set. During a hold, the time held so far is saved (a hold
 * stopped early still counts); a lead-in or a rep goal is left unlogged.
 */
export function skipCircuit(session: WorkoutSession, run: CircuitRun, nowMs: number): CircuitUpdate {
  const p = run.phase;
  if (p.kind === "rest") return { run: startNowCircuit(session, run, nowMs), saves: [] };
  if (p.kind === "done") return { run, saves: [] };
  const resumed = { ...run, pausedAtMs: null };
  const step = stepFor(session, run, p.setId);
  const heldMs = phaseElapsedMs(run, nowMs);
  if (p.kind === "hold" && step && heldMs >= 1000) {
    const save = holdSave(step, heldMs, session);
    const s = applyCircuitSaves(session, [save]);
    return { run: moveOn(s, resumed, step, nowMs), saves: [save] };
  }
  const skipped = { ...resumed, skipped: [...run.skipped, p.setId] };
  return { run: moveOn(session, skipped, step, nowMs), saves: [] };
}

/** "Done" on a rep goal, with the reps actually done. */
export function finishRepsCircuit(
  session: WorkoutSession,
  run: CircuitRun,
  reps: number,
  nowMs: number,
): CircuitUpdate {
  const p = run.phase;
  if (p.kind !== "reps") return { run, saves: [] };
  const step = stepFor(session, run, p.setId);
  if (!step) return { run: moveOn(session, run, null, nowMs), saves: [] };
  const save: CircuitSave = {
    blockId: step.blockId,
    setId: step.setId,
    patch: { reps: Math.max(0, Math.round(reps)), completed: true, restStartedAtMs: null },
  };
  const s = applyCircuitSaves(session, [save]);
  return { run: moveOn(s, { ...run, pausedAtMs: null }, step, nowMs), saves: [save] };
}

/** Write the saves into the workout. */
export function applyCircuitSaves(session: WorkoutSession, saves: CircuitSave[]): WorkoutSession {
  if (saves.length === 0) return session;
  return {
    ...session,
    blocks: session.blocks.map((b) => {
      const mine = saves.filter((x) => x.blockId === b.id);
      if (mine.length === 0 || b.type !== "mobility") return b;
      const data = b.data as MobilityBlockData;
      const sets = data.sets.map((set) => {
        const patch = mine.find((x) => x.setId === set.id)?.patch;
        return patch ? { ...set, ...patch } : set;
      });
      return { ...b, data: { ...data, sets } };
    }),
  };
}

/** Ms left in a lead-in, hold or rest at `nowMs` (frozen while paused). */
export function phaseRemainingMs(run: CircuitRun, nowMs: number): number {
  const p = run.phase;
  if (p.kind !== "lead" && p.kind !== "hold" && p.kind !== "rest") return 0;
  return Math.max(0, p.endsAtMs - (run.pausedAtMs ?? nowMs));
}

/** Ms since a hold or rep goal started (frozen while paused). */
export function phaseElapsedMs(run: CircuitRun, nowMs: number): number {
  const p = run.phase;
  if (p.kind !== "hold" && p.kind !== "reps") return 0;
  return Math.max(0, (run.pausedAtMs ?? nowMs) - p.startedAtMs);
}

/**
 * Roughly how long the group takes with the countdown, from the start: one round (the
 * first) and the whole thing. Holds count at their goal, reps at 3 s each, plus every
 * get-ready, side switch and rest. Strength and cardio members aren't counted.
 */
export function estimateCircuitMs(
  session: HasBlocks,
  supersetId: string,
  defaults?: CircuitDefaults,
): { roundMs: number; totalMs: number } {
  const timing = groupTiming(session, supersetId, defaults);
  const steps = circuitSteps(session, supersetId);
  let totalMs = 0;
  let roundMs = 0;
  let prev: CircuitStep | null = null;
  for (const step of steps) {
    const gap = gapKind(prev, step);
    const before =
      gap === "switch"
        ? SWITCH_SIDES_MS
        : timing.leadInMs + (gap === "round" ? timing.roundRestMs : gap === "between" ? timing.memberRestMs : 0);
    const work = step.metric === "reps" ? step.reps * ESTIMATE_MS_PER_REP : step.goalSec * 1000;
    totalMs += before + work;
    if (step.round === 0) roundMs += before + work;
    prev = step;
  }
  return { roundMs, totalMs };
}
