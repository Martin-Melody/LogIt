import type {
  AnalyticsMetricDefinition,
  AnalyticsOutput,
  MobilitySessionSummary,
} from "../../domain/analytics";
import type { MobilityBlockData } from "../../domain/workout";
import { resolveAnalyticsId } from "./getAnalyticsConfig";
import { getExerciseHistory } from "./getExerciseHistory";
import type { ProgressionDeps } from "./deps";

const MOBILITY_HISTORY_WINDOW = 60;

async function loadMobilitySessions(
  deps: Pick<ProgressionDeps, "workoutRepo">,
): Promise<MobilitySessionSummary[]> {
  const sessions = await deps.workoutRepo.listRecentSessions({ limit: MOBILITY_HISTORY_WINDOW });
  const out: MobilitySessionSummary[] = [];
  for (const s of sessions) {
    for (const b of s.blocks) {
      if (b.type !== "mobility") continue;
      const d = b.data as MobilityBlockData;
      out.push({
        sessionId: s.id,
        performedAtMs: s.endedAtMs ?? s.startedAtMs,
        drillName: d.drillName,
        metric: d.metric,
        perSide: d.perSide,
        sets: d.sets.map((set) => ({
          side: set.side,
          durationSec: set.durationSec,
          reps: set.reps,
          loadKg: set.loadKg,
          targetSec: set.targetSec,
          depth: set.depth,
          completed: set.completed,
        })),
      });
    }
  }
  return out.sort((a, b) => a.performedAtMs - b.performedAtMs);
}

export type ExerciseAnalyticsResult = {
  output: AnalyticsOutput;
  metricDefinitions: AnalyticsMetricDefinition[];
};

export async function getExerciseAnalytics(
  exercise: { id?: string; name: string },
  deps: Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo" | "progressionRepo" | "analyticsRegistry">,
): Promise<ExerciseAnalyticsResult | null> {
  const [{ history, exerciseData }, analyticsId, mobilitySessions] = await Promise.all([
    getExerciseHistory(exercise, deps),
    resolveAnalyticsId(deps),
    loadMobilitySessions(deps),
  ]);

  const plugin = await deps.analyticsRegistry.get(analyticsId);
  if (!plugin) return null;
  if (history.length === 0) return null;

  const exerciseWithType = {
    ...exercise,
    exerciseType: exerciseData?.exerciseType,
  };

  const output = await plugin.compute({
    exercise: exerciseWithType,
    history,
    ...(mobilitySessions.length ? { mobilitySessions } : {}),
  });
  return { output, metricDefinitions: plugin.metricDefinitions };
}
