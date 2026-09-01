// Curated common-foods list -> resolved food rows.
//
// The bundled DB blends BM25 text relevance with a bounded popularity nudge, which BM25
// alone can't fix for bare generic queries: "milk" surfaces "Milka", "chicken" surfaces
// "Chicken spread", because every generic USDA/CIQUAL row shares one baseline popularity.
//
// common-foods.json is a hand-curated list of staples. Each entry names a display `name`
// and a `match` string (space-separated substrings that must ALL appear, case-insensitively,
// in a source row's name); optionally `source` pins "usda" or "ciqual". At build time we
// resolve each entry to its best USDA/CIQUAL match, copy that row's macros + servings onto a
// clean row, and flag it `curated = 1` with a very high popularity so the app can float it
// to the top for generic searches.

import { completeness } from "./normalize.mjs";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A token matches when it starts at a word boundary in `name` (so "apple" hits "apples"
 * but not "pineapple", and "milk" hits "milk," but not "buttermilk"). */
const tokenHits = (name, token) => new RegExp(`(^|[^a-z0-9])${esc(token)}`).test(name);

const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Score how well a source row satisfies a curated entry, or null if it doesn't match at all.
 * All tokens must be substrings of the (lower-cased) name. Among matches we prefer names
 * that start with the first token, carry fewer comma-qualifiers (more generic), are shorter,
 * and have all four macros.
 */
export function scoreMatch(tokens, firstToken, row) {
  const name = String(row.name || "").toLowerCase();
  for (const t of tokens) if (!tokenHits(name, t)) return null;

  let score = 0;
  if (name.startsWith(firstToken)) score += 100;
  score -= (name.match(/,/g)?.length ?? 0) * 8;
  score -= name.length * 0.2;
  score += completeness(row) * 5;
  return score;
}

/**
 * @param {import("./off.mjs").FoodRow[]} rows  all collected rows (any source)
 * @param {{ name: string, match: string, source?: string }[]} list  common-foods.json entries
 * @param {{ popularity: number }} opts
 * @returns {{ rows: import("./off.mjs").FoodRow[], warnings: string[] }}
 */
export function resolveCommonFoods(rows, list, { popularity }) {
  const pool = rows.filter((r) => r.source === "usda" || r.source === "ciqual");
  const out = [];
  const warnings = [];
  const seen = new Set();

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || !entry.name || !entry.match) continue;
    const tokens = entry.match.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const first = tokens[0];

    let best = null;
    let bestScore = -Infinity;
    for (const r of pool) {
      if (entry.source && r.source !== entry.source) continue;
      const s = scoreMatch(tokens, first, r);
      if (s == null || s <= bestScore) continue;
      bestScore = s;
      best = r;
    }

    if (!best) {
      warnings.push(entry.match);
      continue;
    }

    const id = `common:${slug(entry.name)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      source: best.source,
      name: entry.name,
      brand: null,
      barcode: null,
      kcal_100g: best.kcal_100g,
      protein_100g: best.protein_100g,
      carb_100g: best.carb_100g,
      fat_100g: best.fat_100g,
      // Descend by list position so the app can order the curated block by the curator's
      // judgement (JSON order) rather than by BM25, which mis-ranks prefix hits ("egg"
      // scoring "eggplant" above "Egg, whole, raw").
      popularity: popularity - i,
      curated: 1,
      servings: best.servings,
    });
  }

  return { rows: out, warnings };
}
