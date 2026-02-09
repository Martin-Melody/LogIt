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

const DEFAULT_REST_MS = 90_000;

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
        [session.id, session.startedAtMs, session.endedAtMs ?? null]
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
          ]
        );

        for (const set of ex.sets) {
          await db.run(
            `
            INSERT INTO session_sets(
              id,
              exercise_entry_id,
              order_index,
              set_type,
              reps,
              weight,
              note,
              completed,
              rest_duration_ms,
              rest_started_at_ms
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
              set.restDurationMs ?? DEFAULT_REST_MS,
              set.restStartedAtMs ?? null,
            ]
          );
        }
      }
    },

    async getSession(id: string): Promise<WorkoutSession | null> {
      const db = getDb();

      const baseRes = await db.query(
        `SELECT id, started_at_ms as startedAtMs, ended_at_ms as endedAtMs FROM sessions WHERE id = ?`,
        [id]
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
        [id]
      );

      const exercises = [];
      for (const ex of (exRes.values ?? []) as any[]) {
        const setsRes = await db.query(
          `
          SELECT
            id,
            order_index as orderIndex,
            set_type as setType,
            reps,
            weight,
            note,
            completed,
            rest_duration_ms as restDurationMs,
            rest_started_at_ms as restStartedAtMs
          FROM session_sets
          WHERE exercise_entry_id = ?
          ORDER BY order_index ASC
          `,
          [ex.id]
        );

        const sets = (setsRes.values ?? []).map((s: any) => ({
          id: String(s.id),
          orderIndex: Number(s.orderIndex),
          setType: s.setType as SetType,
          reps: Number(s.reps),
          weight: Number(s.weight),
          note: s.note ?? null,
          completed: !!s.completed,
          restDurationMs: Number.isFinite(Number(s.restDurationMs))
            ? Number(s.restDurationMs)
            : DEFAULT_REST_MS,
          restStartedAtMs:
            s.restStartedAtMs == null ? null : Number(s.restStartedAtMs),
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
      options: ListRecentSessionsOptions
    ): Promise<WorkoutSession[]> {
      const db = getDb();
      const limit = options.limit;

      const res = await db.query(
        `
        SELECT id, started_at_ms as startedAtMs, ended_at_ms as endedAtMs
        FROM sessions
        WHERE ended_at_ms IS NOT NULL
        ORDER BY ended_at_ms DESC
        LIMIT ?
        `,
        [limit]
      );

      return ((res.values ?? []) as any[]).map((r) => ({
        id: r.id,
        startedAtMs: r.startedAtMs,
        endedAtMs: r.endedAtMs ?? undefined,
        exercises: [],
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
        [session.id]
      );
      await this.saveSession(session);
    },

    async loadDraftSession(): Promise<WorkoutSession | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT value FROM meta WHERE key='draft_session_id'`,
        []
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

      const res = await db.query(
        `SELECT id, code, label FROM set_types ORDER BY sort_order ASC`,
        []
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
