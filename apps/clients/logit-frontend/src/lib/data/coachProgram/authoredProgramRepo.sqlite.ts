import type {
  ListMyProgramsOptions,
  MyCoachProgram,
} from "@logit/core/data/coachProgramRepo";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";

/** Local-first authoring store, plus a couple of helpers the sync layer needs. Pushing to
 * the server is done by the saveAuthoredProgram / deleteAuthoredProgram usecases via the
 * outbox, mirroring how saveSplit calls pushSplit. */
export interface AuthoredProgramRepo {
  listMyPrograms(options?: ListMyProgramsOptions): Promise<MyCoachProgram[]>;
  /** Programs authored for a specific client, keyed by their username (the local mirror
   * tracks the assignment by username, not server id). */
  listForRecipient(username: string): Promise<CoachProgram[]>;
  getMyProgram(programId: string): Promise<MyCoachProgram | null>;
  /** The recipient username a program is (or was last) assigned to — needed to build the
   * server upsert payload. Null for a template. */
  recipientUsernameOf(programId: string): Promise<string | null>;
  saveProgram(program: CoachProgram, recipientUsername?: string): Promise<void>;
  deleteProgram(programId: string): Promise<void>;
  /** All non-deleted authored programs with their assignment — for a full re-push on login. */
  listForPush(): Promise<{ program: CoachProgram; recipientUsername: string | null }[]>;
}

type Row = {
  data_json: string;
  recipient_user_id: string | null;
  recipient_username: string | null;
};

function parseRow(row: Row): MyCoachProgram | null {
  try {
    return {
      program: JSON.parse(row.data_json) as CoachProgram,
      recipientUserId: row.recipient_user_id,
    };
  } catch {
    return null;
  }
}

export function createSqliteAuthoredProgramRepo(): AuthoredProgramRepo {
  const repo: AuthoredProgramRepo = {
    async listMyPrograms(options?: ListMyProgramsOptions): Promise<MyCoachProgram[]> {
      const db = getDb();
      const owner = getActiveOwnerId();
      const where = ["(owner_id = ? OR owner_id IS NULL)", "deleted_at_ms IS NULL"];
      const params: unknown[] = [owner];
      if (options?.templates) where.push("recipient_username IS NULL");
      else if (options?.recipientId) {
        where.push("recipient_user_id = ?");
        params.push(options.recipientId);
      }
      const res = await db.query(
        `SELECT data_json, recipient_user_id, recipient_username
         FROM authored_programs WHERE ${where.join(" AND ")}
         ORDER BY updated_at_ms DESC`,
        params,
      );
      return ((res.values ?? []) as Row[])
        .map(parseRow)
        .filter((p): p is MyCoachProgram => p !== null);
    },

    async listForRecipient(username: string): Promise<CoachProgram[]> {
      const db = getDb();
      const owner = getActiveOwnerId();
      const res = await db.query(
        `SELECT data_json, recipient_user_id, recipient_username
         FROM authored_programs
         WHERE recipient_username = ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL
         ORDER BY updated_at_ms DESC`,
        [username, owner],
      );
      return ((res.values ?? []) as Row[])
        .map(parseRow)
        .filter((p): p is MyCoachProgram => p !== null)
        .map((p) => p.program);
    },

    async getMyProgram(programId: string): Promise<MyCoachProgram | null> {
      const db = getDb();
      const owner = getActiveOwnerId();
      const res = await db.query(
        `SELECT data_json, recipient_user_id, recipient_username
         FROM authored_programs
         WHERE id = ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [programId, owner],
      );
      const row = (res.values?.[0] as Row | undefined) ?? null;
      return row ? parseRow(row) : null;
    },

    async recipientUsernameOf(programId: string): Promise<string | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT recipient_username FROM authored_programs WHERE id = ?`,
        [programId],
      );
      return (
        (res.values?.[0] as { recipient_username: string | null } | undefined)?.recipient_username ??
        null
      );
    },

    async saveProgram(program: CoachProgram, recipientUsername?: string): Promise<void> {
      const db = getDb();
      const existingUsername = recipientUsername ?? (await repo.recipientUsernameOf(program.id));
      await db.run(
        `INSERT INTO authored_programs(id, owner_id, data_json, recipient_username, recipient_user_id, updated_at_ms, deleted_at_ms)
         VALUES(?, ?, ?, ?, NULL, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           recipient_username = excluded.recipient_username,
           updated_at_ms = excluded.updated_at_ms,
           deleted_at_ms = NULL`,
        [program.id, getActiveOwnerId(), JSON.stringify(program), existingUsername, program.updatedAtMs],
      );
    },

    async deleteProgram(programId: string): Promise<void> {
      const db = getDb();
      const now = Date.now();
      await db.run(
        `UPDATE authored_programs SET deleted_at_ms = ?, updated_at_ms = ? WHERE id = ?`,
        [now, now, programId],
      );
    },

    async listForPush(): Promise<{ program: CoachProgram; recipientUsername: string | null }[]> {
      const db = getDb();
      const owner = getActiveOwnerId();
      const res = await db.query(
        `SELECT data_json, recipient_user_id, recipient_username
         FROM authored_programs
         WHERE (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [owner],
      );
      return ((res.values ?? []) as Row[])
        .map((r) => {
          const parsed = parseRow(r);
          return parsed ? { program: parsed.program, recipientUsername: r.recipient_username } : null;
        })
        .filter((x): x is { program: CoachProgram; recipientUsername: string | null } => x !== null);
    },
  };

  return repo;
}
