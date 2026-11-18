import { withStartingPlace } from "$lib/features/places/sessionPlace";
import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { ProgramDay } from "@logit/core/domain/CoachProgram";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { programDaySession } from "@logit/core/domain/programDaySession";
import { sourceFromProgramDay } from "@logit/core/domain/sessionHistory";

/**
 * Builds and saves the draft session a coach program day starts (see programDaySession).
 * With the program, the session keeps where it came from and the plan, for the history.
 */
export async function startSessionFromProgramDay(
  day: ProgramDay,
  program?: { id: string; name: string; coachId?: string },
): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();
  const built = programDaySession(day);
  // A coach's program also keeps which coach (whose swap rule applies) and their alternatives.
  const session = withStartingPlace(program ? { ...built, source: sourceFromProgramDay(program, day, built) } : built);
  await repo.saveDraftSession(session);
  return session;
}
