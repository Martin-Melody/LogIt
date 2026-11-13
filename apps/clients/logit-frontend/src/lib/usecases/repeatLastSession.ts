import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { repeatSession } from "@logit/core/domain/repeatSession";

/**
 * Clone the most recent finished session into a fresh draft (see core repeatSession).
 * Returns null when there is no previous session to repeat.
 */
export async function repeatLastSession(): Promise<WorkoutSession | null> {
  const [recent] = await getWorkoutRepo().listRecentSessions({ limit: 1 });
  return recent ? repeatPastSession(recent) : null;
}

/** Start a copy of a past session as the in-progress workout. */
export async function repeatPastSession(past: WorkoutSession): Promise<WorkoutSession> {
  const session = repeatSession(past);
  await getWorkoutRepo().saveDraftSession(session);
  return session;
}
