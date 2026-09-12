import type { WorkoutRepo, ListRecentSessionsOptions } from "@logit/core/data/workoutRepo";
import type {
  WorkoutSession,
  SessionBlock,
  StrengthBlockData,
  SetType,
  MobilityBlockData,
  MobilityMetric,
  MobilitySide,
} from "@logit/core/domain/workout";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";

function parseBlockData(type: string, dataJson: string): unknown {
  let raw: any;
  try { raw = JSON.parse(dataJson); } catch { raw = {}; }

  if (type === "strength") {
    return {
      exerciseName: raw.exerciseName ?? "",
      exerciseId: raw.exerciseId ?? undefined,
      superset: raw.superset ?? undefined,
      sets: (raw.sets ?? []).map((s: any) => ({
        id: s.id,
        setType: (s.setType ?? "normal") as SetType,
        reps: s.reps ?? 0,
        weight: s.weight ?? 0,
        note: s.note ?? null,
        orderIndex: s.orderIndex ?? 0,
        completed: !!s.completed,
        restDurationMs: s.restDurationMs ?? undefined,
        restStartedAtMs: s.restStartedAtMs ?? null,
        machineId: s.machineId ?? undefined,
        rpe: s.rpe ?? null,
      })),
    } satisfies StrengthBlockData;
  }

  if (type === "mobility") {
    const n = (v: any): number | undefined => {
      const x = Number(v);
      return Number.isFinite(x) && x >= 0 ? x : undefined;
    };
    const side = (v: any): MobilitySide | undefined =>
      v === "left" || v === "right" ? v : undefined;
    const mobSet = (s: any) => ({
      id: s.id,
      orderIndex: s.orderIndex ?? 0,
      side: side(s.side),
      durationSec: n(s.durationSec),
      reps: n(s.reps),
      loadKg: n(s.loadKg),
      targetSec: s.targetSec == null ? null : n(s.targetSec) ?? null,
      depth: s.depth == null ? null : Math.min(5, Math.max(1, Math.round(Number(s.depth)))) || null,
      completed: !!s.completed,
      note: s.note ?? null,
      restDurationMs: n(s.restDurationMs),
      restStartedAtMs: s.restStartedAtMs == null ? null : n(s.restStartedAtMs) ?? null,
      leadSide: side(s.leadSide),
    });
    return {
      drillName: raw.drillName ?? "",
      drillId: raw.drillId ?? undefined,
      metric: (raw.metric === "reps" ? "reps" : "hold") as MobilityMetric,
      perSide: !!raw.perSide,
      superset: raw.superset ?? undefined,
      note: raw.note ?? null,
      restBetweenSetsMs: n(raw.restBetweenSetsMs),
      leadSide: side(raw.leadSide),
      stashedSides: Array.isArray(raw.stashedSides)
        ? raw.stashedSides
            .filter((x: any) => x && typeof x.setNumber === "number" && x.set)
            .map((x: any) => ({ setNumber: x.setNumber, set: mobSet(x.set) }))
        : undefined,
      sets: (raw.sets ?? []).map(mobSet),
    } satisfies MobilityBlockData;
  }

  return raw;
}

async function writeBlocks(db: ReturnType<typeof getDb>, session: WorkoutSession): Promise<void> {
  await db.run(`DELETE FROM session_blocks WHERE session_id = ?`, [session.id]);

  for (const block of session.blocks) {
    await db.run(
      `INSERT OR REPLACE INTO session_blocks(id, session_id, block_type, order_index, data)
       VALUES(?, ?, ?, ?, ?)`,
      [block.id, session.id, block.type, block.orderIndex, JSON.stringify(block.data)],
    );
  }
}

async function readBlocks(db: ReturnType<typeof getDb>, sessionId: string): Promise<SessionBlock[]> {
  const res = await db.query(
    `SELECT id, block_type, order_index, data
     FROM session_blocks WHERE session_id = ?
     ORDER BY order_index ASC`,
    [sessionId],
  );

  return ((res.values ?? []) as any[]).map((row) => ({
    id: row.id as string,
    type: row.block_type as string,
    orderIndex: row.order_index as number,
    data: parseBlockData(row.block_type, row.data),
  }));
}

export function createSqliteWorkoutRepo(): WorkoutRepo {
  return {
    async saveSession(session: WorkoutSession): Promise<void> {
      const db = getDb();

      await db.run(
        `INSERT INTO sessions(id, started_at_ms, ended_at_ms, owner_id, exclude_from_progression, note)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           started_at_ms = excluded.started_at_ms,
           ended_at_ms   = excluded.ended_at_ms,
           exclude_from_progression = excluded.exclude_from_progression,
           note = excluded.note`,
        [session.id, session.startedAtMs, session.endedAtMs ?? null, getActiveOwnerId(), session.excludeFromProgression ? 1 : 0, session.note ?? null],
      );

      await writeBlocks(db, session);
    },

    async getSession(id: string): Promise<WorkoutSession | null> {
      const db = getDb();

      const ownerId = getActiveOwnerId();
      const baseRes = await db.query(
        `SELECT id, started_at_ms as startedAtMs, ended_at_ms as endedAtMs, exclude_from_progression, note
         FROM sessions WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)`,
        [id, ownerId],
      );
      const base = (baseRes.values?.[0] as any) ?? null;
      if (!base) return null;

      return {
        id: base.id,
        startedAtMs: base.startedAtMs,
        endedAtMs: base.endedAtMs ?? undefined,
        excludeFromProgression: base.exclude_from_progression === 1 ? true : undefined,
        note: base.note ?? null,
        blocks: await readBlocks(db, id),
      };
    },

    async listRecentSessions(options: ListRecentSessionsOptions): Promise<WorkoutSession[]> {
      const db = getDb();

      const ownerId = getActiveOwnerId();
      const sessionRes = await db.query(
        `SELECT id, started_at_ms as startedAtMs, ended_at_ms as endedAtMs, exclude_from_progression, note
         FROM sessions
         WHERE ended_at_ms IS NOT NULL AND (owner_id = ? OR owner_id IS NULL)
         ORDER BY ended_at_ms DESC
         LIMIT ?`,
        [ownerId, options.limit],
      );

      const sessionRows = (sessionRes.values ?? []) as any[];
      if (sessionRows.length === 0) return [];

      const sessionIds = sessionRows.map((r) => r.id as string);
      const placeholders = sessionIds.map(() => "?").join(",");

      const blockRes = await db.query(
        `SELECT id, session_id, block_type, order_index, data
         FROM session_blocks
         WHERE session_id IN (${placeholders})
         ORDER BY session_id, order_index ASC`,
        sessionIds,
      );

      const blockRows = (blockRes.values ?? []) as any[];

      const blocksBySessionId = new Map<string, SessionBlock[]>();
      for (const row of blockRows) {
        const list = blocksBySessionId.get(row.session_id) ?? [];
        list.push({
          id: row.id,
          type: row.block_type,
          orderIndex: row.order_index,
          data: parseBlockData(row.block_type, row.data),
        });
        blocksBySessionId.set(row.session_id, list);
      }

      return sessionRows.map((r) => ({
        id: r.id,
        startedAtMs: r.startedAtMs,
        endedAtMs: r.endedAtMs ?? undefined,
        excludeFromProgression: r.exclude_from_progression === 1 ? true : undefined,
        note: r.note ?? null,
        blocks: blocksBySessionId.get(r.id) ?? [],
      }));
    },

    async listAllSessions(): Promise<WorkoutSession[]> {
      const db = getDb();

      const ownerId = getActiveOwnerId();
      const sessionRes = await db.query(
        `SELECT id, started_at_ms as startedAtMs, ended_at_ms as endedAtMs, exclude_from_progression, note
         FROM sessions
         WHERE owner_id = ? OR owner_id IS NULL
         ORDER BY COALESCE(ended_at_ms, started_at_ms) DESC`,
        [ownerId],
      );

      const sessionRows = (sessionRes.values ?? []) as any[];
      if (sessionRows.length === 0) return [];

      const sessionIds = sessionRows.map((r) => r.id as string);
      const placeholders = sessionIds.map(() => "?").join(",");

      const blockRes = await db.query(
        `SELECT id, session_id, block_type, order_index, data
         FROM session_blocks
         WHERE session_id IN (${placeholders})
         ORDER BY session_id, order_index ASC`,
        sessionIds,
      );

      const blockRows = (blockRes.values ?? []) as any[];
      const blocksBySessionId = new Map<string, SessionBlock[]>();
      for (const row of blockRows) {
        const list = blocksBySessionId.get(row.session_id) ?? [];
        list.push({
          id: row.id,
          type: row.block_type,
          orderIndex: row.order_index,
          data: parseBlockData(row.block_type, row.data),
        });
        blocksBySessionId.set(row.session_id, list);
      }

      return sessionRows.map((r) => ({
        id: r.id,
        startedAtMs: r.startedAtMs,
        endedAtMs: r.endedAtMs ?? undefined,
        excludeFromProgression: r.exclude_from_progression === 1 ? true : undefined,
        note: r.note ?? null,
        blocks: blocksBySessionId.get(r.id) ?? [],
      }));
    },

    async deleteSession(id: string): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
    },

    async clearAllSessions(): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM session_blocks`, []);
      await db.run(`DELETE FROM sessions`, []);
    },

    async saveDraftSession(session: WorkoutSession): Promise<void> {
      const db = getDb();
      const key = `draft_session_id:${getActiveOwnerId() ?? "default"}`;
      await db.run(
        `INSERT INTO meta(key, value) VALUES(?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, session.id],
      );
      await this.saveSession(session);
    },

    async loadDraftSession(): Promise<WorkoutSession | null> {
      const db = getDb();
      const key = `draft_session_id:${getActiveOwnerId() ?? "default"}`;
      const res = await db.query(`SELECT value FROM meta WHERE key=?`, [key]);
      const draftId = (((res.values?.[0] as any)?.value as string | undefined) ?? "").trim();
      if (!draftId) return null;
      return this.getSession(draftId);
    },

    async clearDraftSession(): Promise<void> {
      const db = getDb();
      const key = `draft_session_id:${getActiveOwnerId() ?? "default"}`;
      await db.run(`DELETE FROM meta WHERE key=?`, [key]);
    },
  };
}
