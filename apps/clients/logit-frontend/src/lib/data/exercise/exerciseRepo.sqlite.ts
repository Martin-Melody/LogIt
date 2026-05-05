import type { Exercise, ExercisePatch } from "$lib/domain/exercise";
import type { ExerciseRepo, ListExercisesOptions } from "./exerciseRepo";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { createId } from "$lib/domain/ids";
import { nowMs } from "$lib/domain/time";

function row(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? null,
    isCore: r.is_core === 1,
    createdAtMs: r.createdAtMs ?? r.created_at_ms,
  };
}

export function createSqliteExerciseRepo(): ExerciseRepo {
  return {
    async list(options?: ListExercisesOptions): Promise<Exercise[]> {
      const db = getDb();

      const q = options?.query?.trim();
      const filter = options?.filter ?? "all";
      const limit = options?.limit ?? 200;
      const offset = options?.offset ?? 0;

      const ownerId = getActiveOwnerId();
      // Show core exercises (shared) + custom exercises for this owner
      const conditions: string[] = ["(is_core = 1 OR owner_id = ? OR owner_id IS NULL)"];
      const params: any[] = [ownerId];

      if (q) {
        conditions.push("name LIKE ?");
        params.push(`%${q}%`);
      }
      if (filter === "core") {
        conditions.push("is_core = 1");
      } else if (filter === "mine") {
        conditions.push("is_core = 0");
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit, offset);

      const res = await db.query(
        `SELECT id, name, notes, is_core, created_at_ms as createdAtMs
         FROM exercises
         ${where}
         ORDER BY name COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`,
        params,
      );

      return (res.values ?? []).map(row);
    },

    async create(name: string): Promise<Exercise> {
      const db = getDb();
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Exercise name required.");

      const existing = await this.getByName(trimmed);
      if (existing) return existing;

      const ex: Exercise = {
        id: createId("exdb"),
        name: trimmed,
        notes: null,
        isCore: false,
        createdAtMs: nowMs(),
      };

      await db.run(
        `INSERT INTO exercises(id, name, notes, is_core, created_at_ms, owner_id) VALUES(?, ?, ?, 0, ?, ?)`,
        [ex.id, ex.name, null, ex.createdAtMs, getActiveOwnerId()],
      );

      return ex;
    },

    async getByName(name: string): Promise<Exercise | null> {
      const db = getDb();
      const trimmed = name.trim();
      if (!trimmed) return null;

      const res = await db.query(
        `SELECT id, name, notes, is_core, created_at_ms as createdAtMs
         FROM exercises WHERE name = ?`,
        [trimmed],
      );
      const r = res.values?.[0];
      return r ? row(r) : null;
    },

    async getById(id: string): Promise<Exercise | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT id, name, notes, is_core, created_at_ms as createdAtMs
         FROM exercises WHERE id = ?`,
        [id],
      );
      const r = res.values?.[0];
      return r ? row(r) : null;
    },

    async update(id: string, patch: ExercisePatch): Promise<Exercise> {
      const db = getDb();
      const sets: string[] = [];
      const params: any[] = [];

      if (patch.name !== undefined) { sets.push("name = ?"); params.push(patch.name); }
      if (patch.notes !== undefined) { sets.push("notes = ?"); params.push(patch.notes); }

      if (sets.length) {
        params.push(id);
        await db.run(`UPDATE exercises SET ${sets.join(", ")} WHERE id = ?`, params);
      }

      const updated = await this.getById(id);
      if (!updated) throw new Error(`Exercise ${id} not found.`);
      return updated;
    },

    async remove(id: string): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM exercises WHERE id = ? AND is_core = 0`, [id]);
    },

    async saveExercise(exercise: Exercise): Promise<void> {
      // Core exercises are seeded by migrations — only restore custom ones
      if (exercise.isCore) return;
      const db = getDb();
      await db.run(
        `INSERT INTO exercises(id, name, notes, is_core, created_at_ms, owner_id) VALUES(?, ?, ?, 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, notes=excluded.notes`,
        [exercise.id, exercise.name, exercise.notes ?? null, exercise.createdAtMs, getActiveOwnerId()],
      );
    },

    async clearAll(): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM exercises WHERE is_core = 0`, []);
    },
  };
}
