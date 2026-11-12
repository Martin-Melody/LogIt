import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { ProgramDay } from "@logit/core/domain/CoachProgram";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { programDaySession } from "@logit/core/domain/programDaySession";

/** Builds and saves the draft session a coach program day starts (see programDaySession). */
export async function startSessionFromProgramDay(day: ProgramDay): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();
  const session = programDaySession(day);
  await repo.saveDraftSession(session);
  return session;
}
