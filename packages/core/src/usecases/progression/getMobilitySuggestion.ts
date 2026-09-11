import type { MobilityBlockData, WorkoutSession } from "../../domain/workout";
import { mobilityDrillSlug } from "../../domain/mobilityDrill";
import type {
  MobilityHistoryEntry,
  MobilityProgressionOutput,
} from "../../domain/mobilityProgression";
import { nowMs } from "../../domain/time";
import { DEFAULT_MOBILITY_ALGORITHM_ID } from "./getMobilityProgressionConfig";
import type { ProgressionDeps } from "./deps";

const HISTORY_WINDOW = 20;

export type MobilityDrillRef = {
  id?: string;
  name: string;
  metric: MobilityBlockData["metric"];
  perSide: boolean;
  area?: string;
};

export function mobilityStateKey(drill: Pick<MobilityDrillRef, "id" | "name">): string {
  return `mobility::${drill.id || mobilityDrillSlug(drill.name)}`;
}

function mobilityBlocksOf(session: WorkoutSession): MobilityBlockData[] {
  return session.blocks
    .filter((b) => b.type === "mobility")
    .map((b) => b.data as MobilityBlockData);
}

function drillMatches(data: MobilityBlockData, drill: MobilityDrillRef): boolean {
  if (drill.id && data.drillId) return data.drillId === drill.id;
  return data.drillName.toLowerCase().trim() === drill.name.toLowerCase().trim();
}

export function buildMobilityHistory(
  sessions: WorkoutSession[],
  drill: MobilityDrillRef,
): MobilityHistoryEntry[] {
  return sessions
    .filter((s) => !s.excludeFromProgression)
    .flatMap((session) => {
      const match = mobilityBlocksOf(session).find((d) => drillMatches(d, drill));
      if (!match) return [];
      return [
        {
          sessionId: session.id,
          performedAtMs: session.endedAtMs ?? session.startedAtMs,
          sets: match.sets.map((s) => ({
            side: s.side,
            durationSec: s.durationSec,
            reps: s.reps,
            loadKg: s.loadKg,
            targetSec: s.targetSec,
            depth: s.depth,
            completed: s.completed,
          })),
        } satisfies MobilityHistoryEntry,
      ];
    })
    .sort((a, b) => b.performedAtMs - a.performedAtMs);
}

export async function getMobilitySuggestion(
  drill: MobilityDrillRef,
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "mobilityAlgorithmRegistry">,
  plannedTargets?: { sets?: number; durationSec?: number; reps?: number; loadKg?: number },
): Promise<MobilityProgressionOutput | null> {
  const { progressionRepo, workoutRepo, mobilityAlgorithmRegistry: registry } = deps;

  const config = await progressionRepo.getMobilityConfig();
  const algorithmId = config?.algorithmId ?? DEFAULT_MOBILITY_ALGORITHM_ID;
  const algorithm = await registry.get(algorithmId);
  if (!algorithm) return null;

  const key = mobilityStateKey(drill);
  const saved = await progressionRepo.getExerciseState(key);
  const state =
    saved?.algorithmId === algorithmId ? saved.state : algorithm.defaultState;

  const recentSessions = await workoutRepo.listRecentSessions({ limit: HISTORY_WINDOW });
  const history = buildMobilityHistory(recentSessions, drill);

  const storedPrefs = await progressionRepo.getAlgorithmPreferences(algorithmId);
  const userPreferences = storedPrefs ?? algorithm.defaultPreferences ?? {};

  return algorithm.suggest({
    drill,
    history,
    state,
    userPreferences,
    plannedTargets,
    now: nowMs(),
  });
}

/** Persist the algorithm's `nextState` for a drill after a session finishes. */
export async function applySessionMobilityProgression(
  drill: MobilityDrillRef,
  output: MobilityProgressionOutput,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  const config = await deps.progressionRepo.getMobilityConfig();
  const algorithmId = config?.algorithmId ?? DEFAULT_MOBILITY_ALGORITHM_ID;
  await deps.progressionRepo.saveExerciseState({
    key: mobilityStateKey(drill),
    exerciseId: drill.id,
    exerciseName: drill.name,
    algorithmId,
    state: output.nextState,
    updatedAtMs: nowMs(),
  });
}

export async function refreshMobilityProgressionState(
  drill: MobilityDrillRef,
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "mobilityAlgorithmRegistry">,
): Promise<void> {
  const output = await getMobilitySuggestion(drill, deps);
  if (output) await applySessionMobilityProgression(drill, output, deps);
}
