import type { TrainingBlockTagRepo } from "@logit/core/data/trainingBlockTagRepo";
import type { TrainingBlockTag } from "@logit/core/domain/trainingBlockTag";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";

function owner(): string {
  return getActiveOwnerId() ?? "default";
}

export function createSqliteTrainingBlockTagRepo(): TrainingBlockTagRepo {
  return {
    async listForExercise(key: string): Promise<TrainingBlockTag[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT data FROM training_block_tags WHERE owner_id = ? AND exercise_key = ? ORDER BY created_at_ms ASC`,
        [owner(), key],
      );
      return ((res.values ?? []) as { data: string }[]).flatMap((row) => {
        try { return [JSON.parse(row.data) as TrainingBlockTag]; } catch { return []; }
      });
    },

    async create(tag: TrainingBlockTag): Promise<void> {
      const db = getDb();
      const key = tag.exerciseId ?? tag.exerciseName.toLowerCase().trim();
      await db.run(
        `INSERT INTO training_block_tags(owner_id, id, exercise_key, data, created_at_ms) VALUES(?, ?, ?, ?, ?)`,
        [owner(), tag.id, key, JSON.stringify(tag), tag.createdAtMs],
      );
    },

    async update(tag: TrainingBlockTag): Promise<void> {
      const db = getDb();
      await db.run(
        `UPDATE training_block_tags SET data = ? WHERE owner_id = ? AND id = ?`,
        [JSON.stringify(tag), owner(), tag.id],
      );
    },

    async delete(id: string): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM training_block_tags WHERE owner_id = ? AND id = ?`, [owner(), id]);
    },
  };
}
