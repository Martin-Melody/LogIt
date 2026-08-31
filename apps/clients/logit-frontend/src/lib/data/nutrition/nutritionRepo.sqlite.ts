import type { NutritionRepo } from "@logit/core/data/nutritionRepo";
import type {
  CustomFood,
  DiaryDay,
  FavoriteFood,
  NutritionGoal,
  Recipe,
  WeightEntry,
} from "@logit/core/domain/nutrition";
import { diaryDayId, favoriteFoodId } from "@logit/core/domain/nutrition";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";

function parse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Native (SQLite) nutrition repo. One JSON blob per row; owner scoping and soft-delete
 * match the checkin_submissions tables. Deletions live in the blob too (deletedAtMs) so
 * the sync loop can propagate them.
 */
export function createSqliteNutritionRepo(): NutritionRepo {
  const owner = () => getActiveOwnerId();

  async function jsonRows<T>(sql: string, params: unknown[]): Promise<T[]> {
    const res = await getDb().query(sql, params);
    return ((res.values ?? []) as { data_json: string }[])
      .map((r) => parse<T>(r.data_json))
      .filter((x): x is T => x !== null);
  }

  async function jsonRow<T>(sql: string, params: unknown[]): Promise<T | null> {
    return (await jsonRows<T>(sql, params))[0] ?? null;
  }

  /** Upsert a blob row. `date` is only passed for the tables that carry a date_iso column. */
  async function upsert(
    table: string,
    id: string,
    value: unknown,
    createdAtMs: number,
    updatedAtMs: number,
    date?: string,
  ): Promise<void> {
    const json = JSON.stringify(value);
    const deleted = (value as { deletedAtMs?: number }).deletedAtMs ?? null;
    if (date !== undefined) {
      await getDb().run(
        `INSERT INTO ${table}(id, owner_id, date_iso, data_json, created_at_ms, updated_at_ms, deleted_at_ms)
         VALUES(?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at_ms = excluded.updated_at_ms,
           deleted_at_ms = excluded.deleted_at_ms`,
        [id, owner(), date, json, createdAtMs, updatedAtMs, deleted],
      );
    } else {
      await getDb().run(
        `INSERT INTO ${table}(id, owner_id, data_json, created_at_ms, updated_at_ms, deleted_at_ms)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at_ms = excluded.updated_at_ms,
           deleted_at_ms = excluded.deleted_at_ms`,
        [id, owner(), json, createdAtMs, updatedAtMs, deleted],
      );
    }
  }

  /** Mark a row deleted in both the column and its blob, bumping updatedAtMs. */
  async function tombstone(table: string, id: string): Promise<void> {
    const now = Date.now();
    const current = await jsonRow<Record<string, unknown>>(
      `SELECT data_json FROM ${table} WHERE id = ?`,
      [id],
    );
    if (!current) return;
    const next = { ...current, deletedAtMs: now, updatedAtMs: now };
    await getDb().run(
      `UPDATE ${table} SET data_json = ?, updated_at_ms = ?, deleted_at_ms = ? WHERE id = ?`,
      [JSON.stringify(next), now, now, id],
    );
  }

  const live = (table: string) =>
    `SELECT data_json FROM ${table}
     WHERE (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL
     ORDER BY updated_at_ms DESC`;

  const forPush = (table: string) =>
    `SELECT data_json FROM ${table} WHERE (owner_id = ? OR owner_id IS NULL)`;

  return {
    // ── Diary ──
    getDay: (dateIso) =>
      jsonRow<DiaryDay>(
        `SELECT data_json FROM nutrition_days
         WHERE date_iso = ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [dateIso, owner()],
      ),
    listDaysInRange: (startIso, endIso) =>
      jsonRows<DiaryDay>(
        `SELECT data_json FROM nutrition_days
         WHERE date_iso >= ? AND date_iso <= ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL
         ORDER BY date_iso ASC`,
        [startIso, endIso, owner()],
      ),
    saveDay: (day) => upsert("nutrition_days", day.id, day, day.createdAtMs, day.updatedAtMs, day.dateIso),
    deleteDay: (dateIso) => tombstone("nutrition_days", diaryDayId(dateIso)),

    // ── Custom foods ──
    listCustomFoods: () => jsonRows<CustomFood>(live("custom_foods"), [owner()]),
    getCustomFood: (id) =>
      jsonRow<CustomFood>(
        `SELECT data_json FROM custom_foods WHERE id = ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [id, owner()],
      ),
    saveCustomFood: (f) => upsert("custom_foods", f.food.id, f, f.createdAtMs, f.updatedAtMs),
    deleteCustomFood: (id) => tombstone("custom_foods", id),

    // ── Recipes ──
    listRecipes: () => jsonRows<Recipe>(live("recipes"), [owner()]),
    getRecipe: (id) =>
      jsonRow<Recipe>(
        `SELECT data_json FROM recipes WHERE id = ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [id, owner()],
      ),
    saveRecipe: (r) => upsert("recipes", r.id, r, r.createdAtMs, r.updatedAtMs),
    deleteRecipe: (id) => tombstone("recipes", id),

    // ── Favourites ──
    listFavorites: () => jsonRows<FavoriteFood>(live("favorite_foods"), [owner()]),
    saveFavorite: (fav) =>
      upsert("favorite_foods", favoriteFoodId(fav.food.id), fav, fav.createdAtMs, fav.updatedAtMs),
    deleteFavorite: (foodRefId) => tombstone("favorite_foods", favoriteFoodId(foodRefId)),

    // ── Weight ──
    listWeightEntries: (startIso, endIso) => {
      const clauses = ["(owner_id = ? OR owner_id IS NULL)", "deleted_at_ms IS NULL"];
      const params: unknown[] = [owner()];
      if (startIso) {
        clauses.push("date_iso >= ?");
        params.push(startIso);
      }
      if (endIso) {
        clauses.push("date_iso <= ?");
        params.push(endIso);
      }
      return jsonRows<WeightEntry>(
        `SELECT data_json FROM weight_entries WHERE ${clauses.join(" AND ")} ORDER BY date_iso ASC`,
        params,
      );
    },
    getWeightEntry: (id) =>
      jsonRow<WeightEntry>(
        `SELECT data_json FROM weight_entries WHERE id = ? AND (owner_id = ? OR owner_id IS NULL) AND deleted_at_ms IS NULL`,
        [id, owner()],
      ),
    saveWeightEntry: (e) =>
      upsert("weight_entries", e.id, e, e.createdAtMs, e.updatedAtMs, e.dateIso),
    deleteWeightEntry: (id) => tombstone("weight_entries", id),

    // ── Goal ──
    getGoal: () =>
      jsonRow<NutritionGoal>(`SELECT data_json FROM nutrition_goal WHERE owner_id = ?`, [owner()]),
    async saveGoal(goal) {
      await getDb().run(
        `INSERT INTO nutrition_goal(owner_id, data_json, updated_at_ms) VALUES(?, ?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET data_json = excluded.data_json, updated_at_ms = excluded.updated_at_ms`,
        [owner(), JSON.stringify(goal), goal.updatedAtMs],
      );
    },

    // ── Sync-merge surface ──
    listDaysForPush: () => jsonRows<DiaryDay>(forPush("nutrition_days"), [owner()]),
    upsertDayFromRemote: (day) =>
      upsert("nutrition_days", day.id, day, day.createdAtMs, day.updatedAtMs, day.dateIso),
    removeDayFromRemote: (id) => tombstone("nutrition_days", id),

    listCustomFoodsForPush: () => jsonRows<CustomFood>(forPush("custom_foods"), [owner()]),
    upsertCustomFoodFromRemote: (f) =>
      upsert("custom_foods", f.food.id, f, f.createdAtMs, f.updatedAtMs),
    removeCustomFoodFromRemote: (id) => tombstone("custom_foods", id),

    listRecipesForPush: () => jsonRows<Recipe>(forPush("recipes"), [owner()]),
    upsertRecipeFromRemote: (r) => upsert("recipes", r.id, r, r.createdAtMs, r.updatedAtMs),
    removeRecipeFromRemote: (id) => tombstone("recipes", id),

    listFavoritesForPush: () => jsonRows<FavoriteFood>(forPush("favorite_foods"), [owner()]),
    upsertFavoriteFromRemote: (fav) =>
      upsert("favorite_foods", favoriteFoodId(fav.food.id), fav, fav.createdAtMs, fav.updatedAtMs),
    removeFavoriteFromRemote: (id) => tombstone("favorite_foods", id),

    listWeightEntriesForPush: () => jsonRows<WeightEntry>(forPush("weight_entries"), [owner()]),
    upsertWeightEntryFromRemote: (e) =>
      upsert("weight_entries", e.id, e, e.createdAtMs, e.updatedAtMs, e.dateIso),
    removeWeightEntryFromRemote: (id) => tombstone("weight_entries", id),

    async upsertGoalFromRemote(goal) {
      await getDb().run(
        `INSERT INTO nutrition_goal(owner_id, data_json, updated_at_ms) VALUES(?, ?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET data_json = excluded.data_json, updated_at_ms = excluded.updated_at_ms`,
        [owner(), JSON.stringify(goal), goal.updatedAtMs],
      );
    },
  };
}
