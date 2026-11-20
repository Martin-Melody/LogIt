import type { MobilityBlockData, WorkoutSession } from "../../domain/workout";
import { mobilityDrillSlug } from "../../domain/mobilityDrill";
import type {
  MobilityHistoryEntry,
  MobilityProgressionOutput,
} from "../../domain/mobilityProgression";
import { nowMs } from "../../domain/time";
import { DEFAULT_MOBILITY_ALGORITHM_ID } from "./getMobilityProgressionConfig";
import type { ProgressionDeps } from "./deps";
import type { ExerciseProgressionSettings } from "../../domain/progression";
import { drillArea, progressionFor } from "../../domain/mobilityProgressions";
import type { MobilityDrill } from "../../domain/mobilityDrill";
import { mobilityWeekOf } from "../../progression/algorithms/linearMobility";

/** About 10 minutes a week per area (Ingram et al. 2024); the algorithm may use its own. */
export const AREA_WEEKLY_TARGET_SEC = 600;
/** A rep of a rep drill counts for this long toward an area's weekly time. */
const SEC_PER_REP = 3;

/** This week's stretching time for `area`, from every drill in it (finished sets only). */
export function areaWeekSec(sessions: WorkoutSession[], area: string, nowMs: number, catalog?: MobilityDrill[]): number {
  const week = mobilityWeekOf(nowMs);
  let sec = 0;
  for (const s of sessions) {
    if (mobilityWeekOf(s.startedAtMs) !== week) continue;
    for (const b of mobilityBlocksOf(s)) {
      if (drillArea({ id: b.drillId, name: b.drillName }, catalog) !== area) continue;
      for (const set of b.sets) {
        if (!set.completed) continue;
        sec += set.durationSec ?? (set.reps ? set.reps * SEC_PER_REP : 0);
      }
    }
  }
  return sec;
}

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

/** This drill's own algorithm ("Same every time" on one drill), else the general one. */
export async function resolveMobilityAlgorithmId(
  drill: Pick<MobilityDrillRef, "id" | "name">,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<string> {
  const own = await deps.progressionRepo.getExerciseSettings?.(mobilityStateKey(drill)).catch(() => null);
  if (own?.algorithmId && !own.deletedAtMs) return own.algorithmId;
  return (await deps.progressionRepo.getMobilityConfig())?.algorithmId ?? DEFAULT_MOBILITY_ALGORITHM_ID;
}

/**
 * Give one drill its own algorithm, or null to follow the general one. Kept on a progression
 * settings row (keyed like the drill's state), so it syncs. Returns the row, for pushing.
 */
export async function setMobilityDrillAlgorithm(
  drill: Pick<MobilityDrillRef, "id" | "name">,
  algorithmId: string | null,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<ExerciseProgressionSettings | null> {
  const repo = deps.progressionRepo;
  if (!repo.saveExerciseSettings) return null;
  const key = mobilityStateKey(drill);
  const existing = await repo.getExerciseSettings?.(key).catch(() => null);
  const now = nowMs();
  const updatedAtMs = Math.max(now, (existing?.updatedAtMs ?? 0) + 1);
  const row: ExerciseProgressionSettings = algorithmId
    ? { key, exerciseName: drill.name, algorithmId, createdAtMs: existing?.createdAtMs ?? now, updatedAtMs }
    : { key, exerciseName: drill.name, createdAtMs: existing?.createdAtMs ?? now, updatedAtMs, deletedAtMs: now };
  await repo.saveExerciseSettings(row);
  return row;
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
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "mobilityAlgorithmRegistry" | "loadMobilityDrills">,
  plannedTargets?: { sets?: number; durationSec?: number; reps?: number; loadKg?: number },
): Promise<MobilityProgressionOutput | null> {
  const { progressionRepo, workoutRepo, mobilityAlgorithmRegistry: registry } = deps;

  const algorithmId = await resolveMobilityAlgorithmId(drill, deps);
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

  const now = nowMs();
  // The whole catalog (packs, your own drills) when the app has it, else the built-ins.
  const catalog = (await deps.loadMobilityDrills?.().catch(() => null)) ?? undefined;
  const area = drillArea(drill, catalog);
  const progression = progressionFor(drill, catalog);
  return algorithm.suggest({
    drill: area ? { ...drill, area } : drill,
    history,
    state,
    userPreferences,
    plannedTargets,
    now,
    ...(area ? { areaWeek: { area, doneSec: areaWeekSec(recentSessions, area, now, catalog), targetSec: AREA_WEEKLY_TARGET_SEC } } : {}),
    ...(progression ? { progression } : {}),
  });
}

/** Persist the algorithm's `nextState` for a drill after a session finishes. */
export async function applySessionMobilityProgression(
  drill: MobilityDrillRef,
  output: MobilityProgressionOutput,
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  const algorithmId = await resolveMobilityAlgorithmId(drill, deps);
  await deps.progressionRepo.saveExerciseState({
    key: mobilityStateKey(drill),
    exerciseId: drill.id,
    exerciseName: drill.name,
    algorithmId,
    state: output.nextState,
    updatedAtMs: nowMs(),
  });
}

/**
 * The person's answer to the drill's next step: took the next harder cue, "Not yet" (asked
 * again next week), or picked a drill as its next step. Kept in the drill's progression state.
 */
export async function answerMobilityNextStep(
  drill: Pick<MobilityDrillRef, "id" | "name">,
  answer: { kind: "cue" } | { kind: "notYet" } | { kind: "picked"; drill: { id?: string; name: string } },
  deps: Pick<ProgressionDeps, "progressionRepo">,
): Promise<void> {
  const algorithmId = await resolveMobilityAlgorithmId(drill, deps);
  const key = mobilityStateKey(drill);
  const saved = await deps.progressionRepo.getExerciseState(key);
  const state = { ...((saved?.algorithmId === algorithmId ? saved.state : null) ?? { streak: {} }) } as {
    cueStep?: number; declinedWeek?: string; picked?: { id?: string; name: string }[];
  };
  if (answer.kind === "cue") state.cueStep = (state.cueStep ?? 0) + 1;
  if (answer.kind === "notYet") state.declinedWeek = mobilityWeekOf(nowMs());
  if (answer.kind === "picked") state.picked = [...(state.picked ?? []).filter((d) => d.name !== answer.drill.name), answer.drill];
  await deps.progressionRepo.saveExerciseState({
    key, exerciseId: drill.id, exerciseName: drill.name, algorithmId, state, updatedAtMs: nowMs(),
  });
}

export async function refreshMobilityProgressionState(
  drill: MobilityDrillRef,
  deps: Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "mobilityAlgorithmRegistry">,
): Promise<void> {
  const output = await getMobilitySuggestion(drill, deps);
  if (output) await applySessionMobilityProgression(drill, output, deps);
}
