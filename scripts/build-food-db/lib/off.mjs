// Open Food Facts JSONL export -> normalized food rows.
//
// The full export (openfoodfacts-products.jsonl.gz, ~9 GB gz) is one JSON product per line.
// We stream it, keep only products with a barcode, a name and complete + plausible
// nutrition, then rank by scan popularity and cap at config.off.maxProducts.

import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { config } from "../config.mjs";
import { buildServings, cleanName, clampKcal, clampMacro, isEmptyNutrition, r2 } from "./normalize.mjs";

/**
 * @typedef {{ id: string, source: "usda"|"off", name: string, brand: string|null,
 *   barcode: string|null, kcal_100g: number, protein_100g: number, carb_100g: number,
 *   fat_100g: number, servings: {label:string,grams:number}[] }} FoodRow
 */

function kcalFromNutriments(nutr) {
  const direct = Number(nutr["energy-kcal_100g"]);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const kj = Number(nutr["energy_100g"] ?? nutr["energy-kj_100g"]);
  if (Number.isFinite(kj) && kj > 0) return kj / 4.184;
  return NaN;
}

function popularity(p) {
  return Number(p.unique_scans_n ?? p.scans_n ?? p.popularity_key ?? 0) || 0;
}

/** @param {string} productName */
function passesCountryFilter(p) {
  if (!config.off.countries) return true;
  const tags = p.countries_tags ?? [];
  return config.off.countries.some((c) => tags.includes(c));
}

/** @returns {FoodRow | null} */
export function normalizeOffProduct(p) {
  const barcode = String(p.code ?? "").trim();
  const name = cleanName(p.product_name);
  if (!barcode || !name) return null;
  if (!passesCountryFilter(p)) return null;

  const nutr = p.nutriments ?? {};
  const kcal = kcalFromNutriments(nutr);
  if (!Number.isFinite(kcal)) return null;

  const row = {
    id: `off:${barcode}`,
    source: "off",
    name,
    brand: cleanName(String(p.brands ?? "").split(",")[0]) || null,
    barcode,
    kcal_100g: clampKcal(kcal),
    protein_100g: r2(clampMacro(nutr.proteins_100g ?? 0)),
    carb_100g: r2(clampMacro(nutr.carbohydrates_100g ?? 0)),
    fat_100g: r2(clampMacro(nutr.fat_100g ?? 0)),
    servings: buildServings(
      Number(p.serving_quantity) > 0
        ? [{ label: cleanName(p.serving_size) || "serving", grams: Number(p.serving_quantity) }]
        : [],
    ),
  };
  if (isEmptyNutrition(row)) return null;
  return row;
}

/**
 * Stream a .jsonl or .jsonl.gz export and return the curated set.
 * @param {string} path
 * @returns {Promise<FoodRow[]>}
 */
export async function loadOffExport(path) {
  const raw = createReadStream(path);
  const stream = path.endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  /** @type {Map<string, { row: FoodRow, pop: number }>} */
  const best = new Map();
  let seen = 0;
  let kept = 0;

  for await (const line of rl) {
    if (!line) continue;
    seen++;
    if (seen % 500_000 === 0) {
      process.stderr.write(`  OFF: ${seen.toLocaleString()} scanned, ${best.size.toLocaleString()} candidates\n`);
    }
    let p;
    try {
      p = JSON.parse(line);
    } catch {
      continue;
    }
    const pop = popularity(p);
    if (pop < config.off.minPopularityScans) continue;
    const row = normalizeOffProduct(p);
    if (!row) continue;
    kept++;
    const existing = best.get(row.barcode);
    if (!existing || pop > existing.pop) best.set(row.barcode, { row, pop });
  }

  process.stderr.write(`  OFF: ${seen.toLocaleString()} products, ${kept.toLocaleString()} passed filters, ${best.size.toLocaleString()} unique\n`);

  return [...best.values()]
    .sort((a, b) => b.pop - a.pop)
    .slice(0, config.off.maxProducts)
    .map((x) => x.row);
}
