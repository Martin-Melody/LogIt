import { kcalFromMacros, type MacroTotals } from "../domain/nutrition";

// Extracts per-100 g macros from the raw text of a photographed nutrition label.
// Pure and OCR-agnostic: the caller feeds in whatever text a recognizer produced
// (on-device Tesseract today, a cloud vision model later) and gets back a best
// guess plus warnings, which the UI shows for the user to correct before saving.

export type LabelLayout = "eu" | "us" | "unknown";

export interface ParsedLabel {
  layout: LabelLayout;
  /** Best-effort macros per 100 g / 100 ml. Present when a 100 g basis could be
   *  resolved — directly (EU per-100g column) or derived (US per-serving ÷ size). */
  per100g?: MacroTotals;
  /** Macros exactly as printed for one serving, when the label is serving-based. */
  perServing?: MacroTotals;
  /** Printed serving size in grams (ml treated as g). */
  servingSizeG?: number;
  /** 0..1 — share of the four macro fields that resolved cleanly, less a penalty per warning. */
  confidence: number;
  warnings: string[];
  /** The text we parsed, kept so the correction form can show it. */
  raw: string;
}

const KJ_PER_KCAL = 4.184;

/** Parse one numeric token: handles "1,2" (EU comma), "1 046" (space thousands),
 *  "< 0.5", "0", and a trailing unit we ignore. Returns null if there's no number. */
function parseNum(token: string): number | null {
  const m = token.match(/(<\s*)?(\d[\d\s]*(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[2].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** All numeric values on a line, in order (e.g. a "Fat  3,2 g   8,0 g" row → [3.2, 8]). */
function numbersOnLine(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(/(?<![\w.])(\d[\d\s]*(?:[.,]\d+)?)/g)) {
    const n = Number(m[1].replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const NUTRIENT_NAME =
  /energ|\bfat\b|lipid|grass|grasa|gordura|\bvet\b|carbo|carbs\b|glucides|kohlenhydr|hidratos|koolhydr|protein|prot[eé][iï]?n|eiwei|eiwit|\bsalt\b|\bsalz\b|\bsel\b|sodium|fib(re|er)|sugars?|zucker|sucres|of which|dont|davon|saturat|satur[ée]|calories/;

function normalize(raw: string): string[] {
  const lines = raw
    .replace(/–|—/g, "-")
    .replace(/[|¦]/g, " ")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);

  // OCR often breaks a two-column table into one token per line ("Fat" / "3.2g").
  const valueOnly = /^(?:[\d\s.,/()<%~-]|kj|kcal|cal|mg|ml|kg|g)+$/i;
  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    // (a) a bare nutrient name followed by a value-only line
    const orphanName = next && !/\d/.test(line) && NUTRIENT_NAME.test(line);
    // (b) an energy line that only made it to kJ, with the kcal on the next line
    const energySplit =
      next && /energ|\bkj\b/i.test(line) && !/kcal/i.test(line) && /kcal/i.test(next);
    if (next && (orphanName || energySplit) && /\d/.test(next) && valueOnly.test(next)) {
      merged.push(`${line} ${next}`);
      i += 1;
      continue;
    }
    merged.push(line);
  }
  return merged;
}

/** Grams read from a nutrient row. Prefers an explicit "N g" / "N mg"; otherwise
 *  takes a bare number and undoes the very common OCR slip of reading a trailing
 *  "g" as "9" (e.g. "3.29" was "3.2 g"). */
function gramsValue(row: string | undefined, col: 0 | 1): number | null {
  if (!row) return null;
  const withUnit = [...row.matchAll(/(\d[\d\s]*(?:[.,]\d+)?)\s?(mg|g)\b/g)];
  if (withUnit.length) {
    const pick = withUnit[col] ?? withUnit[0];
    const n = parseNum(pick[1]);
    if (n === null) return null;
    return pick[2] === "mg" ? n / 1000 : n;
  }
  const bare = numbersOnLine(row);
  if (!bare.length) return null;
  const v = bare[col] ?? bare[0];
  const token = String(v);
  // Labels print macros to at most one decimal, so "3.29" is "3.2 g" with the g
  // read as a 9. Two decimals ending in 9 → drop it.
  if (/^\d+\.\d9$/.test(token)) return Number(token.slice(0, -1));
  return v;
}

function detectLayout(lines: string[]): LabelLayout {
  const text = lines.join(" ");
  if (/nutrition facts|% daily value|calories per serving/.test(text)) return "us";
  if (/per 100\s?(g|ml)|100\s?g\b|typical values|nutrition(al)? information|kj\b/.test(text)) {
    return "eu";
  }
  return "unknown";
}

/** Which of the (usually two) numbers on a nutrient row is the per-100g one. */
function pickHundredColumn(lines: string[]): 0 | 1 {
  const header = lines.find(
    (l) => /100\s?(g|ml)/.test(l) && /(serving|portion|pot|bag|pack|slice|piece|per bar)/.test(l),
  );
  if (!header) return 0;
  const per100Idx = header.search(/100\s?(g|ml)/);
  const servingIdx = header.search(/serving|portion|pot|bag|pack|slice|piece|per bar/);
  return per100Idx <= servingIdx ? 0 : 1;
}

function findRow(lines: string[], re: RegExp, exclude?: RegExp): string | undefined {
  return lines.find((l) => re.test(l) && !(exclude && exclude.test(l)));
}

function parseServingSize(lines: string[]): number | undefined {
  for (const l of lines) {
    if (!/serving size|portion|per serving|einzelportion|par portion/.test(l)) continue;
    const paren = l.match(/\(([^)]*\d[^)]*)\)/);
    const hay = paren ? paren[1] : l;
    const m = hay.match(/(\d[\d\s]*(?:[.,]\d+)?)\s?(g|ml|gram|grams)\b/);
    if (m) {
      const n = parseNum(m[1]);
      if (n && n > 0) return n;
    }
  }
  return undefined;
}

function energyKcal(row: string | undefined, col: 0 | 1): number | null {
  if (!row) return null;
  const kcalMatch = row.match(/([\d\s.,]+)\s?kcal/);
  if (kcalMatch) {
    // A row can carry both columns' kcal ("… 250 kcal … 375 kcal").
    const all = [...row.matchAll(/([\d\s.,]+)\s?kcal/g)].map((m) => parseNum(m[1]) ?? NaN);
    const pick = all[col] ?? all[0];
    if (Number.isFinite(pick)) return pick;
  }
  const kjMatch = row.match(/([\d\s.,]+)\s?kj/);
  if (kjMatch) {
    const all = [...row.matchAll(/([\d\s.,]+)\s?kj/g)].map((m) => parseNum(m[1]) ?? NaN);
    const pick = all[col] ?? all[0];
    if (Number.isFinite(pick)) return Math.round(pick / KJ_PER_KCAL);
  }
  return null;
}

function assemble(
  layout: LabelLayout,
  raw: string,
  macros: { kcal: number | null; fatG: number | null; carbsG: number | null; proteinG: number | null },
  opts: { per100g?: MacroTotals; perServing?: MacroTotals; servingSizeG?: number } = {},
): ParsedLabel {
  const warnings: string[] = [];
  const present = (["kcal", "fatG", "carbsG", "proteinG"] as const).filter(
    (k) => macros[k] !== null && !Number.isNaN(macros[k]),
  );

  let kcal = macros.kcal;
  if (kcal === null && present.length >= 2) {
    kcal = Math.round(kcalFromMacros(macros.proteinG ?? 0, macros.carbsG ?? 0, macros.fatG ?? 0));
    warnings.push("Energy not read — estimated from protein/carb/fat (4/4/9).");
  }
  for (const [k, label] of [
    ["fatG", "Fat"],
    ["carbsG", "Carbohydrate"],
    ["proteinG", "Protein"],
  ] as const) {
    if (macros[k] === null) warnings.push(`${label} not found — enter it manually.`);
  }

  const per100g: MacroTotals | undefined =
    opts.per100g ??
    (kcal !== null || present.length > 0
      ? {
          kcal: kcal ?? 0,
          proteinG: macros.proteinG ?? 0,
          carbsG: macros.carbsG ?? 0,
          fatG: macros.fatG ?? 0,
        }
      : undefined);

  let confidence = present.length / 4;
  if (macros.kcal === null && kcal !== null) confidence -= 0.15; // estimated, not read
  confidence -= 0.1 * warnings.filter((w) => w.includes("not found")).length;
  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));

  return {
    layout,
    per100g,
    perServing: opts.perServing,
    servingSizeG: opts.servingSizeG,
    confidence,
    warnings,
    raw,
  };
}

function parseEu(raw: string, lines: string[], layout: LabelLayout): ParsedLabel {
  const col = pickHundredColumn(lines);
  const energyRow = findRow(lines, /energ|\bkj\b|kcal|valeur [eé]nerg/);
  const fatRow = findRow(
    lines,
    /\bfat\b|lipid|mati[eè]res grasses|fett|grass|grasa|gordura|\bvet\b/,
    /satur|of which|dont|davon|de las cuales|di cui/,
  );
  const carbRow = findRow(
    lines,
    /carbo(hydr|idr)|carbs\b|glucides|kohlenhydrate|hidratos|koolhydr/,
    /of which|sugars|dont sucres|davon zucker|de los cuales|di cui|az[uú]car/,
  );
  const proteinRow = findRow(lines, /protein|prot[eé][iï]?n|eiwei|eiwit/);

  return assemble(layout, raw, {
    kcal: energyKcal(energyRow, col),
    fatG: gramsValue(fatRow, col),
    carbsG: gramsValue(carbRow, col),
    proteinG: gramsValue(proteinRow, col),
  });
}

function parseUs(raw: string, lines: string[]): ParsedLabel {
  const servingSizeG = parseServingSize(lines);
  const calRow = findRow(lines, /calories/);
  const fatRow = findRow(lines, /total fat|\bfat\b/, /saturated|trans|% daily/);
  const carbRow = findRow(lines, /total carb|carbohydrate/, /dietary fiber|sugars|% daily/);
  const proteinRow = findRow(lines, /protein/);

  const perServing = {
    kcal: energyKcal(calRow, 0) ?? gramsValue(calRow, 0),
    fatG: gramsValue(fatRow, 0),
    carbsG: gramsValue(carbRow, 0),
    proteinG: gramsValue(proteinRow, 0),
  };

  if (servingSizeG && servingSizeG > 0) {
    const ps: MacroTotals = {
      kcal: perServing.kcal ?? 0,
      proteinG: perServing.proteinG ?? 0,
      carbsG: perServing.carbsG ?? 0,
      fatG: perServing.fatG ?? 0,
    };
    const f = 100 / servingSizeG;
    const per100g: MacroTotals = {
      kcal: Math.round(ps.kcal * f),
      proteinG: Math.round(ps.proteinG * f * 10) / 10,
      carbsG: Math.round(ps.carbsG * f * 10) / 10,
      fatG: Math.round(ps.fatG * f * 10) / 10,
    };
    return assemble("us", raw, perServing, { per100g, perServing: ps, servingSizeG });
  }

  const out = assemble("us", raw, perServing, {});
  out.perServing = out.per100g; // values were per serving; we couldn't rebase them
  delete out.per100g;
  out.warnings.unshift("Serving size not read — values below are per serving, not per 100 g.");
  out.confidence = Math.max(0, out.confidence - 0.2);
  return out;
}

export function parseNutritionLabel(raw: string): ParsedLabel {
  const lines = normalize(raw);
  if (lines.length === 0) {
    return { layout: "unknown", confidence: 0, warnings: ["No text found in the photo."], raw };
  }
  const layout = detectLayout(lines);
  return layout === "us" ? parseUs(raw, lines) : parseEu(raw, lines, layout);
}
