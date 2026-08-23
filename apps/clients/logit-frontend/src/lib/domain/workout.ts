import { createId } from "$lib/domain/ids";
import { nowMs } from "$lib/domain/time";

export const DEFAULT_REST_MS = 90_000;

export type SetType = "normal" | "warmup" | "dropset" | "amrap" | "failure";

// Exported as a mutable array so plugins can push new entries at runtime.
export const SET_TYPE_META: { type: string; label: string }[] = [
  { type: "normal",  label: "Normal"  },
  { type: "warmup",  label: "Warm-up" },
  { type: "dropset", label: "Drop set" },
  { type: "amrap",   label: "AMRAP"   },
  { type: "failure", label: "Failure" },
];

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
};

// Data payload for a strength (exercise + sets) block
export type StrengthBlockData = {
  exerciseName: string;
  exerciseId?: string;
  sets: SetEntry[];
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
};

export type WorkoutSession = {
  id: string;
  startedAtMs: number;
  endedAtMs?: number;
  blocks: SessionBlock[];
  excludeFromProgression?: boolean;
};

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
    }));
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
  return { ...session, blocks: reindexed };
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
  patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note" | "completed" | "restDurationMs" | "restStartedAtMs" | "machineId">>,
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
