import { getWorkoutRepo } from "$lib/data/repoProvider";
import { getExercises } from "@logit/core/domain/workout";
import type { MobilityBlockData, WorkoutSession } from "@logit/core/domain/workout";
import { refreshProgressionState } from "@logit/core/usecases/progression/getSuggestion";
import { refreshMobilityProgressionState } from "@logit/core/usecases/progression/getMobilitySuggestion";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { pushSession } from "$lib/sync/syncService";

/**
 * Save a changed past session, send it to the server, and redo the progression of every
 * exercise and drill it had before or has now (one taken out no longer counts either).
 */
export async function editSession(session: WorkoutSession, before?: WorkoutSession | null): Promise<void> {
  await saveSessionDetails(session);
  const deps = getProgressionDeps();
  const both = [before, session].filter((s): s is WorkoutSession => !!s);

  const strength = new Map<string, { id?: string; name: string }>();
  const drills = new Map<string, { id?: string; name: string; metric: MobilityBlockData["metric"]; perSide: boolean }>();
  for (const s of both) {
    for (const ex of getExercises(s)) strength.set(ex.exerciseId ?? ex.exerciseName.toLowerCase(), { id: ex.exerciseId, name: ex.exerciseName });
    for (const b of s.blocks) {
      if (b.type !== "mobility") continue;
      const d = b.data as MobilityBlockData;
      drills.set(`${d.drillId ?? d.drillName.toLowerCase()}:${d.metric}`, { id: d.drillId, name: d.drillName, metric: d.metric, perSide: d.perSide });
    }
  }
  await Promise.all([
    ...[...strength.values()].map((ex) => refreshProgressionState(ex, deps).catch(() => undefined)),
    ...[...drills.values()].map((d) => refreshMobilityProgressionState(d, deps).catch(() => undefined)),
  ]);
}

/** Save a past session where nothing that progression reads changed (name, note). */
export async function saveSessionDetails(session: WorkoutSession): Promise<void> {
  await getWorkoutRepo().saveSession(session);
  pushSession(session);
}
