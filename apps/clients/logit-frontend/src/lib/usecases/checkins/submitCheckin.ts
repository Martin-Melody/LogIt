import { getCheckinRepo } from "$lib/data/repoProvider";
import { pushCheckinSubmission } from "$lib/sync/syncService";
import type { CheckinSubmission } from "@logit/core/domain/Checkin";

/** Persist a check-in submission (draft or submitted) locally, then sync it to the coach
 * (queued if offline). The submission carries its own updatedAtMs. */
export async function saveCheckinSubmission(submission: CheckinSubmission): Promise<void> {
  await getCheckinRepo().saveSubmission(submission);
  pushCheckinSubmission(submission);
}
