import { getAuthoredProgramRepo } from "$lib/data/repoProvider";
import { pushCoachProgram } from "$lib/sync/syncService";

/** Soft-delete an authored program locally and push a tombstone to the server. */
export async function deleteAuthoredProgram(programId: string): Promise<void> {
  const repo = getAuthoredProgramRepo();
  const existing = await repo.getMyProgram(programId);
  const recipient = await repo.recipientUsernameOf(programId);
  await repo.deleteProgram(programId);
  if (existing) {
    pushCoachProgram({ ...existing.program, updatedAtMs: Date.now() }, recipient, true);
  }
}
