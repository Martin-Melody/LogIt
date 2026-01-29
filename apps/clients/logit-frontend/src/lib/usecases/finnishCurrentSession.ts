import { getWorkoutRepo } from "$lib/data/repoProvider";
import { finishSession, type WorkoutSession } from "$lib/domain/workout";

export async function finishCurrentSession(
  session: WorkoutSession,
): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();

  const finished = finishSession(session);

  // Save finished session
  await repo.saveSession(finished);

  // Draft no longer needed
  await repo.clearDraftSession();

  return finished;
}
