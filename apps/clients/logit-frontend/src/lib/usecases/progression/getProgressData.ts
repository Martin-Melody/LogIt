import { getWorkoutRepo, getProgressionRepo } from "$lib/data/repoProvider";
import { getExercises } from "$lib/domain/workout";
import type { ExerciseProgressionState } from "$lib/domain/progression";

export type ProgressDataPoint = {
  sessionId: string;
  date: number;
  maxWeight: number;
  totalVolume: number; // sum of weight × reps for working sets
};

export type ExerciseProgressData = {
  exerciseName: string;
  exerciseId?: string;
  dataPoints: ProgressDataPoint[]; // oldest first
  algorithmState?: ExerciseProgressionState;
};

const HISTORY_LIMIT = 100;
const MIN_SESSIONS_TO_SHOW = 2;

export async function getProgressData(): Promise<ExerciseProgressData[]> {
  const [sessions, algorithmStates] = await Promise.all([
    getWorkoutRepo().listRecentSessions({ limit: HISTORY_LIMIT }),
    getProgressionRepo().listExerciseStates(),
  ]);

  const stateByKey = new Map(algorithmStates.map((s) => [s.key, s]));

  // Group data points by a stable exercise key
  type Accumulator = {
    exerciseName: string;
    exerciseId?: string;
    key: string;
    points: ProgressDataPoint[];
  };

  const byKey = new Map<string, Accumulator>();

  for (const session of sessions) {
    for (const ex of getExercises(session)) {
      const key = ex.exerciseId ?? ex.exerciseName.toLowerCase().trim();

      if (!byKey.has(key)) {
        byKey.set(key, {
          exerciseName: ex.exerciseName,
          exerciseId: ex.exerciseId,
          key,
          points: [],
        });
      }

      const workingSets = ex.sets.filter(
        (s) => s.setType === "normal" || !s.setType,
      );

      if (workingSets.length === 0) continue;

      const maxWeight = Math.max(...workingSets.map((s) => s.weight));
      const totalVolume = workingSets.reduce(
        (sum, s) => sum + s.weight * s.reps,
        0,
      );

      byKey.get(key)!.points.push({
        sessionId: session.id,
        date: session.endedAtMs ?? session.startedAtMs,
        maxWeight,
        totalVolume,
      });
    }
  }

  const result: ExerciseProgressData[] = [];

  for (const acc of byKey.values()) {
    if (acc.points.length < MIN_SESSIONS_TO_SHOW) continue;

    // Sessions come in newest-first; reverse for chronological order
    const dataPoints = [...acc.points].reverse();

    result.push({
      exerciseName: acc.exerciseName,
      exerciseId: acc.exerciseId,
      dataPoints,
      algorithmState: stateByKey.get(acc.key),
    });
  }

  // Sort by most recently trained
  result.sort((a, b) => {
    const aLast = a.dataPoints[a.dataPoints.length - 1]?.date ?? 0;
    const bLast = b.dataPoints[b.dataPoints.length - 1]?.date ?? 0;
    return bLast - aLast;
  });

  return result;
}
