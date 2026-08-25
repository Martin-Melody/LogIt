import type { Exercise, ExercisePatch, ExerciseType, MuscleGroup, Machine } from "@logit/core/domain/exercise";
import type { ExerciseRepo, ListExercisesOptions } from "@logit/core/data/exercise/exerciseRepo";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { createId } from "@logit/core/domain/ids";
import { nowMs } from "@logit/core/domain/time";

function parseMuscles(json: string | null | undefined): MuscleGroup[] {
  if (!json) return [];
  try { return JSON.parse(json) as MuscleGroup[]; } catch { return []; }
}

function parseMachines(json: string | null | undefined): Machine[] {
  if (!json) return [];
  try { return JSON.parse(json) as Machine[]; } catch { return []; }
}

function row(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? null,
    isCore: r.is_core === 1,
    createdAtMs: r.createdAtMs ?? r.created_at_ms,
    primaryMuscles: parseMuscles(r.primary_muscles),
    secondaryMuscles: parseMuscles(r.secondary_muscles),
    exerciseType: (r.exercise_type as ExerciseType | undefined) ?? "normal",
    machines: parseMachines(r.machines),
    defaultMachineId: r.default_machine_id ?? undefined,
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
        `SELECT id, name, notes, is_core, created_at_ms as createdAtMs, primary_muscles, secondary_muscles, exercise_type, machines, default_machine_id
         FROM exercises
         ${where}
         ORDER BY name COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`,
        params,
      );

      return (res.values ?? []).map(row);
    },

    async create(name: string, exerciseType: ExerciseType = "normal"): Promise<Exercise> {
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
        primaryMuscles: [],
        secondaryMuscles: [],
        exerciseType,
        machines: [],
        defaultMachineId: undefined,
      };

      await db.run(
        `INSERT INTO exercises(id, name, notes, is_core, created_at_ms, owner_id, primary_muscles, secondary_muscles, exercise_type)
         VALUES(?, ?, ?, 0, ?, ?, '[]', '[]', ?)`,
        [ex.id, ex.name, null, ex.createdAtMs, getActiveOwnerId(), exerciseType],
      );

      return ex;
    },

    async getByName(name: string): Promise<Exercise | null> {
      const db = getDb();
      const trimmed = name.trim();
      if (!trimmed) return null;

      const res = await db.query(
        `SELECT id, name, notes, is_core, created_at_ms as createdAtMs, primary_muscles, secondary_muscles, exercise_type, machines, default_machine_id
         FROM exercises WHERE name = ?`,
        [trimmed],
      );
      const r = res.values?.[0];
      return r ? row(r) : null;
    },

    async getById(id: string): Promise<Exercise | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT id, name, notes, is_core, created_at_ms as createdAtMs, primary_muscles, secondary_muscles, exercise_type, machines, default_machine_id
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
      if (patch.primaryMuscles !== undefined) { sets.push("primary_muscles = ?"); params.push(JSON.stringify(patch.primaryMuscles)); }
      if (patch.secondaryMuscles !== undefined) { sets.push("secondary_muscles = ?"); params.push(JSON.stringify(patch.secondaryMuscles)); }
      if (patch.exerciseType !== undefined) { sets.push("exercise_type = ?"); params.push(patch.exerciseType); }
      if (patch.machines !== undefined) { sets.push("machines = ?"); params.push(JSON.stringify(patch.machines)); }
      if (patch.defaultMachineId !== undefined) { sets.push("default_machine_id = ?"); params.push(patch.defaultMachineId); }

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
        `INSERT INTO exercises(id, name, notes, is_core, created_at_ms, owner_id, primary_muscles, secondary_muscles, exercise_type, machines, default_machine_id)
         VALUES(?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, notes=excluded.notes,
           primary_muscles=excluded.primary_muscles, secondary_muscles=excluded.secondary_muscles,
           exercise_type=excluded.exercise_type,
           machines=excluded.machines, default_machine_id=excluded.default_machine_id`,
        [
          exercise.id, exercise.name, exercise.notes ?? null, exercise.createdAtMs, getActiveOwnerId(),
          JSON.stringify(exercise.primaryMuscles), JSON.stringify(exercise.secondaryMuscles),
          exercise.exerciseType ?? "normal",
          JSON.stringify(exercise.machines ?? []), exercise.defaultMachineId ?? null,
        ],
      );
    },

    async clearAll(): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM exercises WHERE is_core = 0`, []);
    },
  };
}
