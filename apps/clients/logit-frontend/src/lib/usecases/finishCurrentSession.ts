import { getWorkoutRepo } from "$lib/data/repoProvider";
import { dropUnloggedPlannedSets, finishSession, type WorkoutSession } from "@logit/core/domain/workout";
import { pushSession } from "$lib/sync/syncService";

export async function finishCurrentSession(
  session: WorkoutSession,
): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();

  // Planned sets that were never done aren't part of the workout.
  const finished = finishSession(dropUnloggedPlannedSets(session));

  await repo.saveSession(finished);
  await repo.clearDraftSession();

  pushSession(finished);

  return finished;
}
