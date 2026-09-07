import { createId } from "./ids";
import { nowMs } from "./time";

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
};

/**
 * Marks a block as part of a superset / circuit. Blocks sharing an `id` are
 * performed together, one set from each per round. Stored inside block `data`
 * (not on the block) so it round-trips through the JSON `session_blocks.data`
 * column with no schema change.
 */
export type SupersetInfo = { id: string; label?: string };

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
};

export function setSessionNote(session: WorkoutSession, note: string | null): WorkoutSession {
  return { ...session, note: note?.trim() || null };
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
 * A superset/circuit group, or a lone exercise — for history/recap rendering.
 * Consecutive entries sharing a `superset.id` fold into one `superset` item.
 */
export type ExerciseGroup =
  | { kind: "single"; exercise: ExerciseEntry }
  | { kind: "superset"; id: string; label?: string; exercises: ExerciseEntry[] };

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
    if (members.length >= 2) {
      out.push({ kind: "superset", id: sid, label: members[0]!.superset?.label, exercises: members });
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

/** Drop superset tags that ended up with fewer than two members. */
export function normalizeSupersets(session: WorkoutSession): WorkoutSession {
  const counts = new Map<string, number>();
  for (const b of session.blocks) {
    const s = blockSuperset(b);
    if (s) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
  }
  const lonely = new Set([...counts].filter(([, n]) => n < 2).map(([id]) => id));
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
  defaults?: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "machineId">>,
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
    };
    return { ...data, sets: [...data.sets, set] };
  });
}

export function updateSet(
  session: WorkoutSession,
  exerciseEntryId: string,
  setId: string,
  patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "completed" | "restDurationMs" | "restStartedAtMs" | "machineId" | "rpe">>,
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

/** Total tonnage (Σ reps × weight, kg) across every strength set in the session. */
export function getSessionVolumeKg(session: WorkoutSession): number {
  let vol = 0;
  for (const ex of getExercises(session)) {
    for (const set of ex.sets) vol += set.reps * set.weight;
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
): WorkoutSession {
  const ids = new Set(blockIds);
  const targets = session.blocks.filter((b) => ids.has(b.id));
  if (targets.length < 2) return session;

  // Reuse an existing superset id among the targets, else mint one.
  const existingId = targets.map(blockSuperset).find((s) => s)?.id;
  const supersetId = existingId ?? createId("superset");
  const info: SupersetInfo = { id: supersetId, ...(label ? { label } : {}) };

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

/** Add one more round: appends a fresh set to every strength member of the group. */
export function addSupersetRound(session: WorkoutSession, supersetId: string): WorkoutSession {
  let next = session;
  for (const member of supersetMembers(session, supersetId)) {
    if (member.type !== "strength") continue;
    const sets = (member.data as StrengthBlockData).sets;
    const last = sets[sets.length - 1];
    next = addSet(next, member.id, {
      reps: 0,
      weight: last?.weight ?? 0,
      setType: "normal",
    });
  }
  return next;
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
