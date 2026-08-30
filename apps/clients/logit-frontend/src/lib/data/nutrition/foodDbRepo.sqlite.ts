import type { FoodDbRepo, FoodSearchOptions } from "@logit/core/data/foodDbRepo";
import type { FoodRef, ServingOption } from "@logit/core/domain/nutrition";
import { getFoodDb } from "$lib/data/db/sqlite";

type FoodRow = {
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

function toFoodRef(r: FoodRow): FoodRef {
  let servings: ServingOption[];
  try {
    servings = (JSON.parse(r.serving_json) as { label: string; grams: number }[]).map((s, i) => ({
      id: `s${i}`,
      label: s.label,
      grams: s.grams,
    }));
  } catch {
    servings = [{ id: "g", label: "100 g", grams: 100 }];
  }
  return {
    id: r.id,
    source: (r.source === "off" ? "off" : "usda") as FoodRef["source"],
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

/** "chicken br" -> "chicken* br*" — prefix tokens for FTS5. */
function ftsQuery(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(" ");
}

const COL_LIST = [
  "id",
  "source",
  "name",
  "brand",
  "barcode",
  "kcal_100g",
  "protein_100g",
  "carb_100g",
  "fat_100g",
  "serving_json",
];
const COLS = COL_LIST.join(", ");
const F_COLS = COL_LIST.map((c) => `f.${c}`).join(", ");

export function createSqliteFoodDbRepo(): FoodDbRepo {
  // null = not probed yet
  let ftsOk: boolean | null = null;

  async function query(sql: string, params: unknown[]): Promise<FoodRow[]> {
    const db = getFoodDb();
    if (!db) return [];
    const res = await db.query(sql, params);
    return (res.values ?? []) as FoodRow[];
  }

  async function hasFts(): Promise<boolean> {
    if (ftsOk !== null) return ftsOk;
    try {
      await query("SELECT rowid FROM foods_fts WHERE foods_fts MATCH 'a*' LIMIT 1", []);
      ftsOk = true;
    } catch {
      ftsOk = false;
    }
    return ftsOk;
  }

  return {
    isOfflineAvailable: () => getFoodDb() !== null,

    async searchFoods(q, opts: FoodSearchOptions = {}) {
      const db = getFoodDb();
      if (!db || !q.trim()) return [];
      const limit = Math.min(opts.limit ?? 25, 100);
      const sourceClause = opts.source ? " AND f.source = ?" : "";
      const sourceParam = opts.source ? [opts.source] : [];

      if (await hasFts()) {
        const match = ftsQuery(q);
        if (!match) return [];
        // Blend BM25 relevance (`rank`, negative — lower is better) with a small bounded
        // popularity nudge (≤2 rank-points), so a bare "banana" surfaces the generic entry
        // ahead of an obscure branded "…Bananallama…" without letting a high-scan brand
        // name swamp relevance. Generic USDA/CIQUAL foods carry popularity ~400.
        const rows = await query(
          `SELECT ${F_COLS} FROM foods_fts
           JOIN foods f ON f.rowid = foods_fts.rowid
           WHERE foods_fts MATCH ?${sourceClause}
           ORDER BY rank - (MIN(f.popularity, 800) / 400.0) LIMIT ?`,
          [match, ...sourceParam, limit],
        );
        return rows.map(toFoodRef);
      }

      // LIKE fallback (platforms without FTS5).
      const like = `%${q.trim().replace(/[%_]/g, "")}%`;
      const rows = await query(
        `SELECT ${COLS} FROM foods
         WHERE (name LIKE ? OR brand LIKE ?)${opts.source ? " AND source = ?" : ""}
         ORDER BY popularity DESC, length(name) LIMIT ?`,
        [like, like, ...sourceParam, limit],
      );
      return rows.map(toFoodRef);
    },

    async getFood(id) {
      const rows = await query(`SELECT ${COLS} FROM foods WHERE id = ? LIMIT 1`, [id]);
      return rows[0] ? toFoodRef(rows[0]) : null;
    },

    async getFoodByBarcode(barcode) {
      const rows = await query(`SELECT ${COLS} FROM foods WHERE barcode = ? LIMIT 1`, [
        barcode.trim(),
      ]);
      return rows[0] ? toFoodRef(rows[0]) : null;
    },
  };
}
