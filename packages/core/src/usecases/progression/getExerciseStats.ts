import { getExerciseHistory } from "./getExerciseHistory";
import { estimated1RM } from "../../domain/oneRepMax";
import type { ProgressionDeps } from "./deps";

export type ExerciseStats = {
  bestSet: { weight: number; reps: number } | null;
  /** Highest estimated 1RM (Epley) across any working set in history, or null with no history. */
  bestEstimated1RM: number | null;
  totalSessions: number;
  lastPerformedMs: number | null;
};

export async function getExerciseStats(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo">,
): Promise<ExerciseStats> {
  const { history } = await getExerciseHistory(exercise, deps);
  if (history.length === 0) {
    return { bestSet: null, bestEstimated1RM: null, totalSessions: 0, lastPerformedMs: null };
  }

  const workingSets = history.flatMap((h) =>
    h.sets.filter((s) => s.setType === "normal" || !s.setType),
  );

  const bestSet = workingSets.length
    ? workingSets.reduce((best, s) =>
        s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best,
      )
    : null;

  const bestEstimated1RM = workingSets.length
    ? Math.max(...workingSets.map((s) => estimated1RM(s.weight, s.reps)))
    : null;

  return {
    bestSet: bestSet ? { weight: bestSet.weight, reps: bestSet.reps } : null,
    bestEstimated1RM: bestEstimated1RM ? Math.round(bestEstimated1RM * 10) / 10 : null,
    totalSessions: history.length,
    lastPerformedMs: history[history.length - 1].performedAtMs,
  };
}
