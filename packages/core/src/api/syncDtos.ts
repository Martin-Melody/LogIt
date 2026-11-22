// How the apps put records on the wire for /sync. One place, so the phone's sync and the
// coach sandbox's sample clients send exactly the same shapes.
import type { CheckinSubmission } from "../domain/Checkin";
import { sessionChangedAtMs, type WorkoutSession } from "../domain/workout";
import type { RemoteCheckinSubmission, RemoteSession } from "./syncApi";

export const sessionDto = (session: WorkoutSession): RemoteSession =>
  ({ id: session.id, startedAtMs: session.startedAtMs, updatedAtMs: sessionChangedAtMs(session), dataJson: JSON.stringify(session) });

export const checkinSubmissionDto = (sub: CheckinSubmission, deletedAtMs?: number): RemoteCheckinSubmission => ({
  id: sub.id,
  createdAtMs: sub.createdAtMs,
  updatedAtMs: sub.updatedAtMs,
  dataJson: deletedAtMs ? null : JSON.stringify(sub),
  deletedAtMs,
});

/** Diary days, weights, custom foods, recipes, favourites, meal templates. */
export const nutritionRowDto = <T extends { createdAtMs: number; updatedAtMs: number; deletedAtMs?: number }>(id: string, row: T) => ({
  id,
  createdAtMs: row.createdAtMs,
  updatedAtMs: row.updatedAtMs,
  dataJson: row.deletedAtMs ? null : JSON.stringify(row),
  deletedAtMs: row.deletedAtMs,
});
