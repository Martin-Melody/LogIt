import type { Exercise, MuscleGroup } from "@logit/core/domain/exercise";
import { CORE_EXERCISES } from "@logit/core/domain/coreExercises";
import type { StrengthBlockData, WorkoutSession } from "@logit/core/domain/workout";
import { estimated1RM } from "@logit/core/domain/oneRepMax";
import { syncApi } from "@logit/core/api/syncApi";

/**
 * What the plan editor knows about exercises: the built-in list, the lifter's own
 * exercises, and every name they've logged, each with how it went last time and its best
 * recent estimated 1RM (for "% of 1RM" loads).
 */

export type ExerciseInfo = {
  name: string;
  id?: string;
  primaryMuscles: MuscleGroup[];
  /** The last session's working sets, e.g. [{ weight: 102.5, reps: 8 }, …]. */
  last: { atMs: number; sets: { weight: number; reps: number }[] } | null;
  /** Best estimated 1RM from the last 12 weeks of logs, kg. */
  e1rmKg: number | null;
};

export type ExerciseIndex = {
  list: ExerciseInfo[];
  get(name: string): ExerciseInfo | undefined;
  search(query: string, limit?: number): ExerciseInfo[];
  /** Lower-case name → best recent e1RM, for programWeekToSplit. */
  e1rmByName(): Map<string, number>;
};

const key = (name: string) => name.trim().toLowerCase();
const TWELVE_WEEKS = 84 * 86_400_000;

async function customExercises(): Promise<Exercise[]> {
  try {
    const { exercises } = await syncApi.pullExercises(0);
    const out: Exercise[] = [];
    for (const r of exercises) {
      if (r.deletedAtMs || !r.dataJson) continue;
      try { out.push(JSON.parse(r.dataJson) as Exercise); } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function loadExerciseIndex(sessions: WorkoutSession[]): Promise<ExerciseIndex> {
  const byKey = new Map<string, ExerciseInfo>();
  const add = (e: Pick<Exercise, "name" | "id" | "primaryMuscles">) => {
    if (!byKey.has(key(e.name))) byKey.set(key(e.name), { name: e.name, id: e.id, primaryMuscles: e.primaryMuscles ?? [], last: null, e1rmKg: null });
  };
  // A custom exercise wins over a built-in of the same name (it's the lifter's own edit).
  for (const e of await customExercises()) add(e);
  for (const e of CORE_EXERCISES) add(e);

  const now = Date.now();
  const finished = sessions.filter((s) => s.endedAtMs != null).sort((a, b) => b.startedAtMs - a.startedAtMs);
  for (const s of finished) {
    for (const b of s.blocks) {
      if (b.type !== "strength") continue;
      const data = b.data as StrengthBlockData;
      const name = data.exerciseName?.trim();
      if (!name) continue;
      let info = byKey.get(key(name));
      if (!info) {
        info = { name, primaryMuscles: [], last: null, e1rmKg: null };
        byKey.set(key(name), info);
      }
      const sets = data.sets
        .filter((x) => (!x.setType || x.setType === "normal") && x.completed !== false && x.reps > 0)
        .map((x) => ({ weight: x.weight || 0, reps: x.reps }));
      if (sets.length === 0) continue;
      // Sessions are newest first, so the first one seen is the last time.
      info.last ??= { atMs: s.startedAtMs, sets };
      if (now - s.startedAtMs <= TWELVE_WEEKS) {
        for (const x of sets) {
          if (x.weight <= 0 || x.reps > 12) continue;
          const e = estimated1RM(x.weight, x.reps);
          if (info.e1rmKg == null || e > info.e1rmKg) info.e1rmKg = Math.round(e * 10) / 10;
        }
      }
    }
  }

  const list = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    list,
    get: (name) => byKey.get(key(name)),
    search(query, limit = 8) {
      const q = key(query);
      if (!q) return [];
      const scored = list
        .map((e) => {
          const n = e.name.toLowerCase();
          const at = n.indexOf(q);
          if (at === -1) return null;
          // Starts-with first, then ones you've done, then the rest.
          return { e, score: (at === 0 ? 0 : 2) + (e.last ? 0 : 1) };
        })
        .filter((x): x is { e: ExerciseInfo; score: number } => x != null)
        .sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name));
      return scored.slice(0, limit).map((x) => x.e);
    },
    e1rmByName() {
      const m = new Map<string, number>();
      for (const e of list) if (e.e1rmKg) m.set(key(e.name), e.e1rmKg);
      return m;
    },
  };
}
