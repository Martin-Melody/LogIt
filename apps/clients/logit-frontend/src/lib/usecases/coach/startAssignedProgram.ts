import { getCoachProgramRepo } from "$lib/data/repoProvider";
import { pushProgramStart } from "$lib/sync/syncService";
import { assignedPrograms } from "$lib/stores/assignedPrograms.store";
import { startOfLocalDayMs, type CoachProgram } from "@logit/core/domain/CoachProgram";

/**
 * The client taps Start on a coach program: today becomes week 1, day 1. Saved locally first
 * so it works offline, then sent to the server (queued if offline). A program that already
 * has a start keeps it.
 */
export async function startAssignedProgram(programId: string): Promise<CoachProgram | null> {
  const repo = getCoachProgramRepo();
  const program = await repo.getAssignedProgram(programId);
  if (!program) return null;
  if (program.clientStartedAtMs != null) return program;

  const started: CoachProgram = { ...program, clientStartedAtMs: startOfLocalDayMs() };
  await repo.upsertFromRemote(started);
  pushProgramStart(programId, started.clientStartedAtMs!);
  void assignedPrograms.refresh();
  return started;
}
