import { createId } from "./ids";
import { nowMs } from "./time";
import { effectiveLoadKg, getLoadMode, type LoadMode } from "./bodyweight";
import type { ExerciseType } from "./exercise";

export const DEFAULT_REST_MS = 90_000;

export type SetType =
  | "normal"
  | "warmup"
  | "dropset"
  | "amrap"
  | "failure"
  | "rest-pause"
  | "myo-reps";

export type SetTypeMeta = {
  type: string;
  /** Full label — pickers, settings, history. */
  label: string;
  /** Short glyph for the compact row badge. Empty for "normal" (no badge). */
  short: string;
  /** Tailwind classes for the badge pill. Written literally so JIT keeps them. */
  badgeClass: string;
  /** One-line explanation shown in the set-type picker. */
  hint: string;
  /**
   * True for sets that continue the previous working set rather than standing
   * on their own (drop sets, rest-pause, myo-reps). The UI groups these under
   * their lead set and progression ignores them as separate working sets.
   */
  continuation?: boolean;
  /** Placeholder for the reps input, e.g. "Max" for AMRAP. */
  repsPlaceholder?: string;
};

// Exported as a mutable array so plugins can push new entries at runtime.
export const SET_TYPE_META: SetTypeMeta[] = [
  {
    type: "normal",
    label: "Normal",
    short: "",
    badgeClass: "",
    hint: "A standard working set.",
  },
  {
    type: "warmup",
    label: "Warm-up",
    short: "W",
    badgeClass: "text-muted-foreground border-border",
    hint: "Preparation set — not counted as working volume.",
  },
  {
    type: "amrap",
    label: "AMRAP",
    short: "A",
    badgeClass: "text-amber-600 dark:text-amber-400 border-amber-500/40",
    hint: "As many reps as possible — take it to technical failure.",
    repsPlaceholder: "Max",
  },
  {
    type: "failure",
    label: "To failure",
    short: "F",
    badgeClass: "text-rose-600 dark:text-rose-400 border-rose-500/40",
    hint: "Go until you cannot complete another rep.",
    repsPlaceholder: "Fail",
  },
  {
    type: "dropset",
    label: "Drop set",
    short: "D",
    badgeClass: "text-violet-600 dark:text-violet-400 border-violet-500/40",
    hint: "Immediately reduce the weight and keep repping.",
    continuation: true,
  },
  {
    type: "rest-pause",
    label: "Rest-pause",
    short: "RP",
    badgeClass: "text-sky-600 dark:text-sky-400 border-sky-500/40",
    hint: "Rest 10–20s, then squeeze out more reps at the same weight.",
    continuation: true,
    repsPlaceholder: "+reps",
  },
  {
    type: "myo-reps",
    label: "Myo-reps",
    short: "M",
    badgeClass: "text-teal-600 dark:text-teal-400 border-teal-500/40",
    hint: "Short rest, then mini-sets of a few reps to failure.",
    continuation: true,
    repsPlaceholder: "+reps",
  },
];

export function setTypeMeta(type: string): SetTypeMeta {
  return SET_TYPE_META.find((m) => m.type === type) ?? SET_TYPE_META[0]!;
}

/** True for sets that continue the previous working set (drop / rest-pause / myo). */
export function isContinuationSet(type: string): boolean {
  return setTypeMeta(type).continuation ?? false;
}

export type SetEntry = {
  id: string;
  setType: SetType;
  reps: number;
  weight: number;
  note?: string | null;
  orderIndex: number;
  completed?: boolean;
  restDurationMs?: number;
  restStartedAtMs?: number | null;
  machineId?: string | null;
  /** Rate of perceived exertion, 6–10 (RPE) or left unset. */
  rpe?: number | null;
  /**
   * What the progression plan asked for on this set. A planned set starts with
   * reps 0 and is logged by ticking it (reps/weight copied from here) or by
   * entering what was actually done. `repsMax` is set when the plan is a range.
   */
  target?: SetTarget | null;
};

export type SetTarget = { reps: number; repsMax?: number; weight: number };

/** A planned set nobody has done yet: still at 0 reps and not ticked. */
export function isUnloggedPlannedSet(s: SetEntry): boolean {
  return !!s.target && !s.completed && s.reps === 0;
}

/**
 * Marks a block as part of a superset / circuit. Blocks sharing an `id` are
 * performed together, one set from each per round. Stored inside block `data`
 * (not on the block) so it round-trips through the JSON `session_blocks.data`
 * column with no schema change.
 */
/** What a group is called: a superset needs two or more exercises, a circuit one or more. */
export type GroupKind = "superset" | "circuit";

export type SupersetInfo = {
  id: string;
  label?: string;
  /** Chosen by the user. Undefined = by count: two is a superset, three or more a circuit. */
  kind?: GroupKind;
  /**
   * Rest after each round, ms. 0 = none. Undefined: none in the countdown; when sets are
   * ticked by hand, the last exercise's own rest timer.
   */
  roundRestMs?: number;
  /**
   * Rest between one exercise and the next within a round, ms. 0 = none. Undefined: the
   * app default for circuits (Settings), none for supersets.
   */
  memberRestMs?: number;
  /** The countdown's get-ready before each exercise, ms. Undefined: the app default. */
  leadInMs?: number;
};

/** The group settings the edit sheet changes; `null` clears one back to its default. */
export type GroupSettingsPatch = {
  label?: string | null;
  roundRestMs?: number | null;
  memberRestMs?: number | null;
  leadInMs?: number | null;
};

// Data payload for a strength (exercise + sets) block
export type StrengthBlockData = {
  exerciseName: string;
  exerciseId?: string;
  sets: SetEntry[];
  superset?: SupersetInfo;
};

export type CardioInterval = {
  id: string;
  orderIndex: number;
  durationMs: number | null;
  distanceM: number | null;
  note: string | null;
};

export type CardioBlockData = {
  activityName: string;
  intervals: CardioInterval[];
  superset?: SupersetInfo;
};

// ── Mobility / stretching ────────────────────────────────────────────────────

/** How a mobility drill is measured: a timed hold, or counted reps. */
export type MobilityMetric = "hold" | "reps";
export type MobilitySide = "left" | "right";

/**
 * One logged effort of a mobility drill. `side` is set only when the parent
 * block is `perSide` — unilateral drills store left and right as separate
 * entries (a flat list, like `SetEntry[]`), paired for display by order.
 */
export type MobilitySet = {
  id: string;
  orderIndex: number;
  side?: MobilitySide;
  /** metric === "hold" — seconds held. */
  durationSec?: number;
  /** metric === "reps" — reps completed. */
  reps?: number;
  /** Optional added load, stored kg (the UI converts, like SetEntry.weight). */
  loadKg?: number;
  /** Optional hold goal for this set, prefilled from the progression suggestion. */
  targetSec?: number | null;
  /** Optional 1–5 "how deep did it feel" — the stretch analog of RPE. */
  depth?: number | null;
  completed?: boolean;
  note?: string | null;
  /** Per-set rest override (ms). Falls back to the block's `restBetweenSetsMs`. */
  restDurationMs?: number;
  /** Set when a rest timer is running after this set — mirrors `SetEntry`. */
  restStartedAtMs?: number | null;
  /**
   * Per-set override of which side leads (perSide only). Falls back to the
   * block's `leadSide`, then "left". Only affects display / interaction order.
   */
  leadSide?: MobilitySide;
};

export type MobilityBlockData = {
  drillName: string;
  /** Catalog reference; undefined for a free-text drill. */
  drillId?: string;
  metric: MobilityMetric;
  perSide: boolean;
  sets: MobilitySet[];
  superset?: SupersetInfo;
  note?: string | null;
  /**
   * Rest to run after each completed set / side, in ms. Undefined = no rest
   * (the default for mobility work). Set from the drill's edit sheet.
   */
  restBetweenSetsMs?: number;
  /** Which side leads by default when `perSide` (seeded from the user setting). */
  leadSide?: MobilitySide;
  /**
   * Sides parked when `perSide` is toggled off, so their data can be restored
   * on toggling back on. Keyed by set number (1-based). Never rendered.
   */
  stashedSides?: { setNumber: number; set: MobilitySet }[];
};

// Generic session block — data is typed per block type
export type SessionBlock<T = unknown> = {
  id: string;
  type: string;
  orderIndex: number;
  data: T;
};

// Flat view of a strength block — used by progression, history views, etc.
export type ExerciseEntry = {
  id: string;
  exerciseId?: string;
  exerciseName: string;
  orderIndex: number;
  sets: SetEntry[];
  /** Present when this exercise is part of a superset / circuit. */
  superset?: SupersetInfo;
};

export type WorkoutSession = {
  id: string;
  startedAtMs: number;
  endedAtMs?: number;
  blocks: SessionBlock[];
  excludeFromProgression?: boolean;
  /** Free-text note for the whole session ("slept badly", "great energy"). */
  note?: string | null;
  /** What the user calls it. Unset: the day it came from, else one made up from the exercises. */
  name?: string | null;
  /** The split or program day it was started from, as that day was at the time. */
  source?: SessionSource | null;
};

/**
 * Where a workout came from. Kept with the session (not looked up) so the history still
 * says what the plan was after the split is changed or deleted.
 */
export type SessionSource = {
  kind: "split" | "program";
  /** The split's (or program's) id and name when the workout started. */
  parentId: string;
  parentName: string;
  dayId: string;
  /** "Lower 2", or "Day 5" for an unnamed day. */
  dayName: string;
  /** Position among the workout days, 1-based. */
  dayNumber?: number;
  /** What the plan screen showed: every exercise, drill and activity with its planned sets. */
  plan?: PlannedItem[];
};

/** One thing on the plan a workout started from. */
export type PlannedItem = {
  /** The block it became in the workout. Matched on this, then on the name. */
  blockId: string;
  type: "strength" | "cardio" | "mobility";
  name: string;
  exerciseId?: string;
  /** Members of one superset / circuit share this (the workout's group id). */
  groupId?: string;
  /** Strength: the planned sets, warm-ups included. */
  sets?: { setType: SetType; reps: number; repsMax?: number; weight: number }[];
  /** Mobility: rounds (an L/R pair counts once) and the target of each. */
  rounds?: number;
  targetSec?: number;
  targetReps?: number;
};

export function setSessionNote(session: WorkoutSession, note: string | null): WorkoutSession {
  return { ...session, note: note?.trim() || null };
}

/** A blank name clears it (back to the automatic one). */
export function setSessionName(session: WorkoutSession, name: string | null): WorkoutSession {
  return { ...session, name: name?.trim() || null };
}

export type SessionSummary = {
  id: string;
  dateLabel: string;
  durationLabel: string;
  topSetLabel: string;
};

export type TopSetHighlight = {
  exerciseName: string;
  reps: number;
  weight: number;
};

// Returns all strength blocks as a flat ExerciseEntry list, sorted by orderIndex.
// Use this anywhere that previously read session.exercises.
export function getExercises(session: WorkoutSession): ExerciseEntry[] {
  return session.blocks
    .filter((b): b is SessionBlock<StrengthBlockData> => b.type === "strength")
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((b) => ({
      id: b.id,
      exerciseName: b.data.exerciseName,
      exerciseId: b.data.exerciseId,
      orderIndex: b.orderIndex,
      sets: b.data.sets,
      ...(b.data.superset ? { superset: b.data.superset } : {}),
    }));
}

/**
 * Where this exercise fell among the session's strength blocks (0-based), or -1 if it
 * wasn't done that session. Matches by exerciseId when both sides have one, else by
 * name. Shared by getSuggestion (live "preceding exercises" context) and
 * getExerciseHistory (historical position, for fatigue/order-effect calibration) so
 * both use the exact same matching rule.
 */
export function findExerciseIndexInSession(
  session: WorkoutSession,
  exercise: { id?: string; name: string },
): number {
  const lowerName = exercise.name.toLowerCase();
  return getExercises(session).findIndex(
    (e) =>
      (exercise.id && e.exerciseId === exercise.id) ||
      e.exerciseName.toLowerCase() === lowerName,
  );
}

/**
 * A superset/circuit group, or a lone exercise — for history/recap rendering.
 * Consecutive entries sharing a `superset.id` fold into one `superset` item.
 */
export type ExerciseGroup =
  | { kind: "single"; exercise: ExerciseEntry }
  | { kind: "superset"; id: string; label?: string; groupKind?: GroupKind; exercises: ExerciseEntry[] };

export function foldSupersets(entries: ExerciseEntry[]): ExerciseGroup[] {
  const out: ExerciseGroup[] = [];
  for (let i = 0; i < entries.length; i++) {
    const sid = entries[i]!.superset?.id;
    if (!sid) {
      out.push({ kind: "single", exercise: entries[i]! });
      continue;
    }
    const members: ExerciseEntry[] = [];
    while (i < entries.length && entries[i]!.superset?.id === sid) members.push(entries[i++]!);
    i--;
    const info = members[0]!.superset;
    if (members.length >= minGroupSize(info?.kind)) {
      out.push({
        kind: "superset",
        id: sid,
        label: info?.label,
        ...(info?.kind ? { groupKind: info.kind } : {}),
        exercises: members,
      });
    } else {
      for (const m of members) out.push({ kind: "single", exercise: m });
    }
  }
  return out;
}

export function createSession(startedAtMs: number = nowMs()): WorkoutSession {
  return {
    id: createId("sess"),
    startedAtMs,
    blocks: [],
  };
}

export function addExercise(
  session: WorkoutSession,
  exercise: { exerciseName: string; exerciseId?: string },
): WorkoutSession {
  const block: SessionBlock<StrengthBlockData> = {
    id: createId("ex"),
    type: "strength",
    orderIndex: session.blocks.length,
    data: {
      exerciseName: exercise.exerciseName.trim(),
      exerciseId: exercise.exerciseId,
      sets: [],
    },
  };
  return { ...session, blocks: [...session.blocks, block] };
}

export function removeExercise(
  session: WorkoutSession,
  exerciseEntryId: string,
): WorkoutSession {
  const filtered = session.blocks.filter((b) => b.id !== exerciseEntryId);
  const reindexed = filtered.map((b, i) => ({ ...b, orderIndex: i }));
  return normalizeSupersets({ ...session, blocks: reindexed });
}

/** Fewest exercises a group can have: a circuit can be one exercise for N rounds. */
export function minGroupSize(kind: GroupKind | undefined): number {
  return kind === "circuit" ? 1 : 2;
}

/** Drop group tags left with too few members (under two, or none for a circuit). */
export function normalizeSupersets(session: WorkoutSession): WorkoutSession {
  const counts = new Map<string, number>();
  const kinds = new Map<string, GroupKind | undefined>();
  for (const b of session.blocks) {
    const s = blockSuperset(b);
    if (s) {
      counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
      kinds.set(s.id, s.kind);
    }
  }
  const lonely = new Set(
    [...counts].filter(([id, n]) => n < minGroupSize(kinds.get(id))).map(([id]) => id),
  );
  if (lonely.size === 0) return session;
  return {
    ...session,
    blocks: session.blocks.map((b) => {
      const s = blockSuperset(b);
      return s && lonely.has(s.id) ? setBlockSuperset(b, undefined) : b;
    }),
  };
}

export function addSet(
  session: WorkoutSession,
  exerciseEntryId: string,
  defaults?: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "machineId" | "target">>,
): WorkoutSession {
  return updateStrengthBlock(session, exerciseEntryId, (data) => {
    const set: SetEntry = {
      id: createId("set"),
      setType: defaults?.setType ?? "normal",
      reps: defaults?.reps ?? 0,
      weight: defaults?.weight ?? 0,
      note: defaults?.note,
      orderIndex: data.sets.length,
      machineId: defaults?.machineId,
      ...(defaults?.target ? { target: defaults.target } : {}),
    };
    return { ...data, sets: [...data.sets, set] };
  });
}

export function updateSet(
  session: WorkoutSession,
  exerciseEntryId: string,
  setId: string,
  patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "completed" | "restDurationMs" | "restStartedAtMs" | "machineId" | "rpe" | "target">>,
): WorkoutSession {
  return updateStrengthBlock(session, exerciseEntryId, (data) => ({
    ...data,
    sets: data.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
  }));
}

export function removeSet(
  session: WorkoutSession,
  exerciseEntryId: string,
  setId: string,
): WorkoutSession {
  return updateStrengthBlock(session, exerciseEntryId, (data) => {
    const filtered = data.sets.filter((s) => s.id !== setId);
    const reindexed = filtered.map((s, i) => ({ ...s, orderIndex: i }));
    return { ...data, sets: reindexed };
  });
}

/**
 * Prepend a warm-up ramp to a strength block — the warm-ups land before every
 * existing set and everything is reindexed. A no-op if `warmups` is empty.
 */
export function addWarmupSets(
  session: WorkoutSession,
  exerciseEntryId: string,
  warmups: { weight: number; reps: number }[],
): WorkoutSession {
  if (warmups.length === 0) return session;
  return updateStrengthBlock(session, exerciseEntryId, (data) => {
    const warmSets: SetEntry[] = warmups.map((w, i) => ({
      id: createId("set"),
      setType: "warmup",
      reps: w.reps,
      weight: w.weight,
      orderIndex: i,
    }));
    const shifted = data.sets.map((s) => ({ ...s, orderIndex: s.orderIndex + warmSets.length }));
    return { ...data, sets: [...warmSets, ...shifted] };
  });
}

export type PlannedSet = SetTarget & { setType?: SetType; note?: string; machineId?: string | null };

/**
 * Lay a progression plan onto a strength block: sets already logged stay as they
 * are, planned sets nobody has done yet are replaced, and the plan fills in the
 * remaining set slots (so swapping exercise after two logged sets plans only the
 * rest). Sets entered by hand without a plan are never touched.
 */
export function applySetPlan(
  session: WorkoutSession,
  exerciseEntryId: string,
  plan: PlannedSet[],
): WorkoutSession {
  return updateStrengthBlock(session, exerciseEntryId, (data) => {
    const kept = [...data.sets]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((s) => !isUnloggedPlannedSet(s));
    const keptWorking = kept.filter((s) => s.setType !== "warmup" && !isContinuationSet(s.setType)).length;
    const added: SetEntry[] = plan.slice(keptWorking).map((p, i) => ({
      id: createId("set"),
      setType: p.setType ?? "normal",
      reps: 0,
      weight: p.weight,
      note: p.note,
      orderIndex: kept.length + i,
      machineId: p.machineId ?? undefined,
      target: { reps: p.reps, weight: p.weight, ...(p.repsMax !== undefined ? { repsMax: p.repsMax } : {}) },
    }));
    const sets = [...kept, ...added].map((s, i) => ({ ...s, orderIndex: i }));
    return { ...data, sets };
  });
}

/** Planned sets left untouched at the end of a workout weren't done — drop them. */
export function dropUnloggedPlannedSets(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    blocks: session.blocks.map((b) => {
      if (b.type !== "strength") return b;
      const data = b.data as StrengthBlockData;
      if (!data.sets.some(isUnloggedPlannedSet)) return b;
      const sets = [...data.sets]
        .sort((x, y) => x.orderIndex - y.orderIndex)
        .filter((s) => !isUnloggedPlannedSet(s))
        .map((s, i) => ({ ...s, orderIndex: i }));
      return { ...b, data: { ...data, sets } };
    }),
  };
}

export function finishSession(
  session: WorkoutSession,
  endedAtMs: number = nowMs(),
): WorkoutSession {
  return { ...session, endedAtMs };
}

export function getSessionDurationMs(session: WorkoutSession): number | null {
  if (!session.endedAtMs) return null;
  return Math.max(0, session.endedAtMs - session.startedAtMs);
}

/**
 * Tonnage of one set (reps × load, kg). For bodyweight work the load is
 * bodyweight ± the logged number (see effectiveLoadKg); with no bodyweight known,
 * a negative (assisted) weight counts as 0 instead of subtracting from the total.
 */
export function getSetVolumeKg(
  set: Pick<SetEntry, "reps" | "weight">,
  mode: LoadMode = "external",
  bodyweightKg?: number | null,
): number {
  return set.reps * effectiveLoadKg(set.weight, mode, bodyweightKg);
}

export type VolumeOptions = {
  /** The lifter's bodyweight, for bodyweight and assisted exercises. */
  bodyweightKg?: number | null;
  exerciseType?: ExerciseType;
};

/** Total tonnage (kg) of one exercise's sets. */
export function getExerciseVolumeKg(
  ex: Pick<ExerciseEntry, "sets"> & { exerciseName?: string },
  opts: VolumeOptions = {},
): number {
  const mode = getLoadMode(opts.exerciseType, ex.sets.map((s) => s.weight), ex.exerciseName);
  let vol = 0;
  for (const set of ex.sets) vol += getSetVolumeKg(set, mode, opts.bodyweightKg);
  return vol;
}

/** Total tonnage (Σ reps × load, kg) across every strength set in the session. */
export function getSessionVolumeKg(
  session: WorkoutSession,
  opts: {
    bodyweightKg?: number | null;
    /** Exercise type by entry, so assisted-machine work isn't counted as lifted weight. */
    exerciseTypeOf?: (ex: ExerciseEntry) => ExerciseType | undefined;
  } = {},
): number {
  let vol = 0;
  for (const ex of getExercises(session)) {
    vol += getExerciseVolumeKg(ex, { bodyweightKg: opts.bodyweightKg, exerciseType: opts.exerciseTypeOf?.(ex) });
  }
  return vol;
}

/** Working-set count (excludes warm-ups) across the session. */
export function getSessionSetCount(session: WorkoutSession): number {
  let n = 0;
  for (const ex of getExercises(session)) {
    for (const set of ex.sets) if (set.setType !== "warmup") n++;
  }
  return n;
}

export function getTopSetHighlight(session: WorkoutSession): TopSetHighlight | null {
  let best: { exerciseName: string; set: SetEntry } | null = null;

  for (const ex of getExercises(session)) {
    for (const set of ex.sets) {
      if (!best) { best = { exerciseName: ex.exerciseName, set }; continue; }
      if (set.weight > best.set.weight) { best = { exerciseName: ex.exerciseName, set }; continue; }
      if (set.weight === best.set.weight && set.reps > best.set.reps) {
        best = { exerciseName: ex.exerciseName, set };
      }
    }
  }

  if (!best) return null;
  return { exerciseName: best.exerciseName, reps: best.set.reps, weight: best.set.weight };
}

export function addCardioBlock(
  session: WorkoutSession,
  activityName: string,
): WorkoutSession {
  const block: SessionBlock<CardioBlockData> = {
    id: createId("cardio"),
    type: "cardio",
    orderIndex: session.blocks.length,
    data: {
      activityName: activityName.trim(),
      intervals: [],
    },
  };
  return { ...session, blocks: [...session.blocks, block] };
}

// ── Mobility block helpers ───────────────────────────────────────────────────

const MOBILITY_SET_PATCH_KEYS = [
  "side",
  "durationSec",
  "reps",
  "loadKg",
  "targetSec",
  "depth",
  "completed",
  "note",
  "restDurationMs",
  "restStartedAtMs",
  "leadSide",
] as const;

export type MobilitySetPatch = Partial<Pick<MobilitySet, (typeof MOBILITY_SET_PATCH_KEYS)[number]>>;

function reindexMobilitySets(sets: MobilitySet[]): MobilitySet[] {
  return [...sets]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((s, i) => ({ ...s, orderIndex: i }));
}

function newMobilitySet(orderIndex: number, side?: MobilitySide): MobilitySet {
  return { id: createId("mset"), orderIndex, ...(side ? { side } : {}) };
}

export function addMobilityBlock(
  session: WorkoutSession,
  opts: {
    drillName: string;
    drillId?: string;
    metric?: MobilityMetric;
    perSide?: boolean;
    leadSide?: MobilitySide;
  },
): WorkoutSession {
  const perSide = opts.perSide ?? false;
  const block: SessionBlock<MobilityBlockData> = {
    id: createId("mob"),
    type: "mobility",
    orderIndex: session.blocks.length,
    data: {
      drillName: opts.drillName.trim(),
      ...(opts.drillId ? { drillId: opts.drillId } : {}),
      metric: opts.metric ?? "hold",
      perSide,
      ...(opts.leadSide && opts.leadSide !== "left" ? { leadSide: opts.leadSide } : {}),
      sets: perSide
        ? [newMobilitySet(0, "left"), newMobilitySet(1, "right")]
        : [newMobilitySet(0)],
    },
  };
  return { ...session, blocks: [...session.blocks, block] };
}

/** Append one set — or an L/R pair when the block is per-side. */
export function addMobilitySet(session: WorkoutSession, blockId: string): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => {
    const n = data.sets.length;
    const added = data.perSide
      ? [newMobilitySet(n, "left"), newMobilitySet(n + 1, "right")]
      : [newMobilitySet(n)];
    return { ...data, sets: reindexMobilitySets([...data.sets, ...added]) };
  });
}

export function updateMobilitySet(
  session: WorkoutSession,
  blockId: string,
  setId: string,
  patch: MobilitySetPatch,
): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => ({
    ...data,
    sets: data.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
  }));
}

/** Remove a set — or the whole L/R pair it belongs to when the block is per-side. */
export function removeMobilitySet(
  session: WorkoutSession,
  blockId: string,
  setId: string,
): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => {
    const sorted = [...data.sets].sort((a, b) => a.orderIndex - b.orderIndex);
    const pos = sorted.findIndex((s) => s.id === setId);
    if (pos === -1) return data;
    const drop = new Set<string>([setId]);
    if (data.perSide) {
      const pairStart = pos - (pos % 2);
      for (const s of sorted.slice(pairStart, pairStart + 2)) drop.add(s.id);
    }
    return { ...data, sets: reindexMobilitySets(sorted.filter((s) => !drop.has(s.id))) };
  });
}

export function setMobilityMetric(
  session: WorkoutSession,
  blockId: string,
  metric: MobilityMetric,
): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => ({ ...data, metric }));
}

/** Set (or clear, with `undefined`) the drill's rest-between-sets default. */
export function setMobilityRestBetweenSets(
  session: WorkoutSession,
  blockId: string,
  restMs: number | undefined,
): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => {
    const next = { ...data };
    if (restMs && restMs > 0) next.restBetweenSetsMs = restMs;
    else delete next.restBetweenSetsMs;
    return next;
  });
}

/**
 * Toggle unilateral tracking without losing work.
 *
 * Turning it **on** rebuilds each single set as an L/R pair: the existing set
 * becomes `left`, and `right` is restored from `stashedSides` (parked by an
 * earlier toggle-off) when a matching set number exists, otherwise blank.
 *
 * Turning it **off** collapses each pair to its `left` entry and parks the
 * `right` entry in `stashedSides`, so toggling back on brings the right side's
 * data with it.
 */
export function setMobilityPerSide(
  session: WorkoutSession,
  blockId: string,
  perSide: boolean,
): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => {
    if (data.perSide === perSide) return data;

    if (perSide) {
      const singles = [...data.sets].sort((a, b) => a.orderIndex - b.orderIndex);
      const stash = data.stashedSides ?? [];
      const next: MobilitySet[] = [];
      singles.forEach((s, i) => {
        const setNumber = i + 1;
        const { leadSide: _lead, ...bare } = s;
        next.push({ ...bare, side: "left" });
        const parked = stash.find((x) => x.setNumber === setNumber);
        next.push(
          parked
            ? { ...parked.set, id: createId("mset"), orderIndex: 0, side: "right" }
            : newMobilitySet(0, "right"),
        );
      });
      const rebuilt =
        next.length > 0 ? next : [newMobilitySet(0, "left"), newMobilitySet(1, "right")];
      const out = { ...data, perSide, sets: reindexMobilitySets(rebuilt) };
      delete out.stashedSides;
      return out;
    }

    // perSide → off: keep the left of each pair, stash the right.
    const groups = mobilitySetGroups(data);
    const kept: MobilitySet[] = [];
    const stashedSides: { setNumber: number; set: MobilitySet }[] = [];
    for (const g of groups) {
      if (g.kind !== "pair") continue;
      const keep = g.left ?? g.right;
      const park = g.left ? g.right : undefined;
      if (keep) {
        const { side: _s, leadSide: _l, ...bare } = keep;
        kept.push(bare);
      }
      if (park) {
        const { side: _s, leadSide: _l, restStartedAtMs: _r, ...bare } = park;
        stashedSides.push({ setNumber: g.setNumber, set: bare });
      }
    }
    const sets = reindexMobilitySets(kept.length ? kept : [newMobilitySet(0)]);
    const out: MobilityBlockData = { ...data, perSide, sets };
    if (stashedSides.some((x) => mobilitySetHasData(x.set))) out.stashedSides = stashedSides;
    else delete out.stashedSides;
    return out;
  });
}

/** True when a set carries any logged effort worth preserving. */
function mobilitySetHasData(s: MobilitySet): boolean {
  return (
    (s.durationSec ?? 0) > 0 ||
    (s.reps ?? 0) > 0 ||
    (s.loadKg ?? 0) > 0 ||
    (s.depth ?? 0) > 0 ||
    !!s.completed ||
    !!s.note?.trim()
  );
}

export function updateMobilityDrill(
  session: WorkoutSession,
  blockId: string,
  next: { drillName: string; drillId?: string },
): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => {
    const d = { ...data, drillName: next.drillName.trim() };
    if (next.drillId) d.drillId = next.drillId;
    else delete d.drillId;
    return d;
  });
}

/**
 * Set (or clear) this block's default lead side — e.g. from the drill's detail
 * sheet, applying a per-drill preference to the session already in progress.
 */
export function setMobilityLeadSide(
  session: WorkoutSession,
  blockId: string,
  leadSide: MobilitySide | undefined,
): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => {
    const next = { ...data };
    if (leadSide) next.leadSide = leadSide;
    else delete next.leadSide;
    return next;
  });
}

/** A mobility set, or an L/R pair — for rendering rows grouped as "Set N". */
export type MobilitySetGroup =
  | { setNumber: number; kind: "single"; set: MobilitySet }
  | {
      setNumber: number;
      kind: "pair";
      left?: MobilitySet;
      right?: MobilitySet;
      /** Which side to render / interact with first. */
      lead: MobilitySide;
    };

export function mobilitySetGroups(data: MobilityBlockData): MobilitySetGroup[] {
  const sorted = [...data.sets].sort((a, b) => a.orderIndex - b.orderIndex);
  if (!data.perSide) {
    return sorted.map((set, i) => ({ setNumber: i + 1, kind: "single" as const, set }));
  }
  const blockLead: MobilitySide = data.leadSide ?? "left";
  const out: MobilitySetGroup[] = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const left = [a, b].find((s) => s?.side === "left") ?? a;
    const right = [a, b].find((s) => s?.side === "right") ?? (left === a ? b : a);
    const lead = left?.leadSide ?? right?.leadSide ?? blockLead;
    out.push({ setNumber: out.length + 1, kind: "pair", left, right, lead });
  }
  return out;
}

/**
 * Move a set group (a single, or an L/R pair) to an arbitrary position — the
 * mobility analog of drag-to-reorder. `fromIndex` / `toIndex` are 0-based
 * positions into `mobilitySetGroups(data)`.
 */
export function moveMobilitySetGroup(
  session: WorkoutSession,
  blockId: string,
  fromIndex: number,
  toIndex: number,
): WorkoutSession {
  return updateMobilityBlock(session, blockId, (data) => {
    const groups = mobilitySetGroups(data);
    if (
      fromIndex < 0 ||
      fromIndex >= groups.length ||
      toIndex < 0 ||
      toIndex >= groups.length ||
      fromIndex === toIndex
    ) {
      return data;
    }
    const reordered = [...groups];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved!);
    const flat: MobilitySet[] = [];
    for (const g of reordered) {
      if (g.kind === "single") flat.push(g.set);
      else {
        if (g.left) flat.push(g.left);
        if (g.right) flat.push(g.right);
      }
    }
    // Assign orderIndex from the new positions — don't reindex (which re-sorts
    // by the *old* orderIndex and would undo the move).
    return { ...data, sets: flat.map((s, i) => ({ ...s, orderIndex: i })) };
  });
}

function updateMobilityBlock(
  session: WorkoutSession,
  blockId: string,
  updater: (data: MobilityBlockData) => MobilityBlockData,
): WorkoutSession {
  const idx = session.blocks.findIndex((b) => b.id === blockId && b.type === "mobility");
  if (idx === -1) return session;
  const block = session.blocks[idx] as SessionBlock<MobilityBlockData>;
  const updated = { ...block, data: updater(block.data) };
  return { ...session, blocks: session.blocks.map((b, i) => (i === idx ? updated : b)) };
}

export function moveExercise(
  session: WorkoutSession,
  exerciseEntryId: string,
  direction: "up" | "down",
): WorkoutSession {
  const sorted = [...session.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  const idx = sorted.findIndex((b) => b.id === exerciseEntryId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return session;

  const a = sorted[idx]!;
  const b = sorted[swapIdx]!;
  const blocks = session.blocks.map((blk) => {
    if (blk.id === a.id) return { ...blk, orderIndex: b.orderIndex };
    if (blk.id === b.id) return { ...blk, orderIndex: a.orderIndex };
    return blk;
  });
  return { ...session, blocks };
}

export function moveSet(
  session: WorkoutSession,
  exerciseEntryId: string,
  setId: string,
  direction: "up" | "down",
): WorkoutSession {
  return updateStrengthBlock(session, exerciseEntryId, (data) => {
    const sorted = [...data.sets].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = sorted.findIndex((s) => s.id === setId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return data;

    const a = sorted[idx]!;
    const b = sorted[swapIdx]!;
    const sets = data.sets.map((s) => {
      if (s.id === a.id) return { ...s, orderIndex: b.orderIndex };
      if (s.id === b.id) return { ...s, orderIndex: a.orderIndex };
      return s;
    });
    return { ...data, sets };
  });
}

export function updateExerciseName(
  session: WorkoutSession,
  exerciseEntryId: string,
  exerciseName: string,
): WorkoutSession {
  return updateStrengthBlock(session, exerciseEntryId, (data) => ({
    ...data,
    exerciseName: exerciseName.trim(),
  }));
}

/**
 * Swap the exercise a strength block tracks, keeping the logged sets in place.
 * This is the "I meant to do incline, not flat" move — distinct from add+remove,
 * which loses the sets and their order.
 */
export function swapExercise(
  session: WorkoutSession,
  exerciseEntryId: string,
  next: { exerciseName: string; exerciseId?: string },
): WorkoutSession {
  return updateStrengthBlock(session, exerciseEntryId, (data) => ({
    ...data,
    exerciseName: next.exerciseName.trim(),
    exerciseId: next.exerciseId,
  }));
}

// ── Supersets / circuits ─────────────────────────────────────────────────────

function blockSuperset(b: SessionBlock): SupersetInfo | undefined {
  return (b.data as { superset?: SupersetInfo } | undefined)?.superset;
}

function setBlockSuperset(b: SessionBlock, superset: SupersetInfo | undefined): SessionBlock {
  const data = { ...(b.data as Record<string, unknown>) };
  if (superset) data.superset = superset;
  else delete data.superset;
  return { ...b, data };
}

/** Blocks in the given superset, in session order. */
export function supersetMembers(session: WorkoutSession, supersetId: string): SessionBlock[] {
  return [...session.blocks]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((b) => blockSuperset(b)?.id === supersetId);
}

/**
 * Group two or more blocks into a superset: they get a shared superset id and
 * are pulled together so they sit contiguously, at the position of the first.
 * If any block is already in a superset, everything merges into one.
 */
export function groupIntoSuperset(
  session: WorkoutSession,
  blockIds: string[],
  label?: string,
  kind?: GroupKind,
): WorkoutSession {
  const ids = new Set(blockIds);
  const targets = session.blocks.filter((b) => ids.has(b.id));

  // Reuse an existing superset (id, name, kind) among the targets, else mint one.
  const existing = targets.map(blockSuperset).find((s) => s);
  const groupKind = kind ?? existing?.kind;
  if (targets.length < minGroupSize(groupKind)) return session;
  const supersetId = existing?.id ?? createId("superset");
  const name = label ?? existing?.label;
  const info: SupersetInfo = {
    id: supersetId,
    ...(name ? { label: name } : {}),
    ...(groupKind ? { kind: groupKind } : {}),
    ...(existing?.roundRestMs !== undefined ? { roundRestMs: existing.roundRestMs } : {}),
    ...(existing?.memberRestMs !== undefined ? { memberRestMs: existing.memberRestMs } : {}),
    ...(existing?.leadInMs !== undefined ? { leadInMs: existing.leadInMs } : {}),
  };

  // Also fold in any blocks that already shared an id with a target.
  const foldedIds = new Set(blockIds);
  for (const b of session.blocks) {
    const s = blockSuperset(b);
    if (s && targets.some((t) => blockSuperset(t)?.id === s.id)) foldedIds.add(b.id);
  }

  const sorted = [...session.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  const members = sorted.filter((b) => foldedIds.has(b.id)).map((b) => setBlockSuperset(b, info));
  const rest = sorted.filter((b) => !foldedIds.has(b.id));

  const anchor = Math.min(...members.map((m) => sorted.findIndex((b) => b.id === m.id)));
  const reordered = [...rest.slice(0, anchor), ...members, ...rest.slice(anchor)];

  return {
    ...session,
    blocks: reordered.map((b, i) => ({ ...b, orderIndex: i })),
  };
}

/** Break a superset apart — the blocks stay where they are, just ungrouped. */
export function ungroupSuperset(session: WorkoutSession, supersetId: string): WorkoutSession {
  return {
    ...session,
    blocks: session.blocks.map((b) =>
      blockSuperset(b)?.id === supersetId ? setBlockSuperset(b, undefined) : b,
    ),
  };
}

/** Call a group a superset or a circuit. A one-exercise group made a superset is ungrouped. */
export function setGroupKind(session: WorkoutSession, supersetId: string, kind: GroupKind): WorkoutSession {
  return normalizeSupersets({
    ...session,
    blocks: session.blocks.map((b) => {
      const info = blockSuperset(b);
      return info?.id === supersetId ? setBlockSuperset(b, { ...info, kind }) : b;
    }),
  });
}

/** Remove a whole superset / circuit: the group and every exercise in it. */
export function removeGroup(session: WorkoutSession, supersetId: string): WorkoutSession {
  const kept = [...session.blocks]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((b) => blockSuperset(b)?.id !== supersetId);
  return { ...session, blocks: kept.map((b, i) => ({ ...b, orderIndex: i })) };
}

/** Set (or clear, with undefined/0) the rest between rounds of a circuit, on every member. */
export function setGroupRoundRest(
  session: WorkoutSession,
  supersetId: string,
  roundRestMs: number | undefined,
): WorkoutSession {
  return {
    ...session,
    blocks: session.blocks.map((b) => {
      const info = blockSuperset(b);
      if (info?.id !== supersetId) return b;
      const next: SupersetInfo = { ...info };
      if (roundRestMs && roundRestMs > 0) next.roundRestMs = roundRestMs;
      else delete next.roundRestMs;
      return setBlockSuperset(b, next);
    }),
  };
}

/**
 * Change a group's name or timings on every member. A field left out stays as it is;
 * `null` (or an empty name) clears it back to its default.
 */
export function setGroupSettings(
  session: WorkoutSession,
  supersetId: string,
  patch: GroupSettingsPatch,
): WorkoutSession {
  return {
    ...session,
    blocks: session.blocks.map((b) => {
      const info = blockSuperset(b);
      if (info?.id !== supersetId) return b;
      const next: SupersetInfo = { ...info };
      if (patch.label !== undefined) {
        const name = patch.label?.trim();
        if (name) next.label = name;
        else delete next.label;
      }
      for (const key of ["roundRestMs", "memberRestMs", "leadInMs"] as const) {
        const v = patch[key];
        if (v === undefined) continue;
        if (v === null) delete next[key];
        else next[key] = Math.max(0, Math.round(v));
      }
      return setBlockSuperset(b, next);
    }),
  };
}

/** The superset / circuit a block belongs to, if any. */
export function blockGroup(b: SessionBlock): SupersetInfo | undefined {
  return blockSuperset(b);
}

/** The name a block goes by in lists and pickers: exercise, activity or drill. */
export function blockDisplayName(b: SessionBlock): string {
  switch (b.type) {
    case "strength":
      return (b.data as StrengthBlockData).exerciseName;
    case "cardio":
      return (b.data as CardioBlockData).activityName;
    case "mobility":
      return (b.data as MobilityBlockData).drillName;
    default:
      return b.type;
  }
}

/**
 * A group's name: its own name if it was given one, else the kind chosen for it, else by
 * count ("Superset" for two, "Circuit" for one or three or more).
 */
export function groupLabel(memberCount: number, label?: string, kind?: GroupKind): string {
  const named = label?.trim();
  if (named) return named;
  return groupKindOf(memberCount, kind) === "circuit" ? "Circuit" : "Superset";
}

/** The kind a group is: the chosen one, else by count. */
export function groupKindOf(memberCount: number, kind?: GroupKind): GroupKind {
  return kind ?? (memberCount === 2 ? "superset" : "circuit");
}

/**
 * What "Superset / circuit with…" offers for a block: every other block in the
 * workout that isn't already in its group, in workout order, split into the
 * block's own kind first (mobility next to mobility) and everything else after.
 * Blocks in another group are offered too; picking one merges the groups.
 */
export function groupCandidates(
  session: WorkoutSession,
  anchorId: string,
): { same: SessionBlock[]; other: SessionBlock[] } {
  const sorted = [...session.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  const anchor = sorted.find((b) => b.id === anchorId);
  if (!anchor) return { same: [], other: [] };
  const groupId = blockSuperset(anchor)?.id;
  const pool = sorted.filter(
    (b) => b.id !== anchorId && !(groupId && blockSuperset(b)?.id === groupId),
  );
  return {
    same: pool.filter((b) => b.type === anchor.type),
    other: pool.filter((b) => b.type !== anchor.type),
  };
}

/**
 * How many rounds a member has: strength sets, or mobility sets (an L/R pair
 * counts once). Other block types don't count rounds.
 */
export function memberRoundCount(block: SessionBlock): number {
  if (block.type === "strength") return (block.data as StrengthBlockData).sets.length;
  if (block.type === "mobility") return mobilitySetGroups(block.data as MobilityBlockData).length;
  return 0;
}

/** A group's round count: the most rounds any member has. */
export function supersetRoundCount(members: SessionBlock[]): number {
  return Math.max(0, ...members.map(memberRoundCount));
}

/** A member's sets per round: a strength set, or a mobility set / both sides of a pair. */
function memberRoundSets(block: SessionBlock): { completed?: boolean; restStartedAtMs?: number | null }[][] {
  if (block.type === "strength") {
    return [...(block.data as StrengthBlockData).sets].sort((a, b) => a.orderIndex - b.orderIndex).map((s) => [s]);
  }
  if (block.type === "mobility") {
    return mobilitySetGroups(block.data as MobilityBlockData).map((g) =>
      g.kind === "single" ? [g.set] : [g.left, g.right].filter((x): x is MobilitySet => !!x),
    );
  }
  return [];
}

/** Which of a member's rounds are logged (both sides of a pair). */
function memberRoundsDone(block: SessionBlock): boolean[] {
  return memberRoundSets(block).map((sets) => sets.every((s) => s.completed));
}

/**
 * Each round of a group: how many members have a set in it, how many of those are
 * logged, and whether a rest timer is running on one of its sets.
 */
export function groupRounds(members: SessionBlock[]): { total: number; done: number; resting: boolean }[] {
  const perMember = members.map(memberRoundSets);
  const count = Math.max(0, ...perMember.map((r) => r.length));
  return Array.from({ length: count }, (_, r) => {
    const sets = perMember.map((m) => m[r]).filter((x): x is NonNullable<typeof x> => !!x);
    return {
      total: sets.length,
      done: sets.filter((x) => x.every((s) => s.completed)).length,
      resting: sets.some((x) => x.some((s) => typeof s.restStartedAtMs === "number")),
    };
  });
}

/**
 * How far through a group is, for its collapsed line: sets logged out of all sets (one
 * per member per round; an L/R pair counts once), and the round being worked on (1-based,
 * the first with anything left; the last round once everything is done).
 */
export function groupProgress(members: SessionBlock[]): { done: number; total: number; currentRound: number; roundCount: number } {
  const perMember = members.map(memberRoundsDone);
  const roundCount = Math.max(0, ...perMember.map((r) => r.length));
  const all = perMember.flat();
  let currentRound = roundCount;
  for (let r = 0; r < roundCount; r++) {
    if (perMember.some((m) => r < m.length && !m[r])) {
      currentRound = r + 1;
      break;
    }
  }
  return { done: all.filter(Boolean).length, total: all.length, currentRound, roundCount };
}

/**
 * Add one more round: appends a fresh set to every strength member (weight
 * carried from its last set) and a set, or L/R pair, to every mobility member
 * (hold target and load carried from its last set on the same side).
 */
export function addSupersetRound(session: WorkoutSession, supersetId: string): WorkoutSession {
  let next = session;
  for (const member of supersetMembers(session, supersetId)) {
    if (member.type === "strength") {
      const sets = (member.data as StrengthBlockData).sets;
      const last = sets[sets.length - 1];
      next = addSet(next, member.id, {
        reps: 0,
        weight: last?.weight ?? 0,
        setType: "normal",
      });
    } else if (member.type === "mobility") {
      next = addMobilityRound(next, member.id);
    }
  }
  return next;
}

/** The id of a member's last round (strength set, or mobility set / L/R pair) if nothing in it is logged. */
function unloggedLastRound(block: SessionBlock): string | null {
  if (block.type === "strength") {
    const sets = [...(block.data as StrengthBlockData).sets].sort((a, b) => a.orderIndex - b.orderIndex);
    const last = sets[sets.length - 1];
    return last && !last.completed && last.reps === 0 ? last.id : null;
  }
  if (block.type === "mobility") {
    const groups = mobilitySetGroups(block.data as MobilityBlockData);
    const last = groups[groups.length - 1];
    if (!last) return null;
    const sets = last.kind === "single" ? [last.set] : [last.left, last.right];
    if (sets.some((x) => x?.completed)) return null;
    return sets.find((x) => x)?.id ?? null;
  }
  return null;
}

/** True when `removeSupersetRound` would remove something. */
export function canRemoveSupersetRound(session: WorkoutSession, supersetId: string): boolean {
  const members = supersetMembers(session, supersetId);
  const rounds = supersetRoundCount(members);
  return rounds > 1 && members.some((m) => memberRoundCount(m) === rounds && unloggedLastRound(m) !== null);
}

/**
 * One round fewer: removes the last round from every member that has the group's full
 * round count, if nothing in that round is logged. Logged sets are never removed, and a
 * group keeps at least one round.
 */
export function removeSupersetRound(session: WorkoutSession, supersetId: string): WorkoutSession {
  if (!canRemoveSupersetRound(session, supersetId)) return session;
  const members = supersetMembers(session, supersetId);
  const rounds = supersetRoundCount(members);
  let next = session;
  for (const member of members) {
    if (memberRoundCount(member) !== rounds) continue;
    const setId = unloggedLastRound(member);
    if (!setId) continue;
    next = member.type === "strength" ? removeSet(next, member.id, setId) : removeMobilitySet(next, member.id, setId);
  }
  return next;
}

/** `addMobilitySet`, plus the hold target and load of the last set on the same side. */
function addMobilityRound(session: WorkoutSession, blockId: string): WorkoutSession {
  return updateMobilityBlock(addMobilitySet(session, blockId), blockId, (data) => {
    const sorted = [...data.sets].sort((a, b) => a.orderIndex - b.orderIndex);
    const added = data.perSide ? 2 : 1;
    const before = sorted.slice(0, -added);
    const fresh = new Set(sorted.slice(-added).map((s) => s.id));
    const sets = data.sets.map((s) => {
      if (!fresh.has(s.id)) return s;
      const prev = [...before].reverse().find((p) => !data.perSide || p.side === s.side);
      if (!prev) return s;
      return {
        ...s,
        ...(prev.targetSec != null ? { targetSec: prev.targetSec } : {}),
        ...(prev.loadKg ? { loadKg: prev.loadKg } : {}),
      };
    });
    return { ...data, sets };
  });
}

function updateStrengthBlock(
  session: WorkoutSession,
  blockId: string,
  updater: (data: StrengthBlockData) => StrengthBlockData,
): WorkoutSession {
  const idx = session.blocks.findIndex((b) => b.id === blockId);
  if (idx === -1) return session;

  const block = session.blocks[idx] as SessionBlock<StrengthBlockData>;
  const updated = { ...block, data: updater(block.data) };
  const blocks = session.blocks.map((b, i) => (i === idx ? updated : b));
  return { ...session, blocks };
}

// ── Rest timers ──────────────────────────────────────────────────────────────
// A set's `restStartedAtMs` is the one record of a running rest: set when the set is ticked
// (if it has a rest), cleared when the rest ends, is dismissed, or the set is unticked. The
// app's rest service, the progress bars and the collapsed-card indicator all read it.

/** How long a strength set rests: its own override, else the profile default for its type. */
export function strengthRestMs(set: SetEntry, restDefaults: Record<string, number | undefined>): number {
  return set.restDurationMs ?? restDefaults[set.setType] ?? DEFAULT_REST_MS;
}

/** How long a mobility set rests: its own override, else the block's rest (60 s if neither). */
export function mobilityRestMs(set: MobilitySet, block: MobilityBlockData): number {
  return (set.restDurationMs ?? block.restBetweenSetsMs ?? 0) || 60_000;
}

export type RunningRest = { setId: string; startedAtMs: number; endsAtMs: number };

/** Every set in the session with a rest started, and when that rest ends. */
export function getRunningRests(
  session: WorkoutSession,
  restDefaults: Record<string, number | undefined>,
): RunningRest[] {
  const out: RunningRest[] = [];
  for (const block of session.blocks) {
    if (block.type === "strength") {
      for (const set of (block.data as StrengthBlockData).sets) {
        if (typeof set.restStartedAtMs !== "number") continue;
        out.push({ setId: set.id, startedAtMs: set.restStartedAtMs, endsAtMs: set.restStartedAtMs + strengthRestMs(set, restDefaults) });
      }
    } else if (block.type === "mobility") {
      const data = block.data as MobilityBlockData;
      for (const set of data.sets) {
        if (typeof set.restStartedAtMs !== "number") continue;
        out.push({ setId: set.id, startedAtMs: set.restStartedAtMs, endsAtMs: set.restStartedAtMs + mobilityRestMs(set, data) });
      }
    }
  }
  return out;
}

/**
 * End a set's rest. With `startedAtMs`, only the rest that started then is cleared, so a
 * rest that ended while the set was re-ticked (a new rest) is left running. Returns the same
 * session object when nothing changed.
 */
export function clearRest(session: WorkoutSession, setId: string, startedAtMs?: number): WorkoutSession {
  let changed = false;
  const matches = (s: { id: string; restStartedAtMs?: number | null }) =>
    s.id === setId && typeof s.restStartedAtMs === "number" && (startedAtMs === undefined || s.restStartedAtMs === startedAtMs);
  const blocks = session.blocks.map((block) => {
    if (block.type !== "strength" && block.type !== "mobility") return block;
    const data = block.data as StrengthBlockData | MobilityBlockData;
    if (!data.sets.some(matches)) return block;
    changed = true;
    const sets = data.sets.map((s) => (matches(s) ? { ...s, restStartedAtMs: null } : s));
    return { ...block, data: { ...data, sets } };
  });
  return changed ? { ...session, blocks } : session;
}

/**
 * One rest at a time: ends every running rest except the one on `keepSetId`. Called when a
 * set starts a rest, so ticking the next set quickly replaces the previous set's timer
 * instead of running two (two bars, two alerts). Returns the same session object when
 * nothing changed.
 */
export function clearOtherRests(session: WorkoutSession, keepSetId: string): WorkoutSession {
  let changed = false;
  const other = (s: { id: string; restStartedAtMs?: number | null }) =>
    s.id !== keepSetId && typeof s.restStartedAtMs === "number";
  const blocks = session.blocks.map((block) => {
    if (block.type !== "strength" && block.type !== "mobility") return block;
    const data = block.data as StrengthBlockData | MobilityBlockData;
    if (!data.sets.some(other)) return block;
    changed = true;
    const sets = data.sets.map((s) => (other(s) ? { ...s, restStartedAtMs: null } : s));
    return { ...block, data: { ...data, sets } };
  });
  return changed ? { ...session, blocks } : session;
}
