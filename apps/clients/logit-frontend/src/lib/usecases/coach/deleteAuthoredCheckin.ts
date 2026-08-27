import { getAuthoredCheckinRepo } from "$lib/data/repoProvider";
import { pushCheckinSchedule } from "$lib/sync/syncService";

/** Soft-delete a coach-authored check-in schedule and push a tombstone. */
export async function deleteAuthoredCheckin(scheduleId: string): Promise<void> {
  const repo = getAuthoredCheckinRepo();
  const existing = await repo.getMySchedule(scheduleId);
  const recipient = await repo.recipientUsernameOf(scheduleId);
  await repo.deleteSchedule(scheduleId);
  if (existing) {
    pushCheckinSchedule({ ...existing.schedule, updatedAtMs: Date.now() }, recipient, true);
  }
}
