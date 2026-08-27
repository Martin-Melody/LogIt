import type { ListMySchedulesOptions, MyCheckinSchedule } from "@logit/core/data/checkinRepo";
import type { CheckinSchedule } from "@logit/core/domain/Checkin";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";

/** Local-first store of check-in schedules THIS account authored as a coach. Mirrors
 * AuthoredProgramRepo. */
export interface AuthoredCheckinRepo {
  listMySchedules(options?: ListMySchedulesOptions): Promise<MyCheckinSchedule[]>;
  listForRecipient(username: string): Promise<CheckinSchedule[]>;
  getMySchedule(scheduleId: string): Promise<MyCheckinSchedule | null>;
  recipientUsernameOf(scheduleId: string): Promise<string | null>;
  saveSchedule(schedule: CheckinSchedule, recipientUsername?: string): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;
  listForPush(): Promise<{ schedule: CheckinSchedule; recipientUsername: string | null }[]>;
}

type Row = { data_json: string; recipient_user_id: string | null; recipient_username: string | null };

function parseRow(r: Row): MyCheckinSchedule | null {
  try {
    return { schedule: JSON.parse(r.data_json) as CheckinSchedule, recipientUserId: r.recipient_user_id };
  } catch {
    return null;
  }
}

export function createSqliteAuthoredCheckinRepo(): AuthoredCheckinRepo {
  const repo: AuthoredCheckinRepo = {
    async listMySchedules(options?: ListMySchedulesOptions): Promise<MyCheckinSchedule[]> {
      const db = getDb();
      const where = ["(owner_id = ? OR owner_id IS NULL)", "deleted_at_ms IS NULL"];
      const params: unknown[] = [getActiveOwnerId()];
      if (options?.templates) where.push("recipient_username IS NULL");
      else if (options?.recipientId) { where.push("recipient_user_id = ?"); params.push(options.recipientId); }
      const res = await db.query(
        `SELECT data_json, recipient_user_id, recipient_username FROM authored_checkin_schedules
         WHERE ${where.join(" AND ")} ORDER BY updated_at_ms DESC`,
        params,
      );
      return ((res.values ?? []) as Row[]).map(parseRow).filter((s): s is MyCheckinSchedule => s !== null);
    },

    async listForRecipient(username: string): Promise<CheckinSchedule[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json, recipient_user_id, recipient_username FROM authored_checkin_schedules
         WHERE recipient_username = ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL
         ORDER BY updated_at_ms DESC`,
        [username, getActiveOwnerId()],
      );
      return ((res.values ?? []) as Row[])
        .map(parseRow)
        .filter((s): s is MyCheckinSchedule => s !== null)
        .map((s) => s.schedule);
    },

    async getMySchedule(scheduleId: string): Promise<MyCheckinSchedule | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json, recipient_user_id, recipient_username FROM authored_checkin_schedules
         WHERE id = ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [scheduleId, getActiveOwnerId()],
      );
      const row = (res.values?.[0] as Row | undefined) ?? null;
      return row ? parseRow(row) : null;
    },

    async recipientUsernameOf(scheduleId: string): Promise<string | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT recipient_username FROM authored_checkin_schedules WHERE id = ?`,
        [scheduleId],
      );
      return (res.values?.[0] as { recipient_username: string | null } | undefined)?.recipient_username ?? null;
    },

    async saveSchedule(schedule: CheckinSchedule, recipientUsername?: string): Promise<void> {
      const db = getDb();
      const existing = recipientUsername ?? (await repo.recipientUsernameOf(schedule.id));
      await db.run(
        `INSERT INTO authored_checkin_schedules(id, owner_id, data_json, recipient_username, recipient_user_id, updated_at_ms, deleted_at_ms)
         VALUES(?, ?, ?, ?, NULL, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           recipient_username = excluded.recipient_username,
           updated_at_ms = excluded.updated_at_ms,
           deleted_at_ms = NULL`,
        [schedule.id, getActiveOwnerId(), JSON.stringify(schedule), existing, schedule.updatedAtMs],
      );
    },

    async deleteSchedule(scheduleId: string): Promise<void> {
      const db = getDb();
      const now = Date.now();
      await db.run(
        `UPDATE authored_checkin_schedules SET deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?`,
        [now, now, scheduleId],
      );
    },

    async listForPush(): Promise<{ schedule: CheckinSchedule; recipientUsername: string | null }[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT data_json, recipient_user_id, recipient_username FROM authored_checkin_schedules
         WHERE (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [getActiveOwnerId()],
      );
      return ((res.values ?? []) as Row[])
        .map((r) => {
          const p = parseRow(r);
          return p ? { schedule: p.schedule, recipientUsername: r.recipient_username } : null;
        })
        .filter((x): x is { schedule: CheckinSchedule; recipientUsername: string | null } => x !== null);
    },
  };
  return repo;
}
