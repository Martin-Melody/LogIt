import { getAuthoredProgramRepo } from "$lib/data/repoProvider";
import { pushCoachProgram } from "$lib/sync/syncService";
import { touchCoachProgram, type CoachProgram } from "@logit/core/domain/CoachProgram";

/** Persist an authored coach program locally, then push it to the server (queued if offline).
 * Pass `recipientUsername` to assign/reassign it; omit to keep the current assignment. */
export async function saveAuthoredProgram(
  program: CoachProgram,
  recipientUsername?: string,
): Promise<CoachProgram> {
  const touched = touchCoachProgram(program);
  const repo = getAuthoredProgramRepo();
  await repo.saveProgram(touched, recipientUsername);
  const assignedTo = recipientUsername ?? (await repo.recipientUsernameOf(touched.id));
  pushCoachProgram(touched, assignedTo);
  return touched;
}
