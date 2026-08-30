// Open Food Facts export -> normalized food rows.
//
// Accepts either:
//   • the CSV export  (en.openfoodfacts.org.products.csv[.gz], tab-separated, ~1 GB gz)
//   • the JSONL dump  (openfoodfacts-products.jsonl[.gz], one JSON product per line, ~9 GB gz)
//
// We stream it, keep products with a barcode + name + complete, plausible nutrition, apply
// the tier's country and popularity filters, dedupe by barcode (best row wins), then rank
// by scan popularity and cap at tier.maxProducts.

import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { config } from "../config.mjs";
import {
  acceptRow,
  buildServings,
  cleanName,
  clampKcal,
  clampMacro,
  completeness,
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

/** OFF `popularity_tags` carries entries like "top-75-percent-scans-2020" when scan
 *  counts are absent from an export. Map that to a coarse ordinal. */
function popularityFromTags(tags) {
  let best = 0;
  for (const t of tags) {
    const m = /^top-(\d+)-percent-scans/.exec(t);
    if (m) best = Math.max(best, 101 - Number(m[1])); // top-5-percent -> 96
  }
  return best;
}

function popularityOf(view) {
  const scans = Number(view.unique_scans_n ?? view.scans_n ?? 0);
  if (Number.isFinite(scans) && scans > 0) return Math.round(scans);
  return popularityFromTags(view.popularity_tags ?? []);
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
  const row = {
    id: `off:${barcode}`,
    source: "off",
    name,
    brand: cleanName(String(view.brands ?? "").split(",")[0]) || null,
    barcode,
    kcal_100g: clampKcal(kcal),
    protein_100g: r2(clampMacro(view.proteins_100g ?? 0)),
    carb_100g: r2(clampMacro(view.carbohydrates_100g ?? 0)),
    fat_100g: r2(clampMacro(view.fat_100g ?? 0)),
    popularity: popularityOf(view),
    servings: buildServings(
      servingGrams > 0
        ? [{ label: cleanName(view.serving_size) || "serving", grams: servingGrams }]
        : [],
    ),
  };
  return acceptRow(row);
}

// ── format adapters: raw line -> a flat "view" normalizeOffProduct understands ────────────

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

function viewFromCsvRow(cols, idx) {
  const get = (k) => (idx[k] != null ? cols[idx[k]] : undefined);
  const splitTags = (s) => String(s ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return {
    code: get("code"),
    product_name: get("product_name"),
    brands: get("brands"),
    countries_tags: splitTags(get("countries_tags")),
    serving_quantity: get("serving_quantity"),
    serving_size: get("serving_size"),
    kcal_100g_raw: get("energy-kcal_100g"),
    energy_100g_raw: get("energy_100g"),
    proteins_100g: get("proteins_100g"),
    carbohydrates_100g: get("carbohydrates_100g"),
    fat_100g: get("fat_100g"),
    unique_scans_n: get("unique_scans_n"),
    scans_n: get("scans_n"),
    popularity_tags: splitTags(get("popularity_tags")),
  };
}

const CSV_COLUMNS = [
  "code", "product_name", "brands", "countries_tags", "serving_quantity", "serving_size",
  "energy-kcal_100g", "energy_100g", "proteins_100g", "carbohydrates_100g", "fat_100g",
  "unique_scans_n", "scans_n", "popularity_tags",
];

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
  const best = new Map();
  let seen = 0;
  let kept = 0;
  /** @type {Record<string, number>|null} */
  let csvIdx = null;

  for await (const line of rl) {
    if (!line) continue;

    if (isCsv && csvIdx === null) {
      const header = line.split("\t");
      csvIdx = {};
      for (const c of CSV_COLUMNS) {
        const i = header.indexOf(c);
        if (i >= 0) csvIdx[c] = i;
      }
      if (csvIdx.code == null || csvIdx.product_name == null) {
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
      view = viewFromCsvRow(line.split("\t"), csvIdx);
    } else {
      try {
        view = viewFromJson(JSON.parse(line));
      } catch {
        continue;
      }
    }

    const pop = popularityOf(view);
    if (pop < tier.minPopularityScans) continue;

    const row = normalizeOffProduct(view, tier);
    if (!row) continue;
    kept++;

    // Rank primarily by popularity, break ties toward the more complete row.
    const score = pop * 10 + completeness(row);
    const existing = best.get(row.barcode);
    if (!existing || score > existing.score) best.set(row.barcode, { row, score });
  }

  process.stderr.write(
    `  OFF: ${seen.toLocaleString()} products, ${kept.toLocaleString()} passed filters, ` +
      `${best.size.toLocaleString()} unique\n`,
  );

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, tier.maxProducts)
    .map((x) => x.row);
}
