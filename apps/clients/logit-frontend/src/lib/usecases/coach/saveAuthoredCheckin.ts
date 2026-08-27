import { getAuthoredCheckinRepo } from "$lib/data/repoProvider";
import { pushCheckinSchedule } from "$lib/sync/syncService";
import { touchCheckinSchedule, type CheckinSchedule } from "@logit/core/domain/Checkin";

/** Persist a coach-authored check-in schedule locally, then push it (queued if offline). */
export async function saveAuthoredCheckin(
  schedule: CheckinSchedule,
  recipientUsername?: string,
): Promise<CheckinSchedule> {
  const touched = touchCheckinSchedule(schedule);
  const repo = getAuthoredCheckinRepo();
  await repo.saveSchedule(touched, recipientUsername);
  const assignedTo = recipientUsername ?? (await repo.recipientUsernameOf(touched.id));
  pushCheckinSchedule(touched, assignedTo);
  return touched;
}
