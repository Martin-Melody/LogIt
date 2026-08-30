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

/** Find the header index whose folded name contains every token in one of the candidates. */
function findColumn(foldedHeader, candidates) {
  for (const cand of candidates) {
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
    code: findColumn(folded, [["alim", "code"], ["code"]]),
    nameEn: findColumn(folded, [["alim", "nom", "eng"], ["alim", "nom", "en"]]),
    nameFr: findColumn(folded, [["alim", "nom", "fr"], ["alim", "nom"]]),
    kcal: findColumn(folded, [["energie", "kcal"], ["energy", "kcal"]]),
    protein: findColumn(folded, [["proteine"], ["protein"]]),
    carb: findColumn(folded, [["glucide"], ["carbohydrate"]]),
    fat: findColumn(folded, [["lipide"], ["fat"], ["lipid"]]),
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

    const row = {
      id: `ciqual:${code}`,
      source: "ciqual",
      name,
      brand: null,
      barcode: null,
      kcal_100g: clampKcal(parseLooseNumber(r[col.kcal])),
      protein_100g: r2(clampMacro(col.protein >= 0 ? parseLooseNumber(r[col.protein]) : 0)),
      carb_100g: r2(clampMacro(col.carb >= 0 ? parseLooseNumber(r[col.carb]) : 0)),
      fat_100g: r2(clampMacro(col.fat >= 0 ? parseLooseNumber(r[col.fat]) : 0)),
      popularity: config.genericPopularity,
      servings: buildServings(),
    };
    const kept = acceptRow(row);
    if (kept) out.push(kept);
  }
  return out;
}
