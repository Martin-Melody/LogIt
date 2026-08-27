import type { CheckinSchedule, CheckinSubmission } from "../domain/Checkin";

/** Read-only view of check-in schedules a coach has assigned to the current user, kept up
 * to date by the sync loop. The user answers them via CheckinSubmissions (their own data). */
export interface AssignedCheckinRepo {
  listAssignedSchedules(): Promise<CheckinSchedule[]>;
  getAssignedSchedule(id: string): Promise<CheckinSchedule | null>;

  // ── Submissions (the user's own answers) ──
  listSubmissions(scheduleId?: string): Promise<CheckinSubmission[]>;
  getSubmission(id: string): Promise<CheckinSubmission | null>;
  saveSubmission(submission: CheckinSubmission): Promise<void>;

  // ── Sync-merge surface (schedules only — submissions merge like sessions) ──
  upsertScheduleFromRemote(schedule: CheckinSchedule): Promise<void>;
  removeScheduleFromRemote(id: string): Promise<void>;
  upsertSubmissionFromRemote(submission: CheckinSubmission): Promise<void>;
  removeSubmissionFromRemote(id: string): Promise<void>;
  listSubmissionsForPush(): Promise<CheckinSubmission[]>;
}

export interface ListMySchedulesOptions {
  recipientId?: string;
  templates?: boolean;
}

export type MyCheckinSchedule = {
  schedule: CheckinSchedule;
  recipientUserId: string | null;
};

/** Coach-side authoring of check-in schedules. */
export interface CheckinAuthoringRepo {
  listMySchedules(options?: ListMySchedulesOptions): Promise<MyCheckinSchedule[]>;
  getMySchedule(scheduleId: string): Promise<MyCheckinSchedule | null>;
  saveSchedule(schedule: CheckinSchedule, recipientUsername?: string): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;
}
