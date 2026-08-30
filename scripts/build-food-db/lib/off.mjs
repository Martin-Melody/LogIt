// Open Food Facts export -> normalized food rows.
//
// Accepts either:
//   • the CSV export  (en.openfoodfacts.org.products.csv[.gz], tab-separated, ~1 GB gz)
//   • the JSONL dump  (openfoodfacts-products.jsonl[.gz], one JSON product per line, ~9 GB gz)
//
// Streamed line by line. Memory stays bounded: we keep at most ~2× the tier's target and
// prune the lowest-scoring rows whenever the working set grows past that.

import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import {
  acceptRow,
  buildServings,
  cleanName,
  clampKcal,
  clampMacro,
  completeness,
  detach,
  r2,
} from "./normalize.mjs";

/**
 * @typedef {{ id: string, source: "usda"|"off"|"ciqual", name: string, brand: string|null,
 *   barcode: string|null, kcal_100g: number, protein_100g: number, carb_100g: number,
 *   fat_100g: number, popularity: number, servings: {label:string,grams:number}[] }} FoodRow
 */

function kcalFrom(kcalRaw, energyRaw) {
  const direct = Number(kcalRaw);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const kj = Number(energyRaw); // energy_100g is in kJ
  if (Number.isFinite(kj) && kj > 0) return kj / 4.184;
  return NaN;
}

/** Real scan count. 0 for a missing / blank / unparseable value. */
function scanCount(view) {
  const raw = view.unique_scans_n ?? view.scans_n;
  if (raw == null || String(raw).trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** OFF `popularity_tags` carries entries like "top-75-percent-scans-2020" (sometimes with a
 *  language prefix). Map the best one to a 0–100 ordinal — used only for ranking. */
function tagOrdinal(tags) {
  let best = 0;
  for (const t of tags ?? []) {
    const m = /top-(\d+)-percent-scans/.exec(t);
    if (m) best = Math.max(best, 101 - Number(m[1])); // top-5-percent -> 96
  }
  return best;
}

/** Ranking weight: real scans when the product has any, else the tag ordinal (0–100). */
function rankScore(view) {
  const sc = scanCount(view);
  return sc > 0 ? sc : tagOrdinal(view.popularity_tags);
}

/** @returns {FoodRow | null} */
export function normalizeOffProduct(view, tier) {
  const barcode = String(view.code ?? "").trim();
  const name = cleanName(view.product_name);
  if (!barcode || !name) return null;

  if (tier.countries) {
    const tags = view.countries_tags ?? [];
    if (!tier.countries.some((c) => tags.includes(c))) return null;
  }

  const kcal = kcalFrom(view.kcal_100g_raw, view.energy_100g_raw);
  if (!Number.isFinite(kcal)) return null;

  const servingGrams = Number(view.serving_quantity);
  // detach() every retained string: `name` etc. may be slices of a multi-KB CSV line, and
  // keeping ~250k of those alive pins ~250k full lines — an easy multi-GB leak.
  const row = {
    id: detach(`off:${barcode}`),
    source: "off",
    name: detach(name),
    brand: detach(cleanName(String(view.brands ?? "").split(",")[0])) || null,
    barcode: detach(barcode),
    kcal_100g: clampKcal(kcal),
    protein_100g: r2(clampMacro(view.proteins_100g ?? 0)),
    carb_100g: r2(clampMacro(view.carbohydrates_100g ?? 0)),
    fat_100g: r2(clampMacro(view.fat_100g ?? 0)),
    popularity: Math.round(Math.max(0, rankScore(view))),
    servings: buildServings(
      servingGrams > 0
        ? [{ label: detach(cleanName(view.serving_size)) || "serving", grams: servingGrams }]
        : [],
    ),
  };
  return acceptRow(row);
}

// ── format adapters: raw line -> a flat "view" normalizeOffProduct understands ────────────

function splitTags(s) {
  return String(s ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

function viewFromJson(p) {
  const n = p.nutriments ?? {};
  return {
    code: p.code,
    product_name: p.product_name,
    brands: p.brands,
    countries_tags: p.countries_tags ?? [],
    serving_quantity: p.serving_quantity,
    serving_size: p.serving_size,
    kcal_100g_raw: n["energy-kcal_100g"],
    energy_100g_raw: n["energy_100g"] ?? n["energy-kj_100g"],
    proteins_100g: n.proteins_100g,
    carbohydrates_100g: n.carbohydrates_100g,
    fat_100g: n.fat_100g,
    unique_scans_n: p.unique_scans_n,
    scans_n: p.scans_n,
    popularity_tags: p.popularity_tags ?? [],
  };
}

/** The OFF CSV columns we read (everything else is skipped without allocating). */
const CSV_COLUMNS = [
  "code", "product_name", "brands", "countries_tags", "serving_quantity", "serving_size",
  "energy-kcal_100g", "energy_100g", "proteins_100g", "carbohydrates_100g", "fat_100g",
  "unique_scans_n", "scans_n", "popularity_tags",
];

/**
 * Pull just the wanted columns out of one tab-separated line in a single pass — an OFF CSV
 * row has ~110 columns and some are multi-KB, so splitting the whole thing per line is the
 * difference between a bounded build and an OOM.
 * @param {string} line
 * @param {number[]} wantAsc  column indices, ascending
 * @returns {string[]}  values in the same order as `wantAsc`
 */
function pickTsv(line, wantAsc) {
  const out = new Array(wantAsc.length);
  let col = 0;
  let start = 0;
  let w = 0;
  for (let i = 0; i <= line.length && w < wantAsc.length; i++) {
    if (i === line.length || line.charCodeAt(i) === 9 /* \t */) {
      if (col === wantAsc[w]) out[w++] = line.slice(start, i);
      col++;
      start = i + 1;
    }
  }
  return out;
}

function viewFromCsvValues(values, slotOf) {
  const at = (k) => (slotOf[k] != null ? values[slotOf[k]] : undefined);
  return {
    code: at("code"),
    product_name: at("product_name"),
    brands: at("brands"),
    countries_tags: splitTags(at("countries_tags")),
    serving_quantity: at("serving_quantity"),
    serving_size: at("serving_size"),
    kcal_100g_raw: at("energy-kcal_100g"),
    energy_100g_raw: at("energy_100g"),
    proteins_100g: at("proteins_100g"),
    carbohydrates_100g: at("carbohydrates_100g"),
    fat_100g: at("fat_100g"),
    unique_scans_n: at("unique_scans_n"),
    scans_n: at("scans_n"),
    popularity_tags: splitTags(at("popularity_tags")),
  };
}

/**
 * Stream an OFF export and return the curated set for one tier.
 * @param {string} path  .csv / .csv.gz / .jsonl / .jsonl.gz
 * @param {{ maxProducts:number, minPopularityScans:number, countries:string[]|null }} tier
 * @returns {Promise<FoodRow[]>}
 */
export async function loadOffExport(path, tier) {
  const isCsv = /\.csv(\.gz)?$/i.test(path);
  const raw = createReadStream(path);
  const stream = path.endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  /** @type {Map<string, { row: FoodRow, score: number }>} */
  let best = new Map();
  const pruneAt = Math.max(Math.round(tier.maxProducts * 1.5), 50_000);

  let seen = 0;
  let kept = 0;

  // CSV header state.
  let wantAsc = null; // ascending column indices to extract
  let slotOf = null; // column name -> its slot in the extracted array
  let hasScanColumn = !isCsv; // JSONL products carry unique_scans_n when scanned

  const prune = () => {
    const rows = [...best.values()].sort((a, b) => b.score - a.score);
    best = new Map(rows.slice(0, tier.maxProducts).map((e) => [e.row.barcode, e]));
  };

  for await (const line of rl) {
    if (!line) continue;

    if (isCsv && wantAsc === null) {
      const header = line.split("\t");
      slotOf = {};
      const idxs = [];
      for (const c of CSV_COLUMNS) {
        const i = header.indexOf(c);
        if (i >= 0) idxs.push([c, i]);
      }
      idxs.sort((a, b) => a[1] - b[1]);
      wantAsc = idxs.map(([, i]) => i);
      idxs.forEach(([c], slot) => (slotOf[c] = slot));
      hasScanColumn = slotOf.unique_scans_n != null || slotOf.scans_n != null;
      if (slotOf.code == null || slotOf.product_name == null) {
        throw new Error("OFF CSV: missing 'code' / 'product_name' columns — wrong file?");
      }
      continue;
    }

    seen++;
    if (seen % 500_000 === 0) {
      process.stderr.write(
        `  OFF: ${seen.toLocaleString()} scanned, ${best.size.toLocaleString()} candidates\n`,
      );
    }

    let view;
    if (isCsv) {
      view = viewFromCsvValues(pickTsv(line, wantAsc), slotOf);
    } else {
      try {
        view = viewFromJson(JSON.parse(line));
      } catch {
        continue;
      }
    }

    // Popularity gate. Prefer real scan counts; fall back to the tag ordinal only when the
    // export carries no scan column at all (so a scan-less export still yields something).
    if (hasScanColumn) {
      if (scanCount(view) < tier.minPopularityScans) continue;
    } else if (tagOrdinal(view.popularity_tags) < 26) {
      continue; // roughly: not in the top 75% by scan share
    }

    const row = normalizeOffProduct(view, tier);
    if (!row) continue;
    kept++;

    // Rank by popularity, break ties toward the more complete row.
    const score = Math.max(0, rankScore(view)) * 10 + completeness(row);
    const existing = best.get(row.barcode);
    if (!existing || score > existing.score) best.set(row.barcode, { row, score });

    if (best.size > pruneAt) prune();
  }

  prune();
  process.stderr.write(
    `  OFF: ${seen.toLocaleString()} products, ${kept.toLocaleString()} passed filters, ` +
      `${best.size.toLocaleString()} kept\n`,
  );

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row);
}
