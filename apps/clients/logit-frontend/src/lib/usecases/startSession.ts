import { withStartingPlace } from "$lib/features/places/sessionPlace";
import { getWorkoutRepo } from "$lib/data/repoProvider";
import { createSession } from "@logit/core/domain/workout";

export async function startSession(): Promise<
  ReturnType<typeof createSession>
> {
  const repo = getWorkoutRepo();

  const session = withStartingPlace(createSession());

  await repo.saveDraftSession(session);

  return session;
}
