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
  context_date_iso: string | null;
  photo_json: string | null;
  voice_json: string | null;
  kind?: string | null;
  card_json?: string | null;
};

function readJson<T>(json: string | null): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function toMessage(r: Row): CoachMessage {
  return {
    id: r.id,
    relationshipId: r.relationship_id,
    body: r.body,
    createdAtMs: r.created_at_ms,
    readAtMs: r.read_at_ms,
    mine: r.mine === 1,
    synced: r.synced === 1,
    contextDateIso: r.context_date_iso ?? undefined,
    photo: readJson(r.photo_json),
    voice: readJson(r.voice_json),
    ...(r.kind ? { kind: r.kind } : {}),
    ...(r.card_json ? { cardJson: r.card_json } : {}),
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
        `INSERT OR IGNORE INTO coach_messages(id, owner_id, relationship_id, body, created_at_ms, read_at_ms, mine, synced, context_date_iso, photo_json, voice_json, kind, card_json)
         VALUES(?, ?, ?, ?, ?, NULL, 1, 0, ?, ?, ?, ?, ?)`,
        [m.id, getActiveOwnerId(), m.relationshipId, m.body, m.createdAtMs, m.contextDateIso ?? null, m.photo ? JSON.stringify(m.photo) : null, m.voice ? JSON.stringify(m.voice) : null, m.kind ?? null, m.cardJson ?? null],
      );
    },

    async markSynced(id: string): Promise<void> {
      const db = getDb();
      await db.run(`UPDATE coach_messages SET synced = 1 WHERE id = ?`, [id]);
    },

    async upsertFromRemote(m: CoachMessage): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO coach_messages(id, owner_id, relationship_id, body, created_at_ms, read_at_ms, mine, synced, context_date_iso, photo_json, voice_json, kind, card_json)
         VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           body = excluded.body,
           read_at_ms = excluded.read_at_ms,
           context_date_iso = excluded.context_date_iso,
           photo_json = excluded.photo_json,
           voice_json = excluded.voice_json,
           kind = excluded.kind,
           card_json = excluded.card_json,
           synced = 1`,
        [m.id, getActiveOwnerId(), m.relationshipId, m.body, m.createdAtMs, m.readAtMs ?? null, m.mine ? 1 : 0, m.contextDateIso ?? null, m.photo ? JSON.stringify(m.photo) : null, m.voice ? JSON.stringify(m.voice) : null, m.kind ?? null, m.cardJson ?? null],
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

    async listCommentsForDate(dateIso: string): Promise<CoachMessage[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT * FROM coach_messages
         WHERE (owner_id = ? OR owner_id IS NULL) AND context_date_iso = ?
         ORDER BY created_at_ms ASC`,
        [getActiveOwnerId(), dateIso],
      );
      return ((res.values ?? []) as Row[]).map(toMessage);
    },
    async listByKind(kind: string): Promise<CoachMessage[]> {
      const res = await getDb().query(
        `SELECT * FROM coach_messages WHERE (owner_id = ? OR owner_id IS NULL) AND kind = ? ORDER BY created_at_ms ASC`,
        [getActiveOwnerId(), kind],
      );
      return ((res.values ?? []) as Row[]).map(toMessage);
    },
  };
}
