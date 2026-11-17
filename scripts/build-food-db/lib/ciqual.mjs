// ANSES CIQUAL table -> normalized food rows.
//
// CIQUAL is the French/EU generic food-composition database (~3.2k lab-analysed foods:
// "Banane crue", "Poulet rôti", …). Etalab Licence Ouverte 2.0 — attribution.
//
// The official distribution is an XLSX; this loader consumes a CSV export of it (see
// README for the one conversion step). It copes with the usual CIQUAL quirks:
//   • delimiter is ';' (French locale), sometimes ',' or tab
//   • decimal comma ("12,5")
//   • non-numeric cells: "traces", "-", "< 0,1"
//   • column headers vary between releases — matched fuzzily

import { readFile } from "node:fs/promises";
import { parseCsv } from "./csv.mjs";
import {
  acceptRow,
  buildServings,
  cleanName,
  clampKcal,
  clampMacro,
  parseLooseNumber,
  r2,
} from "./normalize.mjs";
import { config } from "../config.mjs";

function foldKey(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function detectDelimiter(firstLine) {
  const counts = { ";": 0, "\t": 0, ",": 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Locate a header column. Each candidate is either a string (exact folded-name match — tried
 * first, across every candidate) or an array of tokens (folded name must contain them all).
 * Exact wins so `alim_code` is not shadowed by `alim_grp_code`.
 */
function findColumn(foldedHeader, candidates) {
  for (const cand of candidates) {
    if (typeof cand !== "string") continue;
    const i = foldedHeader.indexOf(foldKey(cand));
    if (i >= 0) return i;
  }
  for (const cand of candidates) {
    if (typeof cand === "string") continue;
    const needles = cand.map(foldKey);
    const i = foldedHeader.findIndex((h) => needles.every((n) => h.includes(n)));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * @param {string} path  a CSV export of the CIQUAL table
 * @returns {Promise<import("./off.mjs").FoodRow[]>}
 */
export async function loadCiqualTable(path) {
  const text = await readFile(path, "utf8");
  const firstLine = text.slice(0, text.indexOf("\n"));
  const rows = parseCsv(text, detectDelimiter(firstLine));
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim());
  const folded = header.map(foldKey);

  const col = {
    code: findColumn(folded, ["alim_code", ["alim", "code"]]),
    nameEn: findColumn(folded, ["alim_nom_eng", "alim_nom_en", ["alim", "nom", "eng"]]),
    nameFr: findColumn(folded, ["alim_nom_fr", ["alim", "nom", "fr"]]),
    kcal: findColumn(folded, [["energie", "kcal"], ["energy", "kcal"]]),
    protein: findColumn(folded, [["proteines", "jones"], ["proteine"], ["protein"]]),
    carb: findColumn(folded, [["glucides"], ["glucide"], ["carbohydrate"]]),
    fat: findColumn(folded, [["lipides"], ["lipide"], ["fat"], ["lipid"]]),
    fibre: findColumn(folded, [["fibres"], ["fibre"], ["fiber"]]),
    alcohol: findColumn(folded, [["alcool"], ["alcohol"]]),
  };

  const nameCol = col.nameEn >= 0 ? col.nameEn : col.nameFr;
  if (nameCol < 0 || col.kcal < 0) {
    throw new Error(
      `CIQUAL: could not locate name / energy columns in header:\n  ${header.join(" | ")}`,
    );
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = cleanName(r[nameCol]);
    if (!name) continue;
    const code = String(r[col.code] ?? "").trim() || String(i);
    const num = (c) => (c >= 0 ? parseLooseNumber(r[c]) : NaN);
    const [protein, carb, fat] = [num(col.protein), num(col.carb), num(col.fat)];
    // A food without measured protein, carbs and fat can't be logged sensibly.
    if (![protein, carb, fat].every(Number.isFinite)) continue;
    // About a quarter of the table has no energy value (mostly prepared dishes). Work it out
    // with the EU label factors, as the table itself does.
    let kcal = num(col.kcal);
    if (!Number.isFinite(kcal)) {
      kcal = 4 * protein + 4 * carb + 9 * fat + 2 * (num(col.fibre) || 0) + 7 * (num(col.alcohol) || 0);
    }

    const row = {
      id: `ciqual:${code}`,
      source: "ciqual",
      name,
      brand: null,
      barcode: null,
      kcal_100g: clampKcal(kcal),
      protein_100g: r2(clampMacro(protein)),
      carb_100g: r2(clampMacro(carb)),
      fat_100g: r2(clampMacro(fat)),
      popularity: config.genericPopularity,
      servings: buildServings(),
    };
    const kept = acceptRow(row);
    if (kept) out.push(kept);
  }
  return out;
}
