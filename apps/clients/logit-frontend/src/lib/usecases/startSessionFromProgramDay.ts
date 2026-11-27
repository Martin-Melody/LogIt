import { withStartingPlace } from "$lib/features/places/sessionPlace";
import { getCoachProgramRepo, getWorkoutRepo } from "$lib/data/repoProvider";
import { getProgramProgress, PROGRAM_BLOCKS_THIS_APP_RUNS, ruleFor, type CoachProgram, type ProgramDay } from "@logit/core/domain/CoachProgram";
import { cellFromSuggestion, estimatesFrom, lastTimeCell, planForWeek, type PlanCell } from "@logit/core/domain/programPlan";
import { getSuggestion } from "@logit/core/usecases/progression/getSuggestion";
import { getProgressionDeps } from "./progressionDeps";
import { activeLastingSwaps, applyLastingSwaps } from "@logit/core/domain/swaps";
import { getBlockDeclaration } from "$lib/plugins/blockPluginStore";
import type { WorkoutSession } from "@logit/core/domain/workout";
import { programDaySession } from "@logit/core/domain/programDaySession";
import { sourceFromProgramDay } from "@logit/core/domain/sessionHistory";

/**
 * Builds and saves the draft session a coach program day starts (see programDaySession).
 * With the program, the session keeps where it came from and the plan, for the history.
 */
async function weekPlan(full: CoachProgram, day: ProgramDay, weekNumber: number) {
  const ruled = (full.rule?.kind ?? "fixed") !== "fixed" || full.weeks.some((w) => w.lighter)
    || day.blocks.some((b) => b.type === "strength" && b.rule && b.rule.kind !== "fixed");
  if (!ruled) return undefined;
  const sessions = await repo().listAllSessions();
  const estimates = estimatesFrom(sessions);
  const base = planForWeek(full, weekNumber, { e1rm: (name) => estimates.get(name.trim().toLowerCase()) ?? null });
  // A plugin rule runs its plugin here (canvas PG8); without it, the same as last time.
  const fromPlugins = new Map<string, PlanCell | null>();
  for (const b of day.blocks) {
    if (b.type !== "strength") continue;
    const rule = ruleFor(full, b);
    if (rule.kind !== "plugin") continue;
    const sets = b.sets.filter((s) => s.setType !== "warmup").length || b.sets.length;
    const deps = getProgressionDeps();
    const algorithm = await deps.algorithmRegistry.get(rule.pluginId).catch(() => null);
    const out = algorithm
      ? await getSuggestion({ id: b.exerciseId, name: b.exerciseName }, deps, undefined, undefined, undefined, algorithm).catch(() => null)
      : null;
    fromPlugins.set(b.id, cellFromSuggestion(out) ?? lastTimeCell(b.exerciseName, sessions, sets));
  }
  return (blockId: string) => (fromPlugins.has(blockId) ? fromPlugins.get(blockId)! : base(blockId));
}
const repo = () => getWorkoutRepo();

async function lastingFor(programId: string) {
  const full = await getCoachProgramRepo().getAssignedProgram(programId);
  return full ? activeLastingSwaps(full, await repo().listAllSessions()) : [];
}

export async function startSessionFromProgramDay(
  day: ProgramDay,
  program?: { id: string; name: string; coachId?: string },
): Promise<WorkoutSession> {
  const repo = getWorkoutRepo();
  // Blocks this app can't run (newer ones, or a plugin that isn't installed) are left out;
  // the day's list says so (program data v2). The program's rule plans this week's numbers from
  // their own lifts (canvas PG3/PG4); without a rule, or before it starts, the typed ones.
  const full = program ? await getCoachProgramRepo().getAssignedProgram(program.id).catch(() => null) : null;
  const progress = full ? getProgramProgress(full) : null;
  const weekNumber = progress?.status === "running" ? progress.weekNumber : 1;
  const plan = full && progress?.status === "running" ? await weekPlan(full, day, weekNumber).catch(() => undefined) : undefined;
  // Their swaps "for the rest of the program" (canvas SW1), unless the coach kept or put them back.
  const lasting = program ? await lastingFor(program.id).catch(() => []) : [];
  const built = programDaySession(applyLastingSwaps(day, lasting), { appVersion: PROGRAM_BLOCKS_THIS_APP_RUNS, pluginBlock: getBlockDeclaration, plan, weekNumber });
  // A coach's program also keeps which coach (whose swap rule applies) and their alternatives.
  const session = withStartingPlace(program ? { ...built, source: sourceFromProgramDay(program, day, built) } : built);
  await repo.saveDraftSession(session);
  return session;
}
