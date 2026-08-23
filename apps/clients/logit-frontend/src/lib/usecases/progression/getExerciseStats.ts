import { getExerciseHistory } from "./getExerciseHistory";

export type ExerciseStats = {
  bestSet: { weight: number; reps: number } | null;
  totalSessions: number;
  lastPerformedMs: number | null;
};

export async function getExerciseStats(
  exercise: { id?: string; name: string },
): Promise<ExerciseStats> {
  const { history } = await getExerciseHistory(exercise);
  if (history.length === 0) {
    return { bestSet: null, totalSessions: 0, lastPerformedMs: null };
  }

  const workingSets = history.flatMap((h) =>
    h.sets.filter((s) => s.setType === "normal" || !s.setType),
  );

  const bestSet = workingSets.length
    ? workingSets.reduce((best, s) =>
        s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best,
      )
    : null;

  return {
    bestSet: bestSet ? { weight: bestSet.weight, reps: bestSet.reps } : null,
    totalSessions: history.length,
    lastPerformedMs: history[history.length - 1].performedAtMs,
  };
}
