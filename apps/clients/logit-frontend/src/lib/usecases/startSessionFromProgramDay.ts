import { withStartingPlace } from "$lib/features/places/sessionPlace";
import { getWorkoutRepo } from "$lib/data/repoProvider";
import { PROGRAM_BLOCKS_THIS_APP_RUNS, type ProgramDay } from "@logit/core/domain/CoachProgram";
import { getBlockDeclaration } from "$lib/plugins/blockPluginStore";
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
  // Blocks this app can't run (newer ones, or a plugin that isn't installed) are left out;
  // the day's list says so (program data v2).
  const built = programDaySession(day, { appVersion: PROGRAM_BLOCKS_THIS_APP_RUNS, pluginBlock: getBlockDeclaration });
  // A coach's program also keeps which coach (whose swap rule applies) and their alternatives.
  const session = withStartingPlace(program ? { ...built, source: sourceFromProgramDay(program, day, built) } : built);
  await repo.saveDraftSession(session);
  return session;
}
