import { getWorkoutRepo } from "$lib/data/repoProvider";
import { finishSession, type WorkoutSession } from "$lib/domain/workout";
import { pushSession } from "$lib/sync/syncService";

export async function finishCurrentSession(
  session: WorkoutSession,
): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();

  const finished = finishSession(session);

  await repo.saveSession(finished);
  await repo.clearDraftSession();

  pushSession(finished);

  return finished;
}
