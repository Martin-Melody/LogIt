import type { MessagesRepo } from "./messagesRepo";
import type { CoachMessage } from "@logit/core/domain/CoachMessage";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";

type Row = {
  id: string;
  relationship_id: string;
  body: string;
  created_at_ms: number;
  read_at_ms: number | null;
  mine: number;
  synced: number;
};

function toMessage(r: Row): CoachMessage {
  return {
    id: r.id,
    relationshipId: r.relationship_id,
    body: r.body,
    createdAtMs: r.created_at_ms,
    readAtMs: r.read_at_ms,
    mine: r.mine === 1,
    synced: r.synced === 1,
  };
}

export function createSqliteMessagesRepo(): MessagesRepo {
  return {
    async listThread(relationshipId: string): Promise<CoachMessage[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT * FROM coach_messages
         WHERE (owner_id = ? OR owner_id IS NULL) AND relationship_id = ?
         ORDER BY created_at_ms ASC`,
        [getActiveOwnerId(), relationshipId],
      );
      return ((res.values ?? []) as Row[]).map(toMessage);
    },

    async addOutgoing(m: CoachMessage): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT OR IGNORE INTO coach_messages(id, owner_id, relationship_id, body, created_at_ms, read_at_ms, mine, synced)
         VALUES(?, ?, ?, ?, ?, NULL, 1, 0)`,
        [m.id, getActiveOwnerId(), m.relationshipId, m.body, m.createdAtMs],
      );
    },

    async markSynced(id: string): Promise<void> {
      const db = getDb();
      await db.run(`UPDATE coach_messages SET synced = 1 WHERE id = ?`, [id]);
    },

    async upsertFromRemote(m: CoachMessage): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO coach_messages(id, owner_id, relationship_id, body, created_at_ms, read_at_ms, mine, synced)
         VALUES(?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           body = excluded.body,
           read_at_ms = excluded.read_at_ms,
           synced = 1`,
        [m.id, getActiveOwnerId(), m.relationshipId, m.body, m.createdAtMs, m.readAtMs ?? null, m.mine ? 1 : 0],
      );
    },

    async pendingOutgoing(): Promise<CoachMessage[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT * FROM coach_messages
         WHERE (owner_id = ? OR owner_id IS NULL) AND mine = 1 AND synced = 0
         ORDER BY created_at_ms ASC`,
        [getActiveOwnerId()],
      );
      return ((res.values ?? []) as Row[]).map(toMessage);
    },

    async markThreadRead(relationshipId: string, upToMs: number): Promise<void> {
      const db = getDb();
      await db.run(
        `UPDATE coach_messages SET read_at_ms = ?
         WHERE (owner_id = ? OR owner_id IS NULL) AND relationship_id = ? AND mine = 0
           AND read_at_ms IS NULL AND created_at_ms <= ?`,
        [Date.now(), getActiveOwnerId(), relationshipId, upToMs],
      );
    },

    async unreadCount(relationshipId?: string): Promise<number> {
      const db = getDb();
      const res = relationshipId
        ? await db.query(
            `SELECT COUNT(*) as n FROM coach_messages
             WHERE (owner_id = ? OR owner_id IS NULL) AND relationship_id = ? AND mine = 0 AND read_at_ms IS NULL`,
            [getActiveOwnerId(), relationshipId],
          )
        : await db.query(
            `SELECT COUNT(*) as n FROM coach_messages
             WHERE (owner_id = ? OR owner_id IS NULL) AND mine = 0 AND read_at_ms IS NULL`,
            [getActiveOwnerId()],
          );
      return Number((res.values?.[0] as { n: number } | undefined)?.n ?? 0);
    },
  };
}
