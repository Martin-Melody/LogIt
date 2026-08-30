import type { FoodCacheStore } from "@logit/core/data/cachingFoodDbRepo";
import type { FoodRef, ServingOption } from "@logit/core/domain/nutrition";
import { getDb } from "$lib/data/db/sqlite";

type Row = {
  id: string;
  source: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
  serving_json: string;
};

function toFoodRef(r: Row): FoodRef {
  let servings: ServingOption[];
  try {
    servings = (JSON.parse(r.serving_json) as { id?: string; label: string; grams: number }[]).map(
      (s, i) => ({ id: s.id ?? `s${i}`, label: s.label, grams: s.grams }),
    );
  } catch {
    servings = [{ id: "g", label: "100 g", grams: 100 }];
  }
  return {
    id: r.id,
    source: (r.source === "usda" ? "usda" : "off") as FoodRef["source"],
    name: r.name,
    brand: r.brand ?? undefined,
    barcode: r.barcode ?? undefined,
    per100g: {
      kcal: r.kcal_100g,
      proteinG: r.protein_100g,
      carbsG: r.carb_100g,
      fatG: r.fat_100g,
    },
    servings,
  };
}

const COLS =
  "id, source, name, brand, barcode, kcal_100g, protein_100g, carb_100g, fat_100g, serving_json";

/** SQLite-backed cache of online Open Food Facts lookups (native builds). */
export function createSqliteFoodCacheStore(): FoodCacheStore {
  async function query(sql: string, params: unknown[]): Promise<Row[]> {
    const res = await getDb().query(sql, params);
    return (res.values ?? []) as Row[];
  }

  return {
    async getByBarcode(barcode) {
      const rows = await query(
        `SELECT ${COLS} FROM food_cache WHERE barcode = ? LIMIT 1`,
        [barcode.trim()],
      );
      return rows[0] ? toFoodRef(rows[0]) : null;
    },

    async getById(id) {
      const rows = await query(`SELECT ${COLS} FROM food_cache WHERE id = ? LIMIT 1`, [id]);
      return rows[0] ? toFoodRef(rows[0]) : null;
    },

    async search(q, limit) {
      const like = `%${q.trim().replace(/[%_]/g, "")}%`;
      const rows = await query(
        `SELECT ${COLS} FROM food_cache
         WHERE name LIKE ? OR brand LIKE ?
         ORDER BY cached_at_ms DESC
         LIMIT ?`,
        [like, like, Math.min(limit, 100)],
      );
      return rows.map(toFoodRef);
    },

    async put(foods) {
      if (foods.length === 0) return;
      const db = getDb();
      const now = Date.now();
      for (const f of foods) {
        await db.run(
          `INSERT INTO food_cache
             (id, source, name, brand, barcode, kcal_100g, protein_100g, carb_100g, fat_100g, serving_json, cached_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             brand = excluded.brand,
             barcode = excluded.barcode,
             kcal_100g = excluded.kcal_100g,
             protein_100g = excluded.protein_100g,
             carb_100g = excluded.carb_100g,
             fat_100g = excluded.fat_100g,
             serving_json = excluded.serving_json,
             cached_at_ms = excluded.cached_at_ms`,
          [
            f.id,
            f.source,
            f.name,
            f.brand ?? null,
            f.barcode ?? null,
            f.per100g.kcal,
            f.per100g.proteinG,
            f.per100g.carbsG,
            f.per100g.fatG,
            JSON.stringify(f.servings),
            now,
          ],
        );
      }
    },
  };
}
