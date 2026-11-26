import { blockDisplayName, type StrengthBlockData, type WorkoutSession } from "./workout";
import { bestWorkingSet } from "./sessionHistory";
import { estimated1RM } from "./oneRepMax";

/** One exercise you've done, with your best set (by estimated 1RM) and when you last did it. */
export type ExerciseHit = { id: string; name: string; weight: number; reps: number; e1rm: number; lastMs: number };

/** Every exercise in these sessions, most recently done first (web ⌘K, canvas board 10). */
export function exerciseIndex(sessions: WorkoutSession[]): ExerciseHit[] {
  const byId = new Map<string, ExerciseHit>();
  for (const s of sessions) {
    for (const b of s.blocks) {
      if (b.type !== "strength") continue;
      const data = b.data as StrengthBlockData;
      if (!data.exerciseId) continue;
      const best = bestWorkingSet(data.sets);
      const e1rm = best && best.weight > 0 ? estimated1RM(best.weight, best.reps) : 0;
      const hit = byId.get(data.exerciseId) ?? { id: data.exerciseId, name: blockDisplayName(b), weight: 0, reps: 0, e1rm: 0, lastMs: 0 };
      if (best && e1rm > hit.e1rm) Object.assign(hit, { weight: best.weight, reps: best.reps, e1rm });
      if (s.startedAtMs > hit.lastMs) Object.assign(hit, { lastMs: s.startedAtMs, name: blockDisplayName(b) });
      byId.set(data.exerciseId, hit);
    }
  }
  return [...byId.values()].sort((a, b) => b.lastMs - a.lastMs);
}

/** Exercises whose name has every word typed, names starting with it first. */
export function findExercises(index: ExerciseHit[], query: string, limit = 5): ExerciseHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index
    .filter((e) => words.every((w) => e.name.toLowerCase().includes(w)))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(words[0]!)) - Number(a.name.toLowerCase().startsWith(words[0]!)))
    .slice(0, limit);
}
