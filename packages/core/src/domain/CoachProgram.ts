import { stretchesOf, stretchTitle } from "./stretches";
import { weekTypeOf, weekTypeLabel } from "./weekTypes";
import { copyData } from "./copyData";
import type { MobilityMetric, SetType } from "./workout";
import type { BlockValue } from "./blockPlugin";
import type { SharedRecipe } from "./progressionRecipe";
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
  /** Phase 6.9: week ranges with their own progression ("find your weights, then Adaptive").
   * Weeks no phase covers use the program's rule. */
  phases?: ProgramPhase[];
  /** On a client's copy: the weights a phase found, as the coach checked them (canvas SP4). */
  handoffs?: PhaseHandoff[];
  /** Phase 6.12/6.13: the coach's own how-tos for exercises in it (theirs win over LogIt's), and
   * who sees how-tos: new lifters (the default), always or never (canvas HT3). */
  howtos?: import("./howTo").CoachHowTo[];
  howtoShow?: "new" | "always" | "never";
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
  /** On a client's copy: the library program as it was when the copy was made or last
   * updated (canvas Q6), so an update takes the coach's library changes and keeps the
   * changes made for this client. Copies made before this don't have it. */
  libraryBase?: LibraryBase;
  /** On a client's copy: the coach it came from, so the phone applies that coach's swap
   * rule. Set by the client's app from the assigned-programs pull, never by the coach. */
  coachId?: string;
  /** Copied from LogIt's programs or a community pack (canvas PG1 "From LogIt: …"). The
   * original never changes, so a pack update can't change a client's program. */
  origin?: { kind: "logit" | "community"; id: string; name: string; author?: string };
  /** On a client's copy: lasting swaps the coach put back (canvas Q8). A client's swap of
   * `from` made before `atMs` no longer applies. */
  revertedSwaps?: { from: string; to: string; atMs: number }[];

  weeks: ProgramWeek[];
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ProgramWeek = {
  id: string;
  weekNumber: number;
  name?: string;
  /** v2: a lighter (deload) week: fewer sets, same weight (canvas PG2). Read as a Deload week type. */
  lighter?: boolean;
  /** Its type (Phase 6.4): Deload, Test, the coach's own… Absent = normal. */
  type?: import("./weekTypes").WeekType;
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
  /** Phase 6.6: settings of the day's supersets, by supersetGroup id. Without one, a group is
   * a superset (any size: a tri-set stays a superset) with no timer between exercises. */
  groups?: ProgramGroup[];
};

/** A superset, tri-set, giant set or circuit made of the blocks sharing its id (canvas PB2). */
export type ProgramGroup = {
  id: string;
  /** The coach's name; else "Superset" / "Tri-set" / "Giant set" / "Circuit". */
  name?: string;
  kind?: "superset" | "circuit";
  /** Rest between one exercise and the next, and after each round. */
  memberRestSec?: number;
  roundRestSec?: number;
  /** Builder round 2: how it moves up, like the old circuit blocks. Rounds are each member's
   * number of sets (canvas PB15/PB16). */
  progression?: "same" | "add-round" | "each";
};

/** What the group dialog edits (the old circuit dialog, for supersets too). */
export type GroupDraft = {
  kind: "superset" | "circuit";
  name?: string;
  rounds: number;
  memberRestSec?: number;
  roundRestSec?: number;
  progression: "same" | "add-round" | "each";
  /** In order. A member with a block id is changed; one without is added; members missing from
   * the list leave the group and stand alone. */
  members: { blockId?: string; exerciseName: string; exerciseId?: string; reps?: number; durationSec?: number }[];
};

/** The block a phase runs each lift with. Find your weights made before 6.10 named none: it
 * means LogIt's Weight finder, so it gets that rather than the plain lifts. */
export function phaseBlock(phase: Pick<ProgramPhase, "blockPluginId" | "findsWeights" | "pack" | "findsMax">): string | undefined {
  if (phase.blockPluginId) return phase.blockPluginId;
  if (phase.findsMax) return MAX_FINDER_ID;
  return phase.findsWeights && (!phase.pack || phase.pack.id === FIND_YOUR_WEIGHTS_PACK.id) ? WEIGHT_FINDER_ID : undefined;
}

/** A phase (canvas SP5): weeks with their own progression. One that finds weights hands its
 * numbers to the next; the coach checks them on Today (SP4). */
export type ProgramPhase = {
  id: string;
  name: string;
  weeks: WeekRange;
  rule?: ProgramRule;
  /** It works up to the weights that fit; the next phase plans from what it found. */
  findsWeights?: boolean;
  /** Phase 6.10: a block plugin that runs each lift in these weeks (its exercise field set to
   * the lift), like LogIt's Weight finder. Without it on the phone, the lift runs as usual. */
  blockPluginId?: string;
  /** The pack it came from (canvas SP8), for "From the Find your weights pack". */
  pack?: { id: string; name: string };
  /** Canvas PX4: a max test: heavy singles on `lifts`; the coach sees start against new max. */
  findsMax?: boolean;
  /** The exercises its block runs on (absent = every weighted lift); the rest run as usual. */
  lifts?: string[];
};

/** LogIt's own Find your weights: the Weight finder block, one week (canvas SP6). */
export const WEIGHT_FINDER_ID = "app.getlogit.weight-finder";
export const FIND_YOUR_WEIGHTS_PACK = { id: "app.getlogit.find-your-weights", name: "Find your weights" };
/** LogIt's own max test (canvas PX4): heavy singles until there's nothing left. */
export const MAX_FINDER_ID = "app.getlogit.max-finder";
export const FIND_YOUR_MAX_PACK = { id: "app.getlogit.find-your-max", name: "Find your max" };

/** What a weight-finding phase found, as the coach checked it. `e1rm` holds only the lifts the
 * coach changed; the rest come from the client's own sets as usual. */
export type PhaseHandoff = { phaseId: string; checkedAtMs: number; e1rm?: Record<string, number> };

/** Weeks from..to, both included (canvas PB7). */
export type WeekRange = { from: number; to: number };

/** What an exercise measures (canvas PB3), the kinds the workout logs. Absent = weight × reps. */
export type ExerciseMeasure = "weight" | "reps" | "added" | "time" | "distance";

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
  /** The coach's own rule (built in Programs › Rules): its blocks travel with the program so
   * the client's phone can run it. */
  | { kind: "own"; ruleId: string; name: string; recipe?: SharedRecipe }
  /** decidesSets: the plugin plans how many sets too (builder round 2): the builder hides Sets. */
  | { kind: "plugin"; pluginId: string; name: string; decidesSets?: boolean };

export type ProgramBlock = ProgramStrength | ProgramCardio | ProgramCircuit | ProgramMobility | ProgramPluginBlock;

/** Fields every v2 block can carry. */
type V2Block = {
  id: string;
  orderIndex: number;
  /** Phase 6.7: the weeks it runs in (absent = every week). */
  weeks?: WeekRange;
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
  /** Builder round 2 (canvas PB13): its progression (a mobility progression id); absent = the
   * client's own for that drill. */
  progressionId?: string;
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
  /** How many entries it starts with ("6 rounds", "5 hangs"); 1 when unset. */
  entries?: number;
  /** The settings in words, with the plugin's labels ("6 rounds · What Rolling"), for when it isn't there. */
  settingsText?: string;
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
  /** Phase 6.7: the weeks it runs in (absent = every week). */
  weeks?: WeekRange;
  /** Phase 6.15 (canvas EQ1): what happens when the client's gym runs out (a stack's top): more
   * reps then a harder version (or slower reps, or ask the coach then), or load past it with their
   * stack pin. Absent: weight held and reps up while the coach is asked. */
  atTop?: { then: "harder"; exercise: string } | { then: "slower" } | { then: "ask" } | { then: "pin" };
  /** Builder round 2 (canvas PB12): warm-ups planned in ("on"), left out ("off"), or absent =
   * the client's own choice. */
  warmups?: "on" | "off";
  /** Phase 6.6: what it measures (absent = weight × reps), and left and right logged apart. */
  measure?: ExerciseMeasure;
  perSide?: boolean;
};

export type SwapAlternative = { exerciseName: string; exerciseId?: string };



export type ProgramCardio = {
  type: "cardio";
  id: string;
  orderIndex: number;
  supersetGroup?: string;
  activityName: string;
  /** Phase 6.7: the weeks it runs in (absent = every week). */
  weeks?: WeekRange;
  targetDurationSec?: number;
  targetDistanceM?: number;
  /** Phase 6.6: intervals, e.g. 1:00 hard, 2:00 easy, × 6. */
  intervals?: { workSec: number; easySec?: number; repeat: number };
  /** "Zone 2", "about 8/10". */
  effort?: string;
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
  /** Phase 6.6: a hold's time, or a carry's distance, when the exercise measures those. */
  durationSec?: number;
  distanceM?: number;
  /** v2: the coach typed this week's numbers over the rule's (canvas PG3); they stay put. */
  pinned?: boolean;
};

// ── Program ───────────────────────────────────────────────────────────────────

export function createCoachProgram(name: string = "New Program"): CoachProgram {
  const now = nowMs();
  return {
    schemaVersion: 2,
    rule: { kind: "fixed" },
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

/** What a copy remembers of its library program (canvas Q6). */
export type LibraryBase = Pick<CoachProgram, "name" | "description" | "lengthWeeks" | "rule" | "weeks" | "updatedAtMs">;

export function libraryBaseOf(template: CoachProgram): LibraryBase {
  return { name: template.name, description: template.description, lengthWeeks: template.lengthWeeks, rule: template.rule, weeks: template.weeks, updatedAtMs: template.updatedAtMs };
}

/** A client's own copy of a library program, as assigning creates it: linked back to the
 * library program, starting on `start`. Weeks, days and blocks keep the library's ids, so a
 * later library change can be merged in without losing changes made for this client. */
export function copyProgramForClient(
  template: CoachProgram,
  start: { mode: "manual" } | { mode: "fixed-date"; startDateMs: number },
): CoachProgram {
  const now = nowMs();
  const { startDateMs: _d, clientStartedAtMs: _c, libraryBase: _b, sourceProgramId: _s, coachId: _k, ...rest } = template;
  const copy: CoachProgram = {
    ...rest,
    id: createId("cprog"),
    sourceProgramId: template.id,
    libraryBase: libraryBaseOf(template),
    archived: false,
    weeks: copyData(template.weeks),
    createdAtMs: now,
    updatedAtMs: now,
  };
  return setProgramStart(copy, start);
}

/** A program of your own made from another (Duplicate, start from one): new ids, no link. */
export function duplicateProgram(source: CoachProgram, name = source.name): CoachProgram {
  const now = nowMs();
  const { startDateMs: _d, clientStartedAtMs: _c, libraryBase: _b, sourceProgramId: _s, coachId: _k, ...rest } = source;
  return { ...rest, name, startMode: "manual", id: createId("cprog"), archived: false, weeks: source.weeks.map(cloneWeek), createdAtMs: now, updatedAtMs: now };
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
    schemaVersion: template.schemaVersion,
    rule: template.rule,
    // The library's ids, so later updates can merge (canvas Q6).
    weeks: copyData(template.weeks),
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

// ── Exercises in some weeks (Phase 6.7, canvas PB7) ───────────────────────────

/** Whether a block runs in week n. */
export function inWeek(b: { weeks?: WeekRange }, n: number): boolean {
  return !b.weeks || (n >= b.weeks.from && n <= b.weeks.to);
}

/** The day as it is in week n: only the blocks that run that week. */
export function dayForWeek<D extends ProgramDay>(day: D, n: number): D {
  return day.blocks.every((b) => inWeek(b, n)) ? day : { ...day, blocks: day.blocks.filter((b) => inWeek(b, n)) };
}

/** "Weeks 1–4", "Week 5". */
export function weekRangeText(r: WeekRange): string {
  return r.from === r.to ? `Week ${r.from}` : `Weeks ${r.from}–${r.to}`;
}

/** Sets the weeks a block runs in; null = every week. */
export function setBlockWeeks(program: CoachProgram, weekId: string, dayId: string, blockId: string, weeks: WeekRange | null): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => ({
    ...day,
    blocks: day.blocks.map((b) => {
      if (b.id !== blockId) return b;
      const { weeks: _w, ...rest } = b;
      return (weeks ? { ...rest, weeks } : rest) as ProgramBlock;
    }),
  }));
}

/** The weeks a block runs in, as a range (every week = 1 to the last). */
const spanOf = (b: { weeks?: WeekRange }, total: number): WeekRange => b.weeks ?? { from: 1, to: total };
const copyBlock = (b: ProgramBlock, id: string): ProgramBlock =>
  (b.type === "strength" ? { ...b, id, sets: b.sets.map((s) => ({ ...s, id: `${s.id}_${id.slice(-4)}` })) } : { ...b, id }) as ProgramBlock;

/** Takes an exercise out of weeks r (canvas PX2). Out of the middle of its weeks it becomes two:
 * before r, and a copy after r. Out of all of them, it goes. */
export function takeOutOfWeeks(program: CoachProgram, weekId: string, dayId: string, blockId: string, r: WeekRange, newId: string): CoachProgram {
  const total = program.weeks.length;
  return mapDay(program, weekId, dayId, (day) => {
    const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const at = ordered.findIndex((b) => b.id === blockId);
    const old = ordered[at];
    if (!old) return day;
    const s = spanOf(old, total);
    if (r.to < s.from || r.from > s.to) return day;
    const parts: ProgramBlock[] = [];
    if (s.from < r.from) parts.push({ ...old, weeks: { from: s.from, to: r.from - 1 } } as ProgramBlock);
    if (s.to > r.to) parts.push({ ...(parts.length ? copyBlock(old, newId) : old), weeks: { from: r.to + 1, to: s.to } } as ProgramBlock);
    ordered.splice(at, 1, ...parts);
    return { ...day, blocks: ordered.map((b, i) => ({ ...b, orderIndex: i }) as ProgramBlock) };
  });
}

/** Swaps an exercise for another in weeks r only (canvas PX2): the new one takes its place in
 * those weeks with the same sets, rest and progression; the old one keeps the others. */
export function swapInWeeks(program: CoachProgram, weekId: string, dayId: string, blockId: string, r: WeekRange, next: { exerciseName: string; exerciseId?: string }, newId: () => string): CoachProgram {
  const total = program.weeks.length;
  const day = program.weeks.find((w) => w.id === weekId)?.days.find((d) => d.id === dayId);
  const old = day?.blocks.find((b) => b.id === blockId);
  if (!old || old.type !== "strength") return program;
  const s = spanOf(old, total);
  const inside = { from: Math.max(s.from, r.from), to: Math.min(s.to, r.to) };
  if (inside.from > inside.to) return program;
  const { alternatives: _a, ...base } = old;
  const fresh = { ...copyBlock(base as ProgramBlock, newId()), ...next, weeks: inside } as ProgramBlock;
  if (!next.exerciseId) delete (fresh as { exerciseId?: string }).exerciseId;
  const out = takeOutOfWeeks(program, weekId, dayId, blockId, inside, newId());
  // The new one goes where the old one was in those weeks: right after its earlier part.
  return mapDay(out, weekId, dayId, (d) => {
    const ordered = [...d.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const before = ordered.findIndex((b) => b.id === blockId && spanOf(b, total).to < inside.from);
    const at = before >= 0 ? before + 1 : Math.max(0, ordered.findIndex((b) => b.id === blockId));
    ordered.splice(at === -1 ? ordered.length : at, 0, fresh);
    return { ...d, blocks: ordered.map((b, i) => ({ ...b, orderIndex: i }) as ProgramBlock) };
  });
}

/** Puts an exercise into weeks r too (canvas PX1, "bring it back"): next to its weeks it grows
 * to cover them; apart from them, a copy runs in r. */
export function addToWeeks(program: CoachProgram, weekId: string, dayId: string, blockId: string, r: WeekRange, newId: string): CoachProgram {
  const total = program.weeks.length;
  return mapDay(program, weekId, dayId, (day) => {
    const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const at = ordered.findIndex((b) => b.id === blockId);
    const old = ordered[at];
    if (!old) return day;
    const s = spanOf(old, total);
    const touches = r.from <= s.to + 1 && s.from <= r.to + 1;
    const span = { from: Math.min(s.from, r.from), to: Math.max(s.to, r.to) };
    if (touches) ordered[at] = { ...old, weeks: span } as ProgramBlock;
    else ordered.splice(at + 1, 0, { ...copyBlock(old, newId), weeks: r } as ProgramBlock);
    // Parts of the same exercise that now meet (Squat 1–4 and 5–6) join into one.
    const same = (x: ProgramBlock) => JSON.stringify({ ...x, id: 0, orderIndex: 0, weeks: 0, sets: x.type === "strength" ? x.sets.map(({ id: _i, ...s }) => s) : 0 });
    const kept: ProgramBlock[] = [];
    for (const blk of ordered) {
      const s = spanOf(blk, total);
      const mate = kept.findIndex((k) => same(k) === same(blk) && spanOf(k, total).to + 1 >= s.from && s.to + 1 >= spanOf(k, total).from);
      if (mate < 0) { kept.push(blk); continue; }
      const m = spanOf(kept[mate]!, total);
      kept[mate] = { ...kept[mate]!, weeks: { from: Math.min(m.from, s.from), to: Math.max(m.to, s.to) } } as ProgramBlock;
    }
    const all = kept.map((x) => { const s = x.weeks; if (s && s.from <= 1 && s.to >= total) { const { weeks: _w, ...rest } = x; return rest as ProgramBlock; } return x; });
    return { ...day, blocks: all.map((x, i) => ({ ...x, orderIndex: i }) as ProgramBlock) };
  });
}

/** Ends an exercise before week `from` and starts another in its place, with the same sets,
 * rest and progression (canvas PB7). Returns the program and the new block's id. */
export function replaceFromWeek(program: CoachProgram, weekId: string, dayId: string, blockId: string, from: number, next: { exerciseName: string; exerciseId?: string }, newId: string): CoachProgram {
  const total = program.weeks.length;
  return mapDay(program, weekId, dayId, (day) => {
    const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const at = ordered.findIndex((b) => b.id === blockId);
    const old = ordered[at];
    if (!old || old.type !== "strength") return day;
    const start = old.weeks?.from ?? 1, end = old.weeks?.to ?? total;
    if (from <= start || from > end) return day;
    const { alternatives: _a, ...base } = old;
    const fresh: ProgramStrength = { ...base, id: newId, ...next, weeks: { from, to: end }, sets: old.sets.map((s) => ({ ...s, id: `${s.id}_${newId.slice(-4)}` })) };
    ordered.splice(at, 1, { ...old, weeks: { from: start, to: from - 1 } }, fresh);
    return { ...day, blocks: ordered.map((b, i) => ({ ...b, orderIndex: i })) };
  });
}

// ── Groups (Phase 6.6, canvas PB2) ────────────────────────────────────────────

/** "Superset" (2), "Tri-set" (3), "Giant set" (4+), "Circuit", or the coach's name. */
export function groupLabel(day: Pick<ProgramDay, "blocks" | "groups">, groupId: string): string {
  const g = day.groups?.find((x) => x.id === groupId);
  if (g?.name?.trim()) return g.name.trim();
  if (g?.kind === "circuit") return "Circuit";
  const n = day.blocks.filter((b) => b.supersetGroup === groupId).length;
  return n >= 4 ? "Giant set" : n === 3 ? "Tri-set" : "Superset";
}

/** Changes a group's settings; null fields go back to the default. */
export function setGroup(program: CoachProgram, weekId: string, dayId: string, groupId: string, patch: Partial<Omit<ProgramGroup, "id">>): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => {
    const cur = day.groups?.find((g) => g.id === groupId) ?? { id: groupId };
    const next = Object.fromEntries(Object.entries({ ...cur, ...patch }).filter(([, v]) => v != null && v !== "")) as ProgramGroup;
    return { ...day, groups: [...(day.groups ?? []).filter((g) => g.id !== groupId), next] };
  });
}

/** Puts a block into a group, right after its last member. */
export function addToGroup(program: CoachProgram, weekId: string, dayId: string, blockId: string, groupId: string): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => {
    const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const moving = ordered.find((b) => b.id === blockId);
    if (!moving) return day;
    const rest = ordered.filter((b) => b.id !== blockId);
    const at = rest.map((b) => b.supersetGroup).lastIndexOf(groupId) + 1;
    rest.splice(at > 0 ? at : rest.length, 0, { ...moving, supersetGroup: groupId });
    return { ...day, blocks: rest.map((b, i) => ({ ...b, orderIndex: i })) };
  });
}

/** Every block of the group stands alone again, and its settings go. */
export function ungroup(program: CoachProgram, weekId: string, dayId: string, groupId: string): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => ({
    ...day,
    blocks: day.blocks.map((b) => (b.supersetGroup === groupId ? ({ ...b, supersetGroup: undefined } as ProgramBlock) : b)),
    groups: day.groups?.filter((g) => g.id !== groupId),
  }));
}

/** A group's rounds: the most sets any member has. */
export function groupRounds(day: Pick<ProgramDay, "blocks">, groupId: string): number {
  return Math.max(0, ...day.blocks.filter((b) => b.supersetGroup === groupId).map((b) => (b.type === "strength" ? b.sets.filter((s) => s.setType !== "warmup").length : b.type === "mobility" ? (b.sets ?? 1) : 1)));
}

/** What a member does each round: "15 reps", "0:40", "8–12". */
export function memberAmount(b: ProgramBlock): string {
  if (b.type === "strength") {
    const s = b.sets.find((x) => x.setType !== "warmup") ?? b.sets[0];
    if (b.measure === "time" && s?.durationSec) return restText(s.durationSec);
    return s ? `${repsText(s) || "?"} reps` : "";
  }
  if (b.type === "mobility") return b.metric === "reps" ? `${b.targetSec ?? "?"} reps` : restText(b.targetSec ?? 30);
  if (b.type === "cardio") return b.targetDurationSec ? restText(b.targetDurationSec) : b.targetDistanceM ? `${b.targetDistanceM} m` : "";
  return "";
}

/** Applies the group dialog (canvas PB15): its settings, each member's amount and sets (one a
 * round), members added and taken out, in the dialog's order. Returns the program. */
export function applyGroupDraft(program: CoachProgram, weekId: string, dayId: string, groupId: string, draft: GroupDraft, newId: () => string): CoachProgram {
  const rounds = Math.max(1, Math.min(20, Math.round(draft.rounds)));
  let out = mapDay(program, weekId, dayId, (day) => {
    const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const keep = new Set(draft.members.map((m) => m.blockId).filter(Boolean) as string[]);
    const members: ProgramBlock[] = draft.members.map((m) => {
      const cur = m.blockId ? ordered.find((b) => b.id === m.blockId) : undefined;
      if (cur?.type === "strength") {
        const like = cur.sets.find((s) => s.setType !== "warmup") ?? cur.sets[0];
        const warm = cur.sets.filter((s) => s.setType === "warmup");
        const sets = Array.from({ length: rounds }, (_, i): ProgramSet => {
          const prev = cur.sets.filter((s) => s.setType !== "warmup")[i] ?? like;
          const base: ProgramSet = { ...(prev ?? { setType: "normal" }), id: prev && cur.sets.filter((s) => s.setType !== "warmup")[i] ? prev.id : newId(), orderIndex: warm.length + i, setType: prev?.setType === "warmup" ? "normal" : (prev?.setType ?? "normal") } as ProgramSet;
          if (m.durationSec != null) return { ...base, durationSec: m.durationSec, reps: undefined, repsMin: undefined, repsMax: undefined };
          if (m.reps != null) return { ...base, reps: m.reps, repsMin: undefined, repsMax: undefined };
          return base;
        });
        return { ...cur, supersetGroup: groupId, ...(m.durationSec != null ? { measure: "time" as const } : {}), sets: [...warm, ...sets] };
      }
      if (cur?.type === "mobility") return { ...cur, supersetGroup: groupId, sets: rounds, ...(m.durationSec != null ? { targetSec: m.durationSec, metric: "hold" as const } : m.reps != null ? { targetSec: m.reps, metric: "reps" as const } : {}) };
      if (cur) return { ...cur, supersetGroup: groupId } as ProgramBlock;
      // A new member: a timed one is a hold, else sets of reps.
      const id = newId();
      if (m.durationSec != null) return { type: "mobility", id, orderIndex: 0, supersetGroup: groupId, drillName: m.exerciseName, sets: rounds, targetSec: m.durationSec, metric: "hold", minAppVersion: V2_BLOCKS_APP_VERSION } as ProgramBlock;
      return { type: "strength", id, orderIndex: 0, supersetGroup: groupId, exerciseName: m.exerciseName, ...(m.exerciseId ? { exerciseId: m.exerciseId } : {}),
        sets: Array.from({ length: rounds }, (_, i) => ({ id: newId(), orderIndex: i, setType: "normal" as const, reps: m.reps ?? 10 })) } as ProgramBlock;
    });
    // The group sits where its first member was (or at the end, for a new one).
    const firstAt = ordered.findIndex((b) => b.supersetGroup === groupId || keep.has(b.id));
    const rest = ordered.filter((b) => !keep.has(b.id)).map((b) => (b.supersetGroup === groupId ? ({ ...b, supersetGroup: undefined } as ProgramBlock) : b));
    const at = firstAt < 0 ? rest.length : Math.min(firstAt, rest.length);
    rest.splice(at, 0, ...members);
    return { ...day, blocks: rest.map((b, i) => ({ ...b, orderIndex: i }) as ProgramBlock) };
  });
  out = setGroup(out, weekId, dayId, groupId, { kind: draft.kind, name: draft.name?.trim() || undefined, memberRestSec: draft.memberRestSec, roundRestSec: draft.roundRestSec, progression: draft.progression === "same" ? undefined : draft.progression });
  return out;
}

/** Puts a block before another (null = the end) and in a group or none (builder round 2: drag
 * in, out of and within groups). A group left with one exercise stops being a group. */
export function placeBlock(program: CoachProgram, weekId: string, dayId: string, blockId: string, beforeId: string | null, group: string | undefined): CoachProgram {
  return mapDay(program, weekId, dayId, (day) => {
    const ordered = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const moving = ordered.find((b) => b.id === blockId);
    if (!moving || beforeId === blockId) return day;
    const rest = ordered.filter((b) => b.id !== blockId);
    const at = beforeId ? rest.findIndex((b) => b.id === beforeId) : -1;
    rest.splice(at < 0 ? rest.length : at, 0, { ...moving, supersetGroup: group } as ProgramBlock);
    const count = new Map<string, number>();
    for (const b of rest) if (b.supersetGroup) count.set(b.supersetGroup, (count.get(b.supersetGroup) ?? 0) + 1);
    const blocks = rest.map((b, i) => ({ ...b, orderIndex: i, ...(b.supersetGroup && (count.get(b.supersetGroup) ?? 0) < 2 ? { supersetGroup: undefined } : {}) }) as ProgramBlock);
    const live = new Set(blocks.map((b) => b.supersetGroup).filter(Boolean));
    return { ...day, blocks, ...(day.groups ? { groups: day.groups.filter((g) => live.has(g.id)) } : {}) };
  });
}

/** One-sided lifts, where Each side makes sense for strength (canvas PB11). By name: the library
 * has no flag. shortcut: a name list, add a library field if coaches hit misses. */
export function isOneSided(name: string): boolean {
  return /single[- ]?(arm|leg)|one[- ](arm|leg)|unilateral|split squat|bulgarian|lunge|step[- ]?up|pistol|suitcase|kickstand|\bb-stance\b|concentration curl|kickback/i.test(name);
}

/** An old circuit block becomes a group of its members (one kind of group, canvas PB16). */
export function circuitToGroup(program: CoachProgram, weekId: string, dayId: string, blockId: string, newId: () => string): { program: CoachProgram; groupId: string } {
  const day = program.weeks.find((w) => w.id === weekId)?.days.find((d) => d.id === dayId);
  const c = day?.blocks.find((b) => b.id === blockId);
  if (!c || c.type !== "circuit") return { program, groupId: "" };
  const groupId = newId();
  // The circuit block steps aside; its members take its place.
  let p = mapDay(program, weekId, dayId, (d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === blockId ? ({ ...b, supersetGroup: groupId } as ProgramBlock) : b)) }));
  p = applyGroupDraft(p, weekId, dayId, groupId, {
    kind: "circuit", rounds: c.rounds, memberRestSec: c.memberRestSec, roundRestSec: c.roundRestSec, progression: c.progression ?? "same",
    members: c.members.map((m) => ({ exerciseName: m.exerciseName, exerciseId: m.exerciseId, ...(m.durationSec ? { durationSec: m.durationSec } : { reps: m.reps ?? 10 }) })),
  }, newId);
  p = mapDay(p, weekId, dayId, (d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== blockId).map((b, i) => ({ ...b, orderIndex: i }) as ProgramBlock) }));
  return { program: p, groupId };
}

/** "Weight × reps", "Reps", "Reps + added weight", "Time", "Distance". */
export const MEASURES: { value: ExerciseMeasure; label: string; detail: string }[] = [
  { value: "weight", label: "Weight × reps", detail: "Barbell, dumbbell, machine" },
  { value: "reps", label: "Reps", detail: "Bodyweight: push-ups, pull-ups" },
  { value: "added", label: "Reps + added weight", detail: "Weighted pull-ups, dips (belt)" },
  { value: "time", label: "Time", detail: "Holds: plank, dead hang, wall sit" },
  { value: "distance", label: "Distance", detail: "Carries, sled" },
];

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
export function ruleFor(program: Pick<CoachProgram, "rule" | "phases">, block: ProgramBlock, weekNumber?: number): ProgramRule {
  const phase = weekNumber != null ? phaseAt(program, weekNumber) : null;
  return (block.type === "strength" ? block.rule : undefined) ?? phase?.rule ?? program.rule ?? { kind: "fixed" };
}

/** The phase week n is in, if any. */
export function phaseAt(program: Pick<CoachProgram, "phases">, n: number): ProgramPhase | null {
  return program.phases?.find((p) => n >= p.weeks.from && n <= p.weeks.to) ?? null;
}

/** Adds or changes a phase. A phase that finds weights makes its weeks "Find your weights". */
export function putPhase(program: CoachProgram, phase: ProgramPhase): CoachProgram {
  const others = (program.phases ?? []).filter((p) => p.id !== phase.id);
  if (others.some((p) => p.weeks.from <= phase.weeks.to && phase.weeks.from <= p.weeks.to)) return program;
  const old = program.phases?.find((p) => p.id === phase.id);
  const inRange = (n: number, r?: WeekRange) => !!r && n >= r.from && n <= r.to;
  return {
    ...program,
    phases: [...others, phase].sort((a, b) => a.weeks.from - b.weeks.from),
    weeks: program.weeks.map((w) => {
      if (phase.findsWeights && inRange(w.weekNumber, phase.weeks)) return { ...w, type: { kind: "find", progression: "pauses" } };
      // Weeks that stopped being found by this phase go back to normal.
      if (old?.findsWeights && inRange(w.weekNumber, old.weeks) && w.type?.kind === "find") { const { type: _t, ...rest } = w; return rest; }
      return w;
    }),
  };
}

export function removePhase(program: CoachProgram, phaseId: string): CoachProgram {
  const old = program.phases?.find((p) => p.id === phaseId);
  if (!old) return program;
  return {
    ...program,
    phases: program.phases!.filter((p) => p.id !== phaseId),
    weeks: program.weeks.map((w) => {
      if (!old.findsWeights || w.weekNumber < old.weeks.from || w.weekNumber > old.weeks.to || w.type?.kind !== "find") return w;
      const { type: _t, ...rest } = w;
      return rest;
    }),
  };
}

/** "Find your weights first" when assigning (canvas SP2): a week of LogIt's Weight finder before
 * week 1, the same days, everything after moving on a week. */
export function addFindWeekFirst(program: CoachProgram): CoachProgram {
  const weeks = [...program.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const first = weeks[0];
  if (!first || program.phases?.some((p) => p.findsWeights && p.weeks.from === 1)) return program;
  // Everything moves on a week; what started in week 1 starts in the find week instead.
  const shiftBlock = (r: WeekRange): WeekRange => ({ from: r.from === 1 ? 1 : r.from + 1, to: r.to + 1 });
  const shift = (r: WeekRange): WeekRange => ({ from: r.from + 1, to: r.to + 1 });
  const moveDays = (days: ProgramDay[]) => days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.weeks ? ({ ...b, weeks: shiftBlock(b.weeks) } as ProgramBlock) : b)) }));
  const { type: _t, lighter: _l, ...plain } = first;
  const moved: CoachProgram = {
    ...program,
    weeks: [
      // Week 1's days with the same block ids, so each exercise is the same one in every week.
      { ...plain, id: createId("pweek"), weekNumber: 1, days: moveDays(first.days) },
      ...weeks.map((w) => ({ ...w, weekNumber: w.weekNumber + 1, days: moveDays(w.days) })),
    ],
    ...(program.phases ? { phases: program.phases.map((p) => ({ ...p, weeks: shift(p.weeks) })) } : {}),
  };
  return putPhase(moved, { id: createId("phase"), name: "Find your weights", weeks: { from: 1, to: 1 }, findsWeights: true, blockPluginId: WEIGHT_FINDER_ID, pack: FIND_YOUR_WEIGHTS_PACK });
}

/** A weight-finding phase in its last week, or the week after, that the coach hasn't checked:
 * "Niamh found her weights · Check them" (canvas SP4). Unchecked, its numbers apply anyway. */
/** A max test that's just finished (canvas PX4): the coach sees how far they've come. */
export function maxTestDue(program: Pick<CoachProgram, "phases" | "handoffs">, n: number): ProgramPhase | null {
  const p = (program.phases ?? []).find((x) => x.findsMax && (n === x.weeks.to || n === x.weeks.to + 1));
  return p && !program.handoffs?.some((h) => h.phaseId === p.id) ? p : null;
}

export function handoffDue(program: Pick<CoachProgram, "phases" | "handoffs">, n: number): ProgramPhase | null {
  const p = (program.phases ?? []).find((x) => x.findsWeights && (n === x.weeks.to || n === x.weeks.to + 1));
  return p && !program.handoffs?.some((h) => h.phaseId === p.id) ? p : null;
}

/** The client's estimates with the coach's checked numbers on top. */
export function withHandoffs(program: Pick<CoachProgram, "handoffs">, e1rm: (name: string) => number | null): (name: string) => number | null {
  const over = new Map<string, number>();
  for (const h of program.handoffs ?? []) for (const [k, v] of Object.entries(h.e1rm ?? {})) over.set(k.trim().toLowerCase(), v);
  return over.size ? (name) => over.get(name.trim().toLowerCase()) ?? e1rm(name) : e1rm;
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


// ── Lists and previews (canvas PG1, PG5) ───────────────────────────────────────

/** A LogIt or community program, copied into the coach's own programs: new ids, its origin
 * kept for "From LogIt: …". The original stays as it was. */
export function copyToMyPrograms(source: CoachProgram, origin: NonNullable<CoachProgram["origin"]>): CoachProgram {
  const now = nowMs();
  const { sourceProgramId: _s, startDateMs: _d, clientStartedAtMs: _c, coachId: _k, libraryBase: _b, ...rest } = upgradeProgram(source);
  return { ...rest, id: createId("cprog"), origin, archived: false, startMode: "manual", weeks: source.weeks.map(cloneWeek), createdAtMs: now, updatedAtMs: now };
}

/** "LogIt Adaptive", "Linear, +2.5 kg", "4-week wave", "Fixed", or the rule's own name. */
export function ruleLabel(rule: ProgramRule | undefined): string {
  switch (rule?.kind) {
    case "adaptive": return "LogIt Adaptive";
    case "linear": return rule.stepKg ? `Linear, +${rule.stepKg} kg` : "Linear";
    case "wave": return "4-week wave";
    case "own": case "plugin": return rule.name;
    default: return "Fixed";
  }
}

/** Most days any week has. */
export function daysPerWeek(program: Pick<CoachProgram, "weeks">): number {
  return Math.max(0, ...program.weeks.map((w) => w.days.length));
}

/** "8 weeks · 4 days a week · LogIt Adaptive · lighter weeks 4 and 8". */
export function programSummary(program: CoachProgram): string {
  const weeks = program.weeks.length;
  const days = daysPerWeek(program);
  const bits = [`${weeks} ${weeks === 1 ? "week" : "weeks"}`, `${days} ${days === 1 ? "day" : "days"} a week`, ruleLabel(program.rule)];
  // Its stretches (canvas PW2): "find your weights weeks 1–2 · hypertrophy weeks 3–7 · deload weeks 4 and 8".
  const by = new Map<string, WeekRange[]>();
  for (const s of stretchesOf(program)) {
    if (s.plain) continue;
    // An unnamed progression stretch goes by its progression: "LogIt Adaptive weeks 2–3 and 5".
    const label = s.what.kind === "progression" ? (s.name ?? ruleLabel(s.what.rule ?? program.rule)) : s.name ?? stretchTitle(s).toLowerCase();
    by.set(label, [...(by.get(label) ?? []), s]);
  }
  for (const [label, rs] of by) {
    const parts = rs.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`));
    const many = rs.length > 1 || rs[0]!.from !== rs[0]!.to;
    bits.push(`${label} ${many ? "weeks" : "week"} ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`}`);
  }
  return bits.join(" · ");
}

/** "3 × 6–8": working sets and their reps. */
export function strengthSummary(block: ProgramStrength): string {
  const work = [...block.sets].filter((s) => s.setType !== "warmup").sort((a, b) => a.orderIndex - b.orderIndex);
  if (!work.length) return "";
  const first = work[0]!;
  // A hold or a carry says its time or distance: "3 × 0:45", "3 × 40 m" (Phase 6.6).
  const side = block.perSide ? " each side" : "";
  if (block.measure === "time" && first.durationSec) return `${work.length} × ${restText(first.durationSec)}${side}`;
  if (block.measure === "distance" && first.distanceM) return `${work.length} × ${first.distanceM} m${side}`;
  const reps = first.setType === "amrap" ? "AMRAP"
    : first.reps != null ? String(first.reps)
    : first.repsMin != null ? (first.repsMax != null && first.repsMax !== first.repsMin ? `${first.repsMin}–${first.repsMax}` : String(first.repsMin))
    : "";
  return reps ? `${work.length} × ${reps}${side}` : `${work.length} ${work.length === 1 ? "set" : "sets"}`;
}

/** A day in one line: "Bench Press 3 × 6–8 · Barbell Row 3 × 8–10 · …". */
export function dayPreview(day: ProgramDay): string {
  return [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex)
    .map((b) => (b.type === "strength" ? [b.exerciseName, strengthSummary(b)].filter(Boolean).join(" ") : blockLine(b)))
    .join(" · ");
}


// ── Swaps (canvas SW1, Q8, W6) ────────────────────────────────────────────────

/** Every week: `from` becomes `to` (the coach keeping a client's swap, or swapping from a message). */
export function renameExercise(program: CoachProgram, from: string, to: { exerciseName: string; exerciseId?: string }): CoachProgram {
  const key = from.trim().toLowerCase();
  return touchCoachProgram({
    ...program,
    weeks: program.weeks.map((w) => ({
      ...w,
      days: w.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => {
          if (b.type !== "strength" || b.exerciseName.trim().toLowerCase() !== key) return b;
          const { exerciseId: _old, ...rest } = b;
          return { ...rest, exerciseName: to.exerciseName, ...(to.exerciseId ? { exerciseId: to.exerciseId } : {}) };
        }),
      })),
    })),
  });
}

/** The coach put a client's lasting swap back (canvas Q8). */
export function revertSwap(program: CoachProgram, from: string, to: string, atMs = nowMs()): CoachProgram {
  return touchCoachProgram({ ...program, revertedSwaps: [...(program.revertedSwaps ?? []).filter((r) => r.from !== from), { from, to, atMs }] });
}
