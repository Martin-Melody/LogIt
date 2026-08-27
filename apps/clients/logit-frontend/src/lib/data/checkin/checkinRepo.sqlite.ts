import type { AssignedCheckinRepo } from "@logit/core/data/checkinRepo";
import type { CheckinSchedule, CheckinSubmission } from "@logit/core/domain/Checkin";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { nowMs } from "@logit/core/domain/time";

function parse<T>(json: string): T | null {
  try { return JSON.parse(json) as T; } catch { return null; }
}

export function createSqliteCheckinRepo(): AssignedCheckinRepo {
  return {
    async listAssignedSchedules(): Promise<CheckinSchedule[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json FROM checkin_schedules WHERE owner_id = ? OR owner_id IS NULL
         ORDER BY updated_at_ms DESC`,
        [getActiveOwnerId()],
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse<CheckinSchedule>(r.data_json))
        .filter((s): s is CheckinSchedule => s !== null && !s.archived);
    },

    async getAssignedSchedule(id: string): Promise<CheckinSchedule | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json FROM checkin_schedules WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)`,
        [id, getActiveOwnerId()],
      );
      const row = (res.values?.[0] as { data_json: string } | undefined) ?? null;
      return row ? parse<CheckinSchedule>(row.data_json) : null;
    },

    async listSubmissions(scheduleId?: string): Promise<CheckinSubmission[]> {
      const db = getDb();
      const owner = getActiveOwnerId();
      const res = scheduleId
        ? await db.query(
            `SELECT data_json FROM checkin_submissions
             WHERE (owner_id = ? OR owner_id IS NULL) AND schedule_id = ? AND deleted_at_ms IS NULL
             ORDER BY created_at_ms DESC`,
            [owner, scheduleId],
          )
        : await db.query(
            `SELECT data_json FROM checkin_submissions
             WHERE (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL
             ORDER BY created_at_ms DESC`,
            [owner],
          );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse<CheckinSubmission>(r.data_json))
        .filter((s): s is CheckinSubmission => s !== null);
    },

    async getSubmission(id: string): Promise<CheckinSubmission | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json FROM checkin_submissions WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)`,
        [id, getActiveOwnerId()],
      );
      const row = (res.values?.[0] as { data_json: string } | undefined) ?? null;
      return row ? parse<CheckinSubmission>(row.data_json) : null;
    },

    async saveSubmission(s: CheckinSubmission): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO checkin_submissions(id, owner_id, schedule_id, data_json, created_at_ms, updated_at_ms, deleted_at_ms)
         VALUES(?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at_ms = excluded.updated_at_ms,
           deleted_at_ms = NULL`,
        [s.id, getActiveOwnerId(), s.scheduleId, JSON.stringify(s), s.createdAtMs, s.updatedAtMs],
      );
    },

    async upsertScheduleFromRemote(s: CheckinSchedule): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO checkin_schedules(id, owner_id, data_json, updated_at_ms, synced_at_ms)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at_ms = excluded.updated_at_ms,
           synced_at_ms = excluded.synced_at_ms`,
        [s.id, getActiveOwnerId(), JSON.stringify(s), s.updatedAtMs, nowMs()],
      );
    },

    async removeScheduleFromRemote(id: string): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM checkin_schedules WHERE id = ?`, [id]);
    },

    async upsertSubmissionFromRemote(s: CheckinSubmission): Promise<void> {
      // Same table as local submissions; the caller has already resolved last-write-wins.
      await this.saveSubmission(s);
    },

    async removeSubmissionFromRemote(id: string): Promise<void> {
      const db = getDb();
      await db.run(
        `UPDATE checkin_submissions SET deleted_at_ms = ? WHERE id = ?`,
        [Date.now(), id],
      );
    },

    async listSubmissionsForPush(): Promise<CheckinSubmission[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json FROM checkin_submissions
         WHERE (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [getActiveOwnerId()],
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse<CheckinSubmission>(r.data_json))
        .filter((s): s is CheckinSubmission => s !== null);
    },
  };
}
