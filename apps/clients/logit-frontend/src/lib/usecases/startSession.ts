import { getWorkoutRepo } from "$lib/data/repoProvider";
import { createSession } from "$lib/domain/workout";

export async function startSession(): Promise<
  ReturnType<typeof createSession>
> {
  const repo = getWorkoutRepo();

  const session = createSession();

  await repo.saveDraftSession(session);

  return session;
}
