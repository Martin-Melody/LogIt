// Every set a workout logged, whichever screen logged it (Phase 6.1, canvas SP7): a bench press is
// a bench press whether it was a normal exercise, part of a superset or circuit, or an entry in a
// plugin's own block that says how its entries count as sets (countsAs.sets). History, records,
// estimates, weekly sets, insights and the coach's views read sets through here; the screens that
// edit a workout keep using getExercises.

import { getExercises, type ExerciseEntry, type SetEntry, type WorkoutSession } from "./workout";
import { isPluginBlockType, type BlockValue, type PluginBlockData, type SetsMapping } from "./blockPlugin";

/** An exercise as logged: from a strength block, or (with `from`) from a plugin block. */
export type LoggedExercise = ExerciseEntry & {
  /** The plugin block that logged these sets ("Weight finder"); absent for ordinary exercises. */
  from?: string;
};

const num = (v: BlockValue | undefined): number | null => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(v);
    return m ? Number(m[1]) : null;
  }
  return null;
};

function effort(values: Record<string, BlockValue>, m: SetsMapping): number | null {
  if (m.rpe) {
    const v = values[m.rpe];
    const mapped = typeof v === "string" && m.rpeMap ? m.rpeMap[v] : undefined;
    const n = mapped ?? num(v);
    if (n != null) return Math.min(10, Math.max(1, n));
  }
  if (m.rir) {
    const v = values[m.rir];
    const mapped = typeof v === "string" && m.rirMap ? m.rirMap[v] : undefined;
    const n = mapped ?? num(v);
    // Reps in reserve as effort: 2 left ≈ RPE 8.
    if (n != null) return Math.min(10, Math.max(1, 10 - n));
  }
  return null;
}

/** The sets a plugin block's entries stand for, grouped by exercise in order of first use. */
export function pluginBlockSets(blockId: string, orderIndex: number, data: PluginBlockData): LoggedExercise[] {
  const m = data.sets;
  if (!m) return [];
  const out = new Map<string, LoggedExercise>();
  data.entries.forEach((e, i) => {
    const values = { ...data.blockFields, ...e.values };
    const name = values[m.exercise];
    const reps = m.reps ? num(values[m.reps]) : null;
    if (typeof name !== "string" || !name.trim() || reps == null || reps <= 0) return;
    const key = name.trim().toLowerCase();
    const ex = out.get(key) ?? { id: `${blockId}:${key}`, exerciseName: name.trim(), orderIndex, sets: [], from: data.name };
    const rpe = effort(values, m);
    const set: SetEntry = {
      id: `${blockId}:${e.id}`,
      setType: "normal",
      reps,
      weight: (m.weight ? num(values[m.weight]) : null) ?? 0,
      orderIndex: i,
      completed: e.done !== false,
      ...(rpe != null ? { rpe } : {}),
    };
    ex.sets.push(set);
    out.set(key, ex);
  });
  return [...out.values()];
}

/** Every exercise a session logged, in block order: strength blocks and plugin blocks' sets. */
export function loggedExercises(session: WorkoutSession): LoggedExercise[] {
  const plugin = session.blocks
    .filter((b) => isPluginBlockType(b.type))
    .flatMap((b) => pluginBlockSets(b.id, b.orderIndex, b.data as PluginBlockData));
  if (!plugin.length) return getExercises(session);
  return [...getExercises(session), ...plugin].sort((a, b) => a.orderIndex - b.orderIndex);
}

/** Where `exercise` is in the logged list (by id, else by name), or -1. */
export function findLoggedExercise(list: LoggedExercise[], exercise: { id?: string; name: string }): number {
  const byId = exercise.id ? list.findIndex((e) => e.exerciseId === exercise.id) : -1;
  if (byId !== -1) return byId;
  const n = exercise.name.trim().toLowerCase();
  return list.findIndex((e) => e.exerciseName.trim().toLowerCase() === n);
}
