// What a weight-finding phase found (Phase 6.9, canvas SP4): each main exercise's top set in the
// phase's weeks, its estimated max and how sure that is. The coach checks it on Today; what they
// change goes in the program's handoffs, and the next phase plans from it (withHandoffs).
import { getProgramStartMs, inWeek, type CoachProgram, type ProgramPhase } from "./CoachProgram";
import { loggedExercises } from "./loggedSets";
import { estimated1RM } from "./oneRepMax";
import type { WorkoutSession } from "./workout";

const WEEK = 7 * 86_400_000;

export type FoundWeight = {
  exerciseName: string;
  top: { weight: number; reps: number; rpe?: number } | null;
  e1rm: number | null;
  /** sure: a hard set (RPE 8+ or unknown effort at 3–10 reps); rough: an easy set or high reps; skipped: not done. */
  how: "sure" | "rough" | "skipped";
};

export function foundWeights(program: CoachProgram, phase: ProgramPhase, sessions: WorkoutSession[]): FoundWeight[] {
  const start = getProgramStartMs(program);
  const from = start != null ? start + (phase.weeks.from - 1) * WEEK : 0;
  const to = start != null ? start + phase.weeks.to * WEEK : 0;
  const mine = sessions.filter((s) => s.source?.parentId === program.id && (s.startedAtMs ?? 0) >= from && (s.startedAtMs ?? 0) < to);
  // The phase's strength exercises, in day order, once each.
  const names: string[] = [];
  const week = program.weeks.find((w) => w.weekNumber === phase.weeks.from) ?? program.weeks[0];
  for (const d of [...(week?.days ?? [])].sort((a, b) => a.orderIndex - b.orderIndex)) {
    for (const b of [...d.blocks].sort((a, c) => a.orderIndex - c.orderIndex)) {
      if (b.type === "strength" && inWeek(b, phase.weeks.from) && (b.measure ?? "weight") !== "time" && b.measure !== "distance" && !names.includes(b.exerciseName)) names.push(b.exerciseName);
    }
  }
  return names.map((name) => {
    let top: FoundWeight["top"] = null;
    let best = 0;
    for (const s of mine) for (const ex of loggedExercises(s)) {
      if (ex.exerciseName.trim().toLowerCase() !== name.trim().toLowerCase()) continue;
      for (const set of ex.sets) {
        if (set.setType === "warmup" || set.reps < 1 || set.weight <= 0) continue;
        const e = estimated1RM(set.weight, set.reps);
        if (e > best) { best = e; top = { weight: set.weight, reps: set.reps, ...(set.rpe ? { rpe: set.rpe } : {}) }; }
      }
    }
    if (!top) return { exerciseName: name, top: null, e1rm: null, how: "skipped" };
    const hard = top.rpe != null ? top.rpe >= 8 : top.reps >= 3 && top.reps <= 10;
    return { exerciseName: name, top, e1rm: Math.round(best), how: hard && top.reps <= 12 ? "sure" : "rough" };
  });
}
