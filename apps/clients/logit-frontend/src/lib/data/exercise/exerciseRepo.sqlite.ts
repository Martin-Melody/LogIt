import type { Exercise } from "$lib/domain/exercise";
import type { ExerciseRepo, ListExercisesOptions } from "./exerciseRepo";
import { getDb } from "$lib/data/db/sqlite";
import { createId } from "$lib/domain/ids";
import { nowMs } from "$lib/domain/time";

export function createSqliteExerciseRepo(): ExerciseRepo {
  return {
    async list(options?: ListExercisesOptions): Promise<Exercise[]> {
      const db = getDb();

      const q = options?.query?.trim();
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;

      const where = q ? "WHERE name LIKE ?" : "";
      const params: any[] = [];
      if (q) params.push(`%${q}%`);
      params.push(limit);
      params.push(offset);

      const res = await db.query(
        `
        SELECT id, name, created_at_ms as createdAtMs
        FROM exercises
        ${where}
        ORDER BY name COLLATE NOCASE ASC
        LIMIT ? OFFSET ?
        `,
        params,
      );

      return (res.values ?? []) as Exercise[];
    },

    async create(name: string): Promise<Exercise> {
      const db = getDb();

      const trimmed = name.trim();
      if (!trimmed) throw new Error("Exercise name required.");

      const existing = await db.query(
        `SELECT id, name, created_at_ms as createdAtMs FROM exercises WHERE name = ?`,
        [trimmed],
      );
      const found = (existing.values?.[0] as Exercise | undefined) ?? null;
      if (found) return found;

      const ex: Exercise = {
        id: createId("exdb"),
        name: trimmed,
        createdAtMs: nowMs(),
      };

      await db.run(
        `INSERT INTO exercises(id, name, created_at_ms) VALUES(?, ?, ?)`,
        [ex.id, ex.name, ex.createdAtMs],
      );

      return ex;
    },

    async getByName(name: string): Promise<Exercise | null> {
      const db = getDb();
      const trimmed = name.trim();
      if (!trimmed) return null;

      const res = await db.query(
        `SELECT id, name, created_at_ms as createdAtMs FROM exercises WHERE name = ?`,
        [trimmed],
      );
      return ((res.values?.[0] as Exercise | undefined) ??
        null) as Exercise | null;
    },
  };
}
