import { withStartingPlace } from "$lib/features/places/sessionPlace";
import { getCoachProgramRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { getProgramProgress, PROGRAM_BLOCKS_THIS_APP_RUNS, type ProgramDay } from "@logit/core/domain/CoachProgram";
import { estimatesFrom, planForWeek } from "@logit/core/domain/programPlan";
import { getBlockDeclaration } from "$lib/plugins/blockPluginStore";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { programDaySession } from "@logit/core/domain/programDaySession";
import { sourceFromProgramDay } from "@logit/core/domain/sessionHistory";

/**
 * Builds and saves the draft session a coach program day starts (see programDaySession).
 * With the program, the session keeps where it came from and the plan, for the history.
 */
async function weekPlan(programId: string) {
  const full = await getCoachProgramRepo().getAssignedProgram(programId);
  if (!full || (full.rule?.kind ?? "fixed") === "fixed" && !full.weeks.some((w) => w.lighter)) return undefined;
  const progress = getProgramProgress(full);
  if (progress.status !== "running") return undefined;
  const estimates = estimatesFrom(await repo().listAllSessions());
  return planForWeek(full, progress.weekNumber, { e1rm: (name) => estimates.get(name.trim().toLowerCase()) ?? null });
}
const repo = () => getWorkoutRepo();

export async function startSessionFromProgramDay(
  day: ProgramDay,
  program?: { id: string; name: string; coachId?: string },
): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();
  // Blocks this app can't run (newer ones, or a plugin that isn't installed) are left out;
  // the day's list says so (program data v2). The program's rule plans this week's numbers from
  // their own lifts (canvas PG3/PG4); without a rule, or before it starts, the typed ones.
  const plan = program ? await weekPlan(program.id).catch(() => undefined) : undefined;
  const built = programDaySession(day, { appVersion: PROGRAM_BLOCKS_THIS_APP_RUNS, pluginBlock: getBlockDeclaration, plan });
  // A coach's program also keeps which coach (whose swap rule applies) and their alternatives.
  const session = withStartingPlace(program ? { ...built, source: sourceFromProgramDay(program, day, built) } : built);
  await repo.saveDraftSession(session);
  return session;
}
