import type { MobilityMetric, SetType } from "./workout";
import type { BlockValue } from "./blockPlugin";
import { createId } from "./ids";
import { nowMs } from "./time";

// A multi-week training program authored by a coach and assigned to one client. Distinct
// from WorkoutSplit: the client never edits it (it stays live-linked to the coach's copy)
// and it carries per-set targets and week-by-week periodization. The client's app pulls it
// read-only via /coach/programs/assigned and trains against it — logged sessions sync back
// through the normal session path, unchanged.

/** How a program's "week 1, day 1" is decided: on a date the coach picks, or when the
 * client taps Start. Programs saved before 2026-11 may still say "on-accept"; nothing ever
 * set a date for those, so they're read as "manual" (see getProgramStartMs). */
export type ProgramStartMode = "fixed-date" | "manual";

export type CoachProgram = {
  /** 2 for programs with rules and the newer blocks (program data v2); missing = 1. v2 only
   * adds fields: every v1 field keeps its meaning, so apps that read v1 keep working. */
  schemaVersion?: number;
  /** v2: how the numbers move week to week, for every exercise without its own rule.
   * Missing (v1) = fixed: the numbers are as the coach typed them. */
  rule?: ProgramRule;
  id: string;
  name: string;
  description?: string;
  lengthWeeks: number;
  startMode: ProgramStartMode;
  /** Epoch ms of week 1, day 1, picked by the coach. Only read when startMode is
   * "fixed-date". */
  startDateMs?: number;
  /** When the client tapped Start (start of their day, epoch ms). Only ever set on the
   * client's own copy, from the server's StartedAtMs column; the coach never authors it.
   * Only read when startMode is "manual". */
  clientStartedAtMs?: number;
  /** On a client's copy: the library program it was assigned from. Lets the coach push a
   * library edit to the copies (see updateCopyFromTemplate). */
  sourceProgramId?: string;
  /** On a client's copy: the coach it came from, so the phone applies that coach's swap
   * rule. Set by the client's app from the assigned-programs pull, never by the coach. */
  coachId?: string;
  weeks: ProgramWeek[];
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ProgramWeek = {
  id: string;
  weekNumber: number;
  name?: string;
  /** v2: a lighter (deload) week: fewer sets, same weight (canvas PG2). */
  lighter?: boolean;
  days: ProgramDay[];
};

export type ProgramDay = {
  id: string;
  orderIndex: number;
  name?: string;
  /** Optional 0 (Sun)–6 (Sat) scheduling hint. */
  weekday?: number;
  /** v2: when the session usually starts, "HH:mm" (canvas Q5: "before/after training" meals
   * follow it). The client can set their own on the phone. */
  sessionTime?: string;
  blocks: ProgramBlock[];
};

/**
 * v2: a progression rule (canvas PG4). Built in: LogIt Adaptive (weight from the client's
 * strength estimate, aiming for `repsInReserve` reps left), Linear (fill the rep range, then
 * add a step), a 4-week wave, or fixed (nothing moves). Or the coach's own rule, or one from a
 * plugin, which the client allows first (PG8).
 */
export type ProgramRule =
  | { kind: "fixed" }
  | { kind: "adaptive"; repsInReserve?: number }
  | { kind: "linear"; stepKg?: number }
  | { kind: "wave" }
  | { kind: "own"; ruleId: string; name: string }
  | { kind: "plugin"; pluginId: string; name: string };

export type ProgramBlock = ProgramStrength | ProgramCardio | ProgramCircuit | ProgramMobility | ProgramPluginBlock;

/** Fields every v2 block can carry. */
type V2Block = {
  id: string;
  orderIndex: number;
  /** As on strength blocks; a circuit is a group of its own and leaves it unset. */
  supersetGroup?: string;
  /** The lowest app version that can run this block ("1.1.0"). Older apps show "Update
   * LogIt to see this part" instead, and the rest of the day still works. */
  minAppVersion?: string;
  note?: string;
};

/** v2: a circuit (canvas Q4): rounds of exercises with rest between them and between rounds.
 * Runs with the phone's circuit timer. A member has reps or a time. */
export type ProgramCircuit = V2Block & {
  type: "circuit";
  rounds: number;
  memberRestSec?: number;
  roundRestSec?: number;
  members: { id: string; exerciseName: string; exerciseId?: string; reps?: number; durationSec?: number }[];
  /** How it moves up: the same every week, a round more every two weeks, or each exercise's own rule. */
  progression?: "same" | "add-round" | "each";
};

/** v2: a mobility drill; progresses like the client's own mobility drills. */
export type ProgramMobility = V2Block & {
  type: "mobility";
  drillName: string;
  drillId?: string;
  metric?: MobilityMetric;
  perSide?: boolean;
  sets?: number;
  /** Hold goal per set, seconds. */
  targetSec?: number;
  /** Or a time for the whole drill, minutes ("Shoulder CARs · 5 min"). */
  minutes?: number;
};

/** v2: a block from a plugin (canvas Q4): it runs its own screen in the workout. The values
 * are the plugin's own settings; the client allows the plugin first (PG8). */
export type ProgramPluginBlock = V2Block & {
  type: "plugin";
  pluginId: string;
  /** What the coach saw it called, for when the plugin isn't there. */
  name: string;
  values?: Record<string, BlockValue>;
};

export type ProgramStrength = {
  type: "strength";
  id: string;
  orderIndex: number;
  /** Blocks sharing a supersetGroup are performed as a superset. */
  supersetGroup?: string;
  exerciseName: string;
  exerciseId?: string;
  note?: string;
  sets: ProgramSet[];
  /** Exercises the coach approves as swaps for this one. Shown first when the client taps
   * Swap, and always allowed whatever the coach's swap rule (see swaps.ts). */
  alternatives?: SwapAlternative[];
  /** v2: this exercise's own rule, over the program's. */
  rule?: ProgramRule;
};

export type SwapAlternative = { exerciseName: string; exerciseId?: string };

export type ProgramCardio = {
  type: "cardio";
  id: string;
  orderIndex: number;
  supersetGroup?: string;
  activityName: string;
  targetDurationSec?: number;
  targetDistanceM?: number;
  note?: string;
};

export type ProgramSet = {
  id: string;
  orderIndex: number;
  setType: SetType;
  /** Fixed target reps. Leave undefined and use repsMin/repsMax for a range, or set
   * setType to "amrap" for an open-ended set. */
  reps?: number;
  repsMin?: number;
  repsMax?: number;
  weight?: number;
  percent1RM?: number;
  rpe?: number;
  restSec?: number;
  /** Tempo notation, e.g. "3-1-1-0" (eccentric-pause-concentric-pause). */
  tempo?: string;
  /** v2: the coach typed this week's numbers over the rule's (canvas PG3); they stay put. */
  pinned?: boolean;
};

// ── Program ───────────────────────────────────────────────────────────────────

export function createCoachProgram(name: string = "New Program"): CoachProgram {
  const now = nowMs();
  return {
    id: createId("cprog"),
    name: name.trim() || "New Program",
    lengthWeeks: 1,
    startMode: "manual",
    weeks: [createWeek(1)],
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function touchCoachProgram(program: CoachProgram): CoachProgram {
  return { ...program, updatedAtMs: nowMs() };
}

/** Coach: choose how the program starts. A fixed date is week 1, day 1 at local midnight
 * of that day; switching to "manual" drops the date so it can't linger unused. */
export function setProgramStart(
  program: CoachProgram,
  start: { mode: "manual" } | { mode: "fixed-date"; startDateMs: number },
): CoachProgram {
  if (start.mode === "manual") {
    const { startDateMs: _dropped, ...rest } = program;
    return touchCoachProgram({ ...rest, startMode: "manual" });
  }
  return touchCoachProgram({ ...program, startMode: "fixed-date", startDateMs: startOfLocalDayMs(start.startDateMs) });
}

/** "2026-11-16" for a date input, in local time. */
export function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a date input's "YYYY-MM-DD" value, or null if it isn't one. */
export function fromDateInputValue(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function renameCoachProgram(program: CoachProgram, name: string): CoachProgram {
  return touchCoachProgram({ ...program, name: name.trim() || "New Program" });
}

export function archiveCoachProgram(program: CoachProgram, archived = true): CoachProgram {
  return touchCoachProgram({ ...program, archived });
}

// ── Library → client copies ───────────────────────────────────────────────────

/** A client's own copy of a library program, as assigning creates it: new ids, linked back
 * to the library program, starting on `start`. */
export function copyProgramForClient(
  template: CoachProgram,
  start: { mode: "manual" } | { mode: "fixed-date"; startDateMs: number },
): CoachProgram {
  const now = nowMs();
  const { startDateMs: _d, clientStartedAtMs: _c, ...rest } = template;
  const copy: CoachProgram = {
    ...rest,
    id: createId("cprog"),
    sourceProgramId: template.id,
    archived: false,
    weeks: template.weeks.map(cloneWeek),
    createdAtMs: now,
    updatedAtMs: now,
  };
  return setProgramStart(copy, start);
}

/** A copy brought up to date with its library program: same name, description and weeks;
 * the client's start (date, or when they tapped Start) and the copy's identity stay, so they
 * stay on the week they're on. */
export function updateCopyFromTemplate(copy: CoachProgram, template: CoachProgram): CoachProgram {
  return touchCoachProgram({
    ...copy,
    name: template.name,
    description: template.description,
    lengthWeeks: template.lengthWeeks,
    weeks: template.weeks.map(cloneWeek),
  });
}

/** Replaces week `toWeekId`'s days with a copy of week `fromWeekId`'s. */
export function copyWeekOver(program: CoachProgram, fromWeekId: string, toWeekId: string): CoachProgram {
  const source = program.weeks.find((w) => w.id === fromWeekId);
  if (!source || fromWeekId === toWeekId || !program.weeks.some((w) => w.id === toWeekId)) return program;
  return mapWeek(program, toWeekId, (week) => ({ ...week, days: cloneWeek(source).days }));
}

function cloneWeek(week: ProgramWeek): ProgramWeek {
  return {
    ...week,
    id: createId("pweek"),
    days: week.days.map((d) => ({ ...d, id: createId("pday"), blocks: d.blocks.map(cloneBlock) })),
  };
}

// ── Weeks ─────────────────────────────────────────────────────────────────────

function createWeek(weekNumber: number, name?: string): ProgramWeek {
  return { id: createId("pweek"), weekNumber, name: name?.trim() || undefined, days: [] };
}

export function addWeek(program: CoachProgram, name?: string): CoachProgram {
  const weekNumber = program.weeks.length + 1;
  return touchCoachProgram({
    ...program,
    lengthWeeks: weekNumber,
    weeks: [...program.weeks, createWeek(weekNumber, name)],
  });
}

/** Adds a week whose days mirror the given week's structure (targets copied verbatim, new
 * ids). The common way to build periodization — duplicate then tweak loads. */
export function duplicateWeek(program: CoachProgram, weekId: string): CoachProgram {
  const source = program.weeks.find((w) => w.id === weekId);
  if (!source) return program;

  const weekNumber = program.weeks.length + 1;
  const clone: ProgramWeek = {
    id: createId("pweek"),
    weekNumber,
    name: source.name,
    days: source.days.map((d) => ({
      ...d,
      id: createId("pday"),
      blocks: d.blocks.map(cloneBlock),
    })),
  };

  return touchCoachProgram({
    ...program,
    lengthWeeks: weekNumber,
    weeks: [...program.weeks, clone],
  });
}

export function removeWeek(program: CoachProgram, weekId: string): CoachProgram {
  const weeks = program.weeks
    .filter((w) => w.id !== weekId)
    .map((w, i) => ({ ...w, weekNumber: i + 1 }));
  if (weeks.length === program.weeks.length) return program;
  return touchCoachProgram({ ...program, weeks, lengthWeeks: Math.max(1, weeks.length) });
}

// ── Days ──────────────────────────────────────────────────────────────────────

export function addDay(program: CoachProgram, weekId: string, name?: string): CoachProgram {
  return mapWeek(program, weekId, (week) => ({
    ...week,
    days: [
      ...week.days,
      { id: createId("pday"), orderIndex: week.days.length, name: name?.trim() || undefined, blocks: [] },
    ],
  }));
}

export function removeDay(program: CoachProgram, weekId: string, dayId: string): CoachProgram {
  return mapWeek(program, weekId, (week) => ({
    ...week,
    days: week.days.filter((d) => d.id !== dayId).map((d, i) => ({ ...d, orderIndex: i })),
  }));
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export function addStrengthBlock(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  exercise: { exerciseName: string; exerciseId?: string },
): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => ({
    ...day,
    blocks: [
      ...day.blocks,
      {
        type: "strength",
        id: createId("pblock"),
        orderIndex: day.blocks.length,
        exerciseName: exercise.exerciseName.trim(),
        exerciseId: exercise.exerciseId,
        sets: [],
      },
    ],
  }));
}

export function addCardioBlock(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  activityName: string,
): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => ({
    ...day,
    blocks: [
      ...day.blocks,
      {
        type: "cardio",
        id: createId("pblock"),
        orderIndex: day.blocks.length,
        activityName: activityName.trim(),
      },
    ],
  }));
}

export function removeBlock(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  blockId: string,
): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => ({
    ...day,
    blocks: day.blocks.filter((b) => b.id !== blockId).map((b, i) => ({ ...b, orderIndex: i })),
  }));
}

// ── Sets ──────────────────────────────────────────────────────────────────────

export function addSet(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  blockId: string,
  defaults?: Partial<Omit<ProgramSet, "id" | "orderIndex">>,
): CoachProgram {
  return mapStrengthBlock(program, weekId, dayId, blockId, (block) => ({
    ...block,
    sets: [
      ...block.sets,
      {
        id: createId("pset"),
        orderIndex: block.sets.length,
        setType: defaults?.setType ?? "normal",
        ...defaults,
      },
    ],
  }));
}

export function updateSet(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  blockId: string,
  setId: string,
  patch: Partial<Omit<ProgramSet, "id" | "orderIndex">>,
): CoachProgram {
  return mapStrengthBlock(program, weekId, dayId, blockId, (block) => ({
    ...block,
    sets: block.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
  }));
}

export function removeSet(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  blockId: string,
  setId: string,
): CoachProgram {
  return mapStrengthBlock(program, weekId, dayId, blockId, (block) => ({
    ...block,
    sets: block.sets.filter((s) => s.id !== setId).map((s, i) => ({ ...s, orderIndex: i })),
  }));
}

// ── Client-side resolution ────────────────────────────────────────────────────

/** Epoch ms of week 1, day 1, or null while the program has no start yet. */
export function getProgramStartMs(program: CoachProgram): number | null {
  // Anything but "fixed-date" (including the old "on-accept") starts when the client taps Start.
  const start = program.startMode === "fixed-date" ? program.startDateMs : program.clientStartedAtMs;
  return start ?? null;
}

/**
 * Where a program is in its life:
 * - "not-started": waiting for the client to tap Start (manual), or for the coach to pick a
 *   date (fixed-date without one).
 * - "scheduled": fixed-date, and the date is still ahead.
 * - "running": in week `weekNumber` (1-indexed).
 * - "finished": past the last week.
 */
export type ProgramProgress =
  | { status: "not-started" }
  | { status: "scheduled"; startsAtMs: number }
  | { status: "running"; weekNumber: number }
  | { status: "finished" };

export function getProgramProgress(program: CoachProgram, atMs: number = nowMs()): ProgramProgress {
  const start = getProgramStartMs(program);
  if (start == null) return { status: "not-started" };
  const elapsedMs = atMs - start;
  if (elapsedMs < 0) return { status: "scheduled", startsAtMs: start };
  const weekIndex = Math.floor(elapsedMs / WEEK_MS);
  if (weekIndex >= program.weeks.length) return { status: "finished" };
  return { status: "running", weekNumber: weekIndex + 1 };
}

/** Which week the client is currently in (1-indexed), given when the program started.
 * Returns null if the program hasn't started or has already finished. */
export function resolveCurrentWeekNumber(
  program: CoachProgram,
  atMs: number = nowMs(),
): number | null {
  const progress = getProgramProgress(program, atMs);
  return progress.status === "running" ? progress.weekNumber : null;
}

/** Local midnight of the day containing `atMs`: the start a client gets when they tap Start. */
export function startOfLocalDayMs(atMs: number = nowMs()): number {
  const d = new Date(atMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function getCurrentWeek(
  program: CoachProgram,
  atMs: number = nowMs(),
): ProgramWeek | null {
  const n = resolveCurrentWeekNumber(program, atMs);
  if (n == null) return null;
  return program.weeks.find((w) => w.weekNumber === n) ?? null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ── Internal helpers ──────────────────────────────────────────────────────────

function cloneBlock(block: ProgramBlock): ProgramBlock {
  if (block.type === "strength") {
    return {
      ...block,
      id: createId("pblock"),
      sets: block.sets.map((s) => ({ ...s, id: createId("pset") })),
      ...(block.alternatives ? { alternatives: block.alternatives.map((a) => ({ ...a })) } : {}),
    };
  }
  return { ...block, id: createId("pblock") };
}

function mapWeek(
  program: CoachProgram,
  weekId: string,
  fn: (week: ProgramWeek) => ProgramWeek,
): CoachProgram {
  const idx = program.weeks.findIndex((w) => w.id === weekId);
  if (idx === -1) return program;
  const weeks = program.weeks.map((w, i) => (i === idx ? fn(w) : w));
  return touchCoachProgram({ ...program, weeks });
}

function mapDay(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  fn: (day: ProgramDay) => ProgramDay,
): CoachProgram {
  return mapWeek(program, weekId, (week) => {
    const idx = week.days.findIndex((d) => d.id === dayId);
    if (idx === -1) return week;
    return { ...week, days: week.days.map((d, i) => (i === idx ? fn(d) : d)) };
  });
}

function mapStrengthBlock(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  blockId: string,
  fn: (block: ProgramStrength) => ProgramStrength,
): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => {
    const idx = day.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return day;
    const block = day.blocks[idx];
    if (!block || block.type !== "strength") return day;
    return { ...day, blocks: day.blocks.map((b, i) => (i === idx ? fn(block) : b)) };
  });
}

// ── Day and block edits ───────────────────────────────────────────────────────

export function updateDay(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  patch: Partial<Pick<ProgramDay, "name" | "weekday">>,
): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => ({ ...day, ...patch }));
}

export function updateBlock(
  program: CoachProgram,
  weekId: string,
  dayId: string,
  blockId: string,
  patch: { note?: string; exerciseName?: string; activityName?: string },
): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => ({
    ...day,
    blocks: day.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as ProgramBlock) : b)),
  }));
}

// ── Approved swaps ────────────────────────────────────────────────────────────

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function isSameExercise(block: ProgramStrength, ref: { exerciseName: string; exerciseId?: string }): boolean {
  if (block.exerciseId && ref.exerciseId) return block.exerciseId === ref.exerciseId;
  return sameName(block.exerciseName, ref.exerciseName);
}

/** Every strength block in the program for the same exercise as `ref` gets `fn` applied.
 * Approved swaps belong to the exercise, not one week's copy of it: "Leg press instead of
 * Squat" is meant for the whole program. */
function mapExercise(
  program: CoachProgram,
  ref: { exerciseName: string; exerciseId?: string },
  fn: (alts: SwapAlternative[]) => SwapAlternative[],
): CoachProgram {
  let changed = false;
  const weeks = program.weeks.map((w) => ({
    ...w,
    days: w.days.map((d) => ({
      ...d,
      blocks: d.blocks.map((b) => {
        if (b.type !== "strength" || !isSameExercise(b, ref)) return b;
        const next = fn(b.alternatives ?? []);
        changed = true;
        const { alternatives: _old, ...rest } = b;
        return next.length ? { ...rest, alternatives: next } : rest;
      }),
    })),
  }));
  return changed ? touchCoachProgram({ ...program, weeks }) : program;
}

/** Approve `alt` as a swap for `exercise`, everywhere it's in the program. The exercise
 * itself and names already on the list are ignored. */
export function addAlternative(
  program: CoachProgram,
  exercise: { exerciseName: string; exerciseId?: string },
  alt: SwapAlternative,
): CoachProgram {
  const name = alt.exerciseName.trim();
  if (!name || sameName(name, exercise.exerciseName)) return program;
  const clean: SwapAlternative = { exerciseName: name, ...(alt.exerciseId ? { exerciseId: alt.exerciseId } : {}) };
  return mapExercise(program, exercise, (alts) =>
    alts.some((a) => sameName(a.exerciseName, name)) ? alts : [...alts, clean]);
}

export function removeAlternative(
  program: CoachProgram,
  exercise: { exerciseName: string; exerciseId?: string },
  altName: string,
): CoachProgram {
  return mapExercise(program, exercise, (alts) => alts.filter((a) => !sameName(a.exerciseName, altName)));
}

/** Puts a block in a superset with the one before it (joining that one's group, or starting
 * a new group for the two). */
export function supersetWithPrevious(program: CoachProgram, weekId: string, dayId: string, blockId: string): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => {
    const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const i = ordered.findIndex((b) => b.id === blockId);
    if (i < 1) return day;
    const group = ordered[i - 1].supersetGroup ?? createId("ss");
    const ids = new Set([ordered[i - 1].id, blockId]);
    return { ...day, blocks: day.blocks.map((b) => (ids.has(b.id) ? { ...b, supersetGroup: group } : b)) };
  });
}

/** Takes a block out of its superset; a group left with one block stops being a superset. */
export function leaveSuperset(program: CoachProgram, weekId: string, dayId: string, blockId: string): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => {
    const group = day.blocks.find((b) => b.id === blockId)?.supersetGroup;
    if (!group) return day;
    let blocks = day.blocks.map((b) => (b.id === blockId ? { ...b, supersetGroup: undefined } : b));
    if (blocks.filter((b) => b.supersetGroup === group).length < 2) {
      blocks = blocks.map((b) => (b.supersetGroup === group ? { ...b, supersetGroup: undefined } : b));
    }
    return { ...day, blocks };
  });
}

export function moveBlock(program: CoachProgram, weekId: string, dayId: string, blockId: string, by: -1 | 1): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => {
    const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const i = ordered.findIndex((b) => b.id === blockId);
    const j = i + by;
    if (i < 0 || j < 0 || j >= ordered.length) return day;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    return { ...day, blocks: ordered.map((b, k) => ({ ...b, orderIndex: k })) };
  });
}

/** "A1", "A2", "B1"… for blocks in supersets, by day order; blocks on their own get none. */
export function supersetLabels(day: ProgramDay): Map<string, string> {
  const out = new Map<string, string>();
  const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  const letterOf = new Map<string, string>();
  const count = new Map<string, number>();
  for (const b of ordered) {
    const g = b.supersetGroup;
    if (!g || ordered.filter((x) => x.supersetGroup === g).length < 2) continue;
    if (!letterOf.has(g)) letterOf.set(g, String.fromCharCode(65 + letterOf.size));
    const n = (count.get(g) ?? 0) + 1;
    count.set(g, n);
    out.set(b.id, `${letterOf.get(g)}${n}`);
  }
  return out;
}

// ── Set targets as text (the web editor's fields) ─────────────────────────────

type RepsFields = Pick<ProgramSet, "reps" | "repsMin" | "repsMax" | "setType">;

/** "8" → 8 reps, "8-10" or "8–10" → a range, "AMRAP" → an AMRAP set, "" → none. Null when
 * it isn't any of those. Keeps a non-AMRAP set type the set already had. */
export function parseRepsText(text: string, current: SetType = "normal"): RepsFields | null {
  const t = text.trim().toLowerCase();
  const keep: SetType = current === "amrap" ? "normal" : current;
  if (t === "") return { reps: undefined, repsMin: undefined, repsMax: undefined, setType: keep };
  if (t === "amrap" || t === "max") return { reps: undefined, repsMin: undefined, repsMax: undefined, setType: "amrap" };
  const range = /^(\d{1,3})\s*[-–—to]+\s*(\d{1,3})$/.exec(t);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a === b) return { reps: a, repsMin: undefined, repsMax: undefined, setType: keep };
    return { reps: undefined, repsMin: Math.min(a, b), repsMax: Math.max(a, b), setType: keep };
  }
  if (/^\d{1,3}$/.test(t)) return { reps: Number(t), repsMin: undefined, repsMax: undefined, setType: keep };
  return null;
}

export function repsText(set: ProgramSet): string {
  if (set.setType === "amrap") return "AMRAP";
  if (set.repsMin != null && set.repsMax != null) return `${set.repsMin}–${set.repsMax}`;
  return set.reps != null ? String(set.reps) : "";
}

/** "60" → 60 kg, "72%" → 72% of their best, "" → no load. Null when unreadable. */
export function parseLoadText(text: string): Pick<ProgramSet, "weight" | "percent1RM"> | null {
  const t = text.trim().replace(",", ".").replace(/\s*kg$/i, "");
  if (t === "") return { weight: undefined, percent1RM: undefined };
  const pct = /^(\d{1,3}(?:\.\d+)?)\s*%$/.exec(t);
  if (pct) {
    const n = Number(pct[1]);
    return n > 0 && n <= 150 ? { weight: undefined, percent1RM: n } : null;
  }
  if (/^\d{1,4}(?:\.\d+)?$/.test(t)) return { weight: Number(t), percent1RM: undefined };
  return null;
}

export function loadText(set: ProgramSet): string {
  if (set.percent1RM != null) return `${set.percent1RM}%`;
  return set.weight != null ? String(set.weight) : "";
}

/** "2:30" → 150 s, "90" or "90s" → 90 s, "2m" → 120 s, "" → none. Null when unreadable. */
export function parseRestText(text: string): number | undefined | null {
  const t = text.trim().toLowerCase();
  if (t === "") return undefined;
  const ms = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
  const s = /^(\d{1,4})\s*s?$/.exec(t);
  if (s) return Number(s[1]);
  const m = /^(\d{1,2}(?:\.\d+)?)\s*m(?:in)?$/.exec(t);
  if (m) return Math.round(Number(m[1]) * 60);
  return null;
}

export function restText(sec: number | undefined): string {
  if (sec == null) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}


// ── Program data v2 ─────────────────────────────────────────────────────────────

export const PROGRAM_SCHEMA_VERSION = 2;

/** The phone release that first runs circuits, mobility and plugin blocks in coach programs. */
export const V2_BLOCKS_APP_VERSION = "1.1.0";

/** The newest blocks an app built from this code runs: apps pass it as their appVersion, so
 * what they can run doesn't depend on what the store release happens to be numbered. Bump it
 * (and V2_BLOCKS_APP_VERSION's successors) with each new block type. */
export const PROGRAM_BLOCKS_THIS_APP_RUNS = V2_BLOCKS_APP_VERSION;

const KNOWN_BLOCKS = new Set(["strength", "cardio", "circuit", "mobility", "plugin"]);

/** v1 → v2, losing nothing: v2 only adds fields. A v1 program's numbers were all typed by the
 * coach, so its rule is "fixed". Programs from before 2026-11 that say "on-accept" start when
 * the client taps Start (see getProgramStartMs). Newer programs come back unchanged. */
export function upgradeProgram(program: CoachProgram): CoachProgram {
  if ((program.schemaVersion ?? 1) >= PROGRAM_SCHEMA_VERSION) return program;
  const startMode: ProgramStartMode = program.startMode === "fixed-date" ? "fixed-date" : "manual";
  return {
    ...program,
    schemaVersion: PROGRAM_SCHEMA_VERSION,
    rule: program.rule ?? { kind: "fixed" },
    startMode,
    weeks: program.weeks.map((w) => ({
      ...w,
      days: w.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => (KNOWN_BLOCKS.has(b.type) ? withMinVersion(b) : b)),
      })),
    })),
  };
}

/** A program from storage or the server, in the newest shape. */
export function parseProgram(json: string): CoachProgram {
  return upgradeProgram(JSON.parse(json) as CoachProgram);
}

/** The newer blocks say which app first runs them. */
function withMinVersion(b: ProgramBlock): ProgramBlock {
  if (b.type === "strength" || b.type === "cardio" || b.minAppVersion) return b;
  return { ...b, minAppVersion: V2_BLOCKS_APP_VERSION };
}

/** The rule an exercise follows: its own, else the program's, else fixed. */
export function ruleFor(program: Pick<CoachProgram, "rule">, block: ProgramBlock): ProgramRule {
  return (block.type === "strength" ? block.rule : undefined) ?? program.rule ?? { kind: "fixed" };
}

/** "1.0.3" < "1.1.0". Anything that isn't a version ("web", "dev") counts as new enough. */
export function appVersionAtLeast(appVersion: string | null | undefined, min: string): boolean {
  const parse = (v: string) => v.trim().split(/[.\s(]/).slice(0, 3).map((x) => Number.parseInt(x, 10));
  if (!appVersion) return true;
  const a = parse(appVersion);
  if (a.some((n) => Number.isNaN(n))) return true;
  const b = parse(min);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/** Whether this app can run a block: a type it knows, at a version it has. */
export function canRunBlock(block: { type: string; minAppVersion?: string }, appVersion?: string | null): boolean {
  if (!KNOWN_BLOCKS.has(block.type)) return false;
  return !("minAppVersion" in block && block.minAppVersion) || appVersionAtLeast(appVersion, block.minAppVersion);
}

/** One line for a block in a day's list (any type; unknown ones ask for an update). */
export function blockLine(block: ProgramBlock | { type: string; id: string }): string {
  const b = block as ProgramBlock;
  switch (b.type) {
    case "strength": return b.exerciseName;
    case "cardio": return b.activityName;
    case "circuit": return `Circuit · ${b.rounds} ${b.rounds === 1 ? "round" : "rounds"} · ${b.members.map((m) => m.exerciseName).join(", ")}`;
    case "mobility": return b.minutes ? `${b.drillName} · ${b.minutes} min` : b.drillName;
    case "plugin": return b.name;
    default: return UPDATE_LINE;
  }
}

export const UPDATE_LINE = "Update LogIt to see this part";
