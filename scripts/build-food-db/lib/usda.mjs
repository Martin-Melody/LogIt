// USDA FoodData Central CSV bundle -> normalized food rows.
//
// A bundle (Foundation or SR Legacy) unzips to a folder of CSVs. We use:
//   food.csv           fdc_id, data_type, description
//   food_nutrient.csv  fdc_id, nutrient_id, amount
//   nutrient.csv       id, name, unit_name, nutrient_nbr
//   food_portion.csv   fdc_id, amount, modifier, gram_weight, portion_description
//
// Nutrients of interest, by USDA "nutrient_nbr":
//   208 Energy (kcal) · 203 Protein · 204 Total lipid (fat) · 205 Carbohydrate, by difference
// (Foundation foods sometimes carry energy as nbr 957/958 Atwater — 208 is preferred, with
// a fallback below.)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCsvObjects } from "./csv.mjs";
import { acceptRow, buildServings, cleanName, clampKcal, clampMacro, r2 } from "./normalize.mjs";
import { config } from "../config.mjs";

const NBR = { energy: "208", energyAtwaterGeneral: "957", energyAtwaterSpecific: "958", protein: "203", fat: "204", carb: "205" };

async function csv(dir, file) {
  return parseCsvObjects(await readFile(join(dir, file), "utf8"));
}

/**
 * @param {string} dir  path to an unzipped USDA CSV bundle
 * @returns {Promise<import("./off.mjs").FoodRow[]>}
 */
export async function loadUsdaBundle(dir) {
  const [foods, nutrients, foodNutrients, portions] = await Promise.all([
    csv(dir, "food.csv"),
    csv(dir, "nutrient.csv"),
    csv(dir, "food_nutrient.csv"),
    csv(dir, "food_portion.csv").catch(() => []),
  ]);

  // nutrient_id -> nutrient_nbr
  const idToNbr = new Map();
  for (const n of nutrients) idToNbr.set(n.id, (n.nutrient_nbr || "").trim());

  // fdc_id -> { nbr -> amount }
  const byFood = new Map();
  for (const fn of foodNutrients) {
    const nbr = idToNbr.get(fn.nutrient_id);
    if (!nbr) continue;
    if (!byFood.has(fn.fdc_id)) byFood.set(fn.fdc_id, {});
    byFood.get(fn.fdc_id)[nbr] = Number(fn.amount);
  }

  // fdc_id -> portions[]
  const portionsByFood = new Map();
  for (const p of portions) {
    const grams = Number(p.gram_weight);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    const label =
      cleanName(p.portion_description) ||
      cleanName([p.amount, p.modifier].filter(Boolean).join(" ")) ||
      `${Math.round(grams)} g`;
    if (!portionsByFood.has(p.fdc_id)) portionsByFood.set(p.fdc_id, []);
    portionsByFood.get(p.fdc_id).push({ label, grams });
  }

  const rows = [];
  for (const f of foods) {
    const n = byFood.get(f.fdc_id);
    if (!n) continue;

    const kcal =
      n[NBR.energy] ?? n[NBR.energyAtwaterSpecific] ?? n[NBR.energyAtwaterGeneral];
    if (kcal == null) continue;

    const row = acceptRow({
      id: `usda:${f.fdc_id}`,
      source: "usda",
      name: cleanName(f.description),
      brand: null,
      barcode: null,
      kcal_100g: clampKcal(kcal),
      protein_100g: r2(clampMacro(n[NBR.protein] ?? 0)),
      carb_100g: r2(clampMacro(n[NBR.carb] ?? 0)),
      fat_100g: r2(clampMacro(n[NBR.fat] ?? 0)),
      popularity: config.genericPopularity,
      servings: buildServings(portionsByFood.get(f.fdc_id) ?? []),
    });
    if (row) rows.push(row);
  }
  return rows;
}
