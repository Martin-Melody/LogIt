import type { ProgressionRepo } from "@logit/core/data/progressionRepo";
import type { ExerciseProgressionState, UserProgressionConfig } from "@logit/core/domain/progression";
import type { UserAnalyticsConfig } from "@logit/core/domain/analytics";
import type { UserMobilityProgressionConfig } from "@logit/core/domain/mobilityProgression";
import type { UserMuscleGroupInsightConfig } from "@logit/core/domain/muscleGroupInsight";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { nowMs } from "@logit/core/domain/time";

function owner(): string {
  return getActiveOwnerId() ?? "default";
}

// Reuses the algorithm_preferences KV table under a reserved key, so no schema
// migration is needed for the mobility algorithm choice.
const MOBILITY_CONFIG_KEY = "__mobility_progression_config__";
// Same trick, same table, for the muscle-group-insight algorithm choice (§5
// option B) — one more reserved key, not a new table.
const MUSCLE_GROUP_INSIGHT_CONFIG_KEY = "__muscle_group_insight_config__";

export function createSqliteProgressionRepo(): ProgressionRepo {
  return {
    async getConfig(): Promise<UserProgressionConfig | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT data FROM progression_config WHERE owner_id = ?`,
        [owner()],
      );
      const row = res.values?.[0] as { data: string } | undefined;
      if (!row) return null;
      try { return JSON.parse(row.data) as UserProgressionConfig; } catch { return null; }
    },

    async saveConfig(config: UserProgressionConfig): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO progression_config(owner_id, data) VALUES(?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET data = excluded.data`,
        [owner(), JSON.stringify(config)],
      );
    },

    async clearConfig(): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM progression_config WHERE owner_id = ?`, [owner()]);
    },

    async getMobilityConfig(): Promise<UserMobilityProgressionConfig | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT data FROM algorithm_preferences WHERE owner_id = ? AND algorithm_id = ?`,
        [owner(), MOBILITY_CONFIG_KEY],
      );
      const row = res.values?.[0] as { data: string } | undefined;
      if (!row) return null;
      try { return JSON.parse(row.data) as UserMobilityProgressionConfig; } catch { return null; }
    },

    async saveMobilityConfig(config: UserMobilityProgressionConfig): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO algorithm_preferences(owner_id, algorithm_id, data) VALUES(?, ?, ?)
         ON CONFLICT(owner_id, algorithm_id) DO UPDATE SET data = excluded.data`,
        [owner(), MOBILITY_CONFIG_KEY, JSON.stringify(config)],
      );
    },

    async clearMobilityConfig(): Promise<void> {
      const db = getDb();
      await db.run(
        `DELETE FROM algorithm_preferences WHERE owner_id = ? AND algorithm_id = ?`,
        [owner(), MOBILITY_CONFIG_KEY],
      );
    },

    async getMuscleGroupInsightConfig(): Promise<UserMuscleGroupInsightConfig | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT data FROM algorithm_preferences WHERE owner_id = ? AND algorithm_id = ?`,
        [owner(), MUSCLE_GROUP_INSIGHT_CONFIG_KEY],
      );
      const row = res.values?.[0] as { data: string } | undefined;
      if (!row) return null;
      try { return JSON.parse(row.data) as UserMuscleGroupInsightConfig; } catch { return null; }
    },

    async saveMuscleGroupInsightConfig(config: UserMuscleGroupInsightConfig): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO algorithm_preferences(owner_id, algorithm_id, data) VALUES(?, ?, ?)
         ON CONFLICT(owner_id, algorithm_id) DO UPDATE SET data = excluded.data`,
        [owner(), MUSCLE_GROUP_INSIGHT_CONFIG_KEY, JSON.stringify(config)],
      );
    },

    async clearMuscleGroupInsightConfig(): Promise<void> {
      const db = getDb();
      await db.run(
        `DELETE FROM algorithm_preferences WHERE owner_id = ? AND algorithm_id = ?`,
        [owner(), MUSCLE_GROUP_INSIGHT_CONFIG_KEY],
      );
    },

    async getAnalyticsConfig(): Promise<UserAnalyticsConfig | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT data FROM analytics_config WHERE owner_id = ?`,
        [owner()],
      );
      const row = res.values?.[0] as { data: string } | undefined;
      if (!row) return null;
      try { return JSON.parse(row.data) as UserAnalyticsConfig; } catch { return null; }
    },

    async saveAnalyticsConfig(config: UserAnalyticsConfig): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO analytics_config(owner_id, data) VALUES(?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET data = excluded.data`,
        [owner(), JSON.stringify(config)],
      );
    },

    async clearAnalyticsConfig(): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM analytics_config WHERE owner_id = ?`, [owner()]);
    },

    async getExerciseState(key: string): Promise<ExerciseProgressionState | null> {
      const db = getDb();
      const res = await db.query(
        `SELECT data FROM progression_states WHERE owner_id = ? AND key = ?`,
        [owner(), key],
      );
      const row = res.values?.[0] as { data: string } | undefined;
      if (!row) return null;
      try { return JSON.parse(row.data) as ExerciseProgressionState; } catch { return null; }
    },

    async saveExerciseState(state: ExerciseProgressionState): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO progression_states(owner_id, key, data, updated_at_ms) VALUES(?, ?, ?, ?)
         ON CONFLICT(owner_id, key) DO UPDATE SET data = excluded.data, updated_at_ms = excluded.updated_at_ms`,
        [owner(), state.key, JSON.stringify(state), nowMs()],
      );
    },

    async listExerciseStates(): Promise<ExerciseProgressionState[]> {
      const db = getDb();
      const res = await db.query(
        `SELECT data FROM progression_states WHERE owner_id = ? ORDER BY updated_at_ms DESC`,
        [owner()],
      );
      return ((res.values ?? []) as { data: string }[]).flatMap((row) => {
        try { return [JSON.parse(row.data) as ExerciseProgressionState]; } catch { return []; }
      });
    },

    async clearStates(): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM progression_states WHERE owner_id = ?`, [owner()]);
    },

    async resetExerciseState(key: string): Promise<void> {
      const db = getDb();
      await db.run(`DELETE FROM progression_states WHERE owner_id = ? AND key = ?`, [owner(), key]);
    },

    async getAlgorithmPreferences(algorithmId: string): Promise<unknown> {
      const db = getDb();
      const res = await db.query(
        `SELECT data FROM algorithm_preferences WHERE owner_id = ? AND algorithm_id = ?`,
        [owner(), algorithmId],
      );
      const row = res.values?.[0] as { data: string } | undefined;
      if (!row) return null;
      try { return JSON.parse(row.data); } catch { return null; }
    },

    async setAlgorithmPreferences(algorithmId: string, prefs: unknown): Promise<void> {
      const db = getDb();
      await db.run(
        `INSERT INTO algorithm_preferences(owner_id, algorithm_id, data) VALUES(?, ?, ?)
         ON CONFLICT(owner_id, algorithm_id) DO UPDATE SET data = excluded.data`,
        [owner(), algorithmId, JSON.stringify(prefs)],
      );
    },
  };
}
