import type { SetType } from "./workout";
import { createId } from "./ids";
import { nowMs } from "./time";

// A multi-week training program authored by a coach and assigned to one client. Distinct
// from WorkoutSplit: the client never edits it (it stays live-linked to the coach's copy)
// and it carries per-set targets and week-by-week periodization. The client's app pulls it
// read-only via /coach/programs/assigned and trains against it — logged sessions sync back
// through the normal session path, unchanged.

export type ProgramStartMode = "on-accept" | "fixed-date" | "manual";

export type CoachProgram = {
  id: string;
  name: string;
  description?: string;
  lengthWeeks: number;
  startMode: ProgramStartMode;
  /** Epoch ms of week 1, day 1. Set when startMode is "fixed-date", or stamped when the
   * client first starts the program under "on-accept". Undefined => not started yet. */
  startDateMs?: number;
  weeks: ProgramWeek[];
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ProgramWeek = {
  id: string;
  weekNumber: number;
  name?: string;
  days: ProgramDay[];
};

export type ProgramDay = {
  id: string;
  orderIndex: number;
  name?: string;
  /** Optional 0 (Sun)–6 (Sat) scheduling hint. */
  weekday?: number;
  blocks: ProgramBlock[];
};

export type ProgramBlock = ProgramStrength | ProgramCardio;

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
};

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
};

// ── Program ───────────────────────────────────────────────────────────────────

export function createCoachProgram(name: string = "New Program"): CoachProgram {
  const now = nowMs();
  return {
    id: createId("cprog"),
    name: name.trim() || "New Program",
    lengthWeeks: 1,
    startMode: "on-accept",
    weeks: [createWeek(1)],
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function touchCoachProgram(program: CoachProgram): CoachProgram {
  return { ...program, updatedAtMs: nowMs() };
}

export function renameCoachProgram(program: CoachProgram, name: string): CoachProgram {
  return touchCoachProgram({ ...program, name: name.trim() || "New Program" });
}

export function archiveCoachProgram(program: CoachProgram, archived = true): CoachProgram {
  return touchCoachProgram({ ...program, archived });
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

/** Which week the client is currently in (1-indexed), given when the program started.
 * Returns null if the program hasn't started or has already finished. */
export function resolveCurrentWeekNumber(
  program: CoachProgram,
  atMs: number = nowMs(),
): number | null {
  if (program.startDateMs == null) return null;
  const elapsedMs = atMs - program.startDateMs;
  if (elapsedMs < 0) return null;
  const weekIndex = Math.floor(elapsedMs / WEEK_MS);
  if (weekIndex >= program.weeks.length) return null;
  return weekIndex + 1;
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
