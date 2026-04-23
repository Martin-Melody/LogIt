// src/lib/data/workouts/workoutRepo.sqlite.ts
import type {
  WorkoutRepo,
  ListRecentSessionsOptions,
} from "$lib/data/workoutRepo";
import type { WorkoutSession, SetType } from "$lib/domain/workout";
import type { SetTypeOption } from "$lib/data/types";
import { getDb } from "$lib/data/db/sqlite";

function isSetType(v: unknown): v is SetType {
  return (
    v === "normal" ||
    v === "warmup" ||
    v === "dropset" ||
    v === "amrap" ||
    v === "failure"
  );
}

export function createSqliteWorkoutRepo(): WorkoutRepo {
  return {
    async saveSession(session: WorkoutSession): Promise<void> {
      const db = getDb();

      await db.run(
        `
        INSERT INTO sessions(id, started_at_ms, ended_at_ms)
        VALUES(?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          started_at_ms=excluded.started_at_ms,
          ended_at_ms=excluded.ended_at_ms
        `,
        [session.id, session.startedAtMs, session.endedAtMs ?? null],
      );

      await db.run(`DELETE FROM session_exercises WHERE session_id = ?`, [
        session.id,
      ]);

      for (const ex of session.exercises) {
        await db.run(
          `
          INSERT INTO session_exercises(id, session_id, order_index, exercise_id, exercise_name)
          VALUES(?, ?, ?, ?, ?)
          `,
          [
            ex.id,
            session.id,
            ex.orderIndex,
            ex.exerciseId ?? null,
            ex.exerciseName,
          ],
        );

        for (const set of ex.sets) {
          await db.run(
            `
            INSERT INTO session_sets(
              id, exercise_entry_id, order_index, set_type, reps, weight, note,
              completed, rest_duration_ms, rest_started_at_ms
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              set.id,
              ex.id,
              set.orderIndex,
              set.setType,
              set.reps,
              set.weight,
              set.note ?? null,
              set.completed ? 1 : 0,
              set.restDurationMs ?? null,
              set.restStartedAtMs ?? null,
            ],
          );
        }
      }
    },

    async getSession(id: string): Promise<WorkoutSession | null> {
      const db = getDb();

      const baseRes = await db.query(
        `SELECT id, started_at_ms as startedAtMs, ended_at_ms as endedAtMs FROM sessions WHERE id = ?`,
        [id],
      );
      const base = (baseRes.values?.[0] as any) ?? null;
      if (!base) return null;

      const exRes = await db.query(
        `
        SELECT id, order_index as orderIndex, exercise_id as exerciseId, exercise_name as exerciseName
        FROM session_exercises
        WHERE session_id = ?
        ORDER BY order_index ASC
        `,
        [id],
      );

      const exercises = [];
      for (const ex of (exRes.values ?? []) as any[]) {
        const setsRes = await db.query(
          `
          SELECT id, order_index as orderIndex, set_type as setType, reps, weight, note,
                 completed, rest_duration_ms as restDurationMs, rest_started_at_ms as restStartedAtMs
          FROM session_sets
          WHERE exercise_entry_id = ?
          ORDER BY order_index ASC
          `,
          [ex.id],
        );

        const sets = ((setsRes.values ?? []) as any[]).map((s) => ({
          ...s,
          completed: !!s.completed,
          restDurationMs: s.restDurationMs ?? undefined,
          restStartedAtMs: s.restStartedAtMs ?? null,
        }));

        exercises.push({
          id: ex.id,
          exerciseId: ex.exerciseId ?? undefined,
          exerciseName: ex.exerciseName,
          orderIndex: ex.orderIndex,
          sets,
        });
      }

      return {
        id: base.id,
        startedAtMs: base.startedAtMs,
        endedAtMs: base.endedAtMs ?? undefined,
        exercises,
      };
    },

    async listRecentSessions(
      options: ListRecentSessionsOptions,
    ): Promise<WorkoutSession[]> {
      const db = getDb();
      const limit = options.limit;

      const sessionRes = await db.query(
        `
        SELECT id, started_at_ms as startedAtMs, ended_at_ms as endedAtMs
        FROM sessions
        WHERE ended_at_ms IS NOT NULL
        ORDER BY ended_at_ms DESC
        LIMIT ?
        `,
        [limit],
      );

      const sessionRows = (sessionRes.values ?? []) as any[];
      if (sessionRows.length === 0) return [];

      const sessionIds = sessionRows.map((r) => r.id as string);
      const sessionPlaceholders = sessionIds.map(() => "?").join(",");

      const exRes = await db.query(
        `
        SELECT id, session_id as sessionId, order_index as orderIndex,
               exercise_id as exerciseId, exercise_name as exerciseName
        FROM session_exercises
        WHERE session_id IN (${sessionPlaceholders})
        ORDER BY session_id, order_index ASC
        `,
        sessionIds,
      );

      const exRows = (exRes.values ?? []) as any[];
      const exIds = exRows.map((r) => r.id as string);

      let setRows: any[] = [];
      if (exIds.length > 0) {
        const setPlaceholders = exIds.map(() => "?").join(",");
        const setRes = await db.query(
          `
          SELECT id, exercise_entry_id as exerciseEntryId, order_index as orderIndex,
                 set_type as setType, reps, weight, note,
                 completed, rest_duration_ms as restDurationMs, rest_started_at_ms as restStartedAtMs
          FROM session_sets
          WHERE exercise_entry_id IN (${setPlaceholders})
          ORDER BY exercise_entry_id, order_index ASC
          `,
          exIds,
        );
        setRows = ((setRes.values ?? []) as any[]).map((s) => ({
          ...s,
          completed: !!s.completed,
          restDurationMs: s.restDurationMs ?? undefined,
          restStartedAtMs: s.restStartedAtMs ?? null,
        }));
      }

      // Index sets by exerciseEntryId
      const setsByExId = new Map<string, any[]>();
      for (const set of setRows) {
        const list = setsByExId.get(set.exerciseEntryId) ?? [];
        list.push(set);
        setsByExId.set(set.exerciseEntryId, list);
      }

      // Index exercises by sessionId
      const exBySessionId = new Map<string, any[]>();
      for (const ex of exRows) {
        const list = exBySessionId.get(ex.sessionId) ?? [];
        list.push({
          id: ex.id,
          exerciseId: ex.exerciseId ?? undefined,
          exerciseName: ex.exerciseName,
          orderIndex: ex.orderIndex,
          sets: setsByExId.get(ex.id) ?? [],
        });
        exBySessionId.set(ex.sessionId, list);
      }

      return sessionRows.map((r) => ({
        id: r.id,
        startedAtMs: r.startedAtMs,
        endedAtMs: r.endedAtMs ?? undefined,
        exercises: exBySessionId.get(r.id) ?? [],
      }));
    },

    async deleteSession(id: string): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
    },

    async saveDraftSession(session: WorkoutSession): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO meta(key, value) VALUES('draft_session_id', ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [session.id],
      );
      await this.saveSession(session);
    },

    async loadDraftSession(): Promise<WorkoutSession | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT value FROM meta WHERE key='draft_session_id'`,
        [],
      );
      const draftId = (
        ((res.values?.[0] as any)?.value as string | undefined) ?? ""
      ).trim();
      if (!draftId) return null;
      return this.getSession(draftId);
    },

    async clearDraftSession(): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM meta WHERE key='draft_session_id'`, []);
    },

    async getSetTypes(): Promise<SetTypeOption[]> {
      const db = getDb();

      // matches schema: set_types(id, code, label, sort_order)
      const res = await db.query(
        `SELECT id, code, label FROM set_types ORDER BY sort_order ASC`,
        [],
      );

      const rows = (res.values ?? []) as any[];

      return rows
        .filter((r) => isSetType(r.code))
        .map((r) => ({
          id: String(r.id),
          code: r.code as SetType,
          label: String(r.label),
        }));
    },
  };
}
