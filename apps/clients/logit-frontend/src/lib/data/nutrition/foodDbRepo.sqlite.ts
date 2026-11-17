import type { FoodDbRepo, FoodSearchOptions } from "@logit/core/data/foodDbRepo";
import type { FoodRef, ServingOption } from "@logit/core/domain/nutrition";
import { getFoodDb } from "$lib/data/db/sqlite";
import {
  closestTerms,
  ftsQueries,
  normalizeText,
  prepareQuery,
  queryWords,
  sameFoodKey,
  scoreName,
} from "@logit/core/nutrition/foodSearch";

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
  popularity?: number;
  curated?: number;
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
  "popularity",
];
const COLS = COL_LIST.join(", ");
const F_COLS = COL_LIST.map((c) => `f.${c}`).join(", ");

function dedupeRows(a: FoodRow[], b: FoodRow[]): FoodRow[] {
  const seen = new Set(a.map((r) => r.id));
  return [...a, ...b.filter((r) => !seen.has(r.id))];
}

/** Text match first; curated staples and popular products break near-ties. The same
 * product listed twice (same name and brand) shows once. */
function rerank(q: string, rows: FoodRow[], limit: number, fixes?: Map<string, string[]>): FoodRef[] {
  const pq = prepareQuery(q, fixes);
  const seen = new Set<string>();
  return rows
    .map((r, i) => {
      const text = scoreName(pq, r.name, r.brand);
      const pop = Math.min(Math.log10((r.popularity ?? 0) + 1), 3) * 0.04;
      const generic = r.source !== "off" ? 0.05 : 0;
      const staple = r.curated && text >= 0.9 ? 0.2 : 0;
      return { r, i, s: text > 0 ? text + staple + pop + generic : 0 };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .filter((x) => {
      const k = sameFoodKey(x.r.name, x.r.brand);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit)
    .map((x) => toFoodRef(x.r));
}

export function createSqliteFoodDbRepo(): FoodDbRepo {
  // null = not probed yet
  let ftsOk: boolean | null = null;
  let curatedOk: boolean | null = null;

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

  // `curated` was added to the bundled DB after first release. An older copy (copyFromAssets
  // won't overwrite one already unpacked) lacks it — fall back to popularity-only ordering.
  async function hasCurated(): Promise<boolean> {
    if (curatedOk !== null) return curatedOk;
    try {
      await query("SELECT curated FROM foods LIMIT 1", []);
      curatedOk = true;
    } catch {
      curatedOk = false;
    }
    return curatedOk;
  }

  let vocabOk: boolean | null = null;
  async function hasVocab(): Promise<boolean> {
    if (vocabOk !== null) return vocabOk;
    try {
      await query("SELECT term FROM vocab LIMIT 1", []);
      vocabOk = true;
    } catch {
      vocabOk = false;
    }
    return vocabOk;
  }

  /** Much more common close spellings for each query word ("chiken" → "chicken"). */
  async function typoFixes(q: string): Promise<Map<string, string[]>> {
    const fixes = new Map<string, string[]>();
    if (!(await hasVocab())) return fixes;
    for (const w of queryWords(q)) {
      if (w.length < 4 || /[^a-z]/.test(w)) continue;
      const db = getFoodDb();
      if (!db) break;
      const known = await db.query("SELECT docs FROM vocab WHERE term = ? LIMIT 1", [w]);
      const docs = Number((known.values?.[0] as { docs?: number } | undefined)?.docs ?? 0);
      // Typos rarely hit the first letter; compare against words sharing it.
      const near = await vocabNear(w[0], w.length);
      const best = closestTerms(normalizeText(w), near, 2, docs);
      if (best.length) fixes.set(w, best);
    }
    return fixes;
  }

  async function vocabNear(first: string, len: number): Promise<{ term: string; docs: number }[]> {
    const db = getFoodDb();
    if (!db) return [];
    const res = await db.query(
      "SELECT term, docs FROM vocab WHERE term >= ? AND term < ? AND length(term) BETWEEN ? AND ?",
      [first, `${first}{`, len - 2, len + 2],
    );
    return (res.values ?? []) as { term: string; docs: number }[];
  }

  return {
    isOfflineAvailable: () => getFoodDb() !== null,

    async searchFoods(q, opts: FoodSearchOptions = {}) {
      const db = getFoodDb();
      if (!db || !q.trim()) return [];
      const limit = Math.min(opts.limit ?? 25, 100);
      // "usda" stands for every generic table (USDA and CIQUAL); the app's FoodRef has no
      // separate CIQUAL source.
      const generic = opts.source === "usda";
      const sourceClause = !opts.source ? "" : generic ? " AND f.source != 'off'" : " AND f.source = ?";
      const sourceParam = opts.source && !generic ? [opts.source] : [];
      const curated = await hasCurated();
      const curatedCol = curated ? ", f.curated" : "";

      if (!(await hasFts())) {
        // LIKE fallback (platforms without FTS5): any word, ranked in JS below.
        const ws = queryWords(q).slice(0, 4);
        if (ws.length === 0) return [];
        const where = ws.map(() => "(name LIKE ? OR brand LIKE ?)").join(" OR ");
        const params = ws.flatMap((w) => [`%${w}%`, `%${w}%`]);
        const rows = await query(
          `SELECT ${COLS}${curated ? ", curated" : ""} FROM foods
           WHERE (${where})${sourceClause.replace("f.source", "source")}
           ORDER BY popularity DESC LIMIT ?`,
          [...params, ...sourceParam, limit * 4],
        );
        return rerank(q, rows, limit);
      }

      // Pull a generous candidate set from FTS (every word first, then any word), then
      // rank it with the same rules as the rest of the app's food search. Likely typo
      // corrections ride along as extra spellings. Generic foods get their own small pass
      // so 250k packaged products can't crowd plain "Egg, whole" out of the pool.
      const pool = limit * 4;
      async function run(match: string, n: number, genericOnly = false): Promise<FoodRow[]> {
        return query(
          `SELECT ${F_COLS}${curatedCol} FROM foods_fts
           JOIN foods f ON f.rowid = foods_fts.rowid
           WHERE foods_fts MATCH ?${sourceClause}${genericOnly ? " AND f.source != 'off'" : ""}
           ORDER BY ${genericOnly && curated ? "f.curated DESC, " : ""}rank - (MIN(f.popularity, 800) / 400.0) LIMIT ?`,
          [match, ...sourceParam, n],
        ).catch(() => []);
      }

      const fixes = await typoFixes(q);
      const fq = ftsQueries(q, fixes);
      if (!fq) return [];
      const generics = opts.source === "off" ? [] : await run(fq.all, 12, true);
      let rows = dedupeRows(generics, await run(fq.all, pool));
      if (rows.length < limit) rows = dedupeRows(rows, await run(fq.any, pool));
      return rerank(q, rows, limit, fixes);
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
