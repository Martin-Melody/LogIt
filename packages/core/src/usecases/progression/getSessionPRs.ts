import { getExercises } from "../../domain/workout";
import type { WorkoutSession, SetEntry } from "../../domain/workout";
import { getExerciseStats } from "./getExerciseStats";
import type { ProgressionDeps } from "./deps";

export type SessionPR = {
  exerciseName: string;
  exerciseId?: string;
  weight: number;
  reps: number;
  /** "weight" = heaviest ever, "reps" = most reps at that weight, "first" = debut. */
  kind: "weight" | "reps" | "first";
};

function bestWorkingSet(sets: SetEntry[]): SetEntry | null {
  const working = sets.filter((s) => (s.setType === "normal" || !s.setType) && (s.reps > 0 || s.weight > 0));
  if (working.length === 0) return null;
  return working.reduce((best, s) =>
    s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best,
  );
}

/**
 * Personal records set in this (not-yet-saved) session — compares each
 * exercise's best working set against its stored history. Emotional payload
 * for the finish screen; also usable by a "PRs" widget.
 */
export async function getSessionPRs(
  session: WorkoutSession,
  deps: Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo">,
): Promise<SessionPR[]> {
  const prs: SessionPR[] = [];

  for (const ex of getExercises(session)) {
    const best = bestWorkingSet(ex.sets);
    if (!best) continue;

    const stats = await getExerciseStats(
      { id: ex.exerciseId, name: ex.exerciseName },
      deps,
    );
    const prev = stats.bestSet;

    if (!prev) {
      prs.push({ exerciseName: ex.exerciseName, exerciseId: ex.exerciseId, weight: best.weight, reps: best.reps, kind: "first" });
    } else if (best.weight > prev.weight) {
      prs.push({ exerciseName: ex.exerciseName, exerciseId: ex.exerciseId, weight: best.weight, reps: best.reps, kind: "weight" });
    } else if (best.weight === prev.weight && best.reps > prev.reps) {
      prs.push({ exerciseName: ex.exerciseName, exerciseId: ex.exerciseId, weight: best.weight, reps: best.reps, kind: "reps" });
    }
  }

  return prs;
}
