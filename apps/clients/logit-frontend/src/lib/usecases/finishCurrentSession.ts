import { getWorkoutRepo } from "$lib/data/repoProvider";
import { clearRest, dropUnloggedPlannedSets, finishSession, getRunningRests, type WorkoutSession } from "@logit/core/domain/workout";
import { pushSession } from "$lib/sync/syncService";

export async function finishCurrentSession(
  session: WorkoutSession,
): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();

  // Planned sets that were never done aren't part of the workout.
  // A rest still running when the workout ends is over: the rest service stops following it
  // once the session clears, and the saved workout shouldn't keep a half-finished rest.
  let ended = dropUnloggedPlannedSets(session);
  for (const rest of getRunningRests(ended, {})) ended = clearRest(ended, rest.setId);
  const finished = finishSession(ended);

  await repo.saveSession(finished);
  await repo.clearDraftSession();

  pushSession(finished);

  return finished;
}
