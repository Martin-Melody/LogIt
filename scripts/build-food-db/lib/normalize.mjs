// Shared helpers for turning source rows into the food.db schema.

import { config } from "../config.mjs";

export function clampMacro(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, config.limits.macroGramsMax);
}

export function clampKcal(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, config.limits.kcalMax) * 10) / 10;
}

/** Round to 2 dp to keep the DB small. */
export function r2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Parse a loosely-formatted numeric cell: comma decimal separator, "traces", "< 0.1",
 * "-" (not measured). Returns NaN when there's genuinely no number.
 */
export function parseLooseNumber(v) {
  if (v == null) return NaN;
  const s = String(v).trim().toLowerCase();
  if (!s || s === "-" || s === "nd" || s === "n/a") return NaN;
  if (s === "traces" || s === "trace") return 0;
  const m = s.replace(",", ".").match(/-?\d*\.?\d+/);
  return m ? Number(m[0]) : NaN;
}

export function cleanName(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Always include a raw 100 g option; dedupe by gram weight. */
export function buildServings(extra = []) {
  const out = [{ label: "100 g", grams: 100 }];
  const seen = new Set([100]);
  for (const s of extra) {
    const grams = Math.round(Number(s.grams));
    if (!Number.isFinite(grams) || grams <= 0 || grams > 2000 || seen.has(grams)) continue;
    seen.add(grams);
    out.push({ label: cleanName(s.label) || `${grams} g`, grams });
  }
  return out;
}

/** A row is worthless if it has neither energy nor any macro. */
export function isEmptyNutrition(row) {
  return (
    row.kcal_100g === 0 &&
    row.protein_100g === 0 &&
    row.carb_100g === 0 &&
    row.fat_100g === 0
  );
}

/**
 * True when the stated energy is consistent with 4/4/9 kcal derived from the macros.
 * Tolerates missing energy (returns true — nothing to contradict) and rounding noise.
 * Rejects the common OFF failure modes: kJ typed into a kcal field, per-serving values
 * in a per-100 g column, decimal-place slips.
 */
export function energyConsistent(row) {
  const stated = row.kcal_100g;
  if (!(stated > 0)) return true;
  const derived = row.protein_100g * 4 + row.carb_100g * 4 + row.fat_100g * 9;
  if (!(derived > 0)) return true; // no macros to check against
  const diff = Math.abs(stated - derived);
  return (
    diff <= config.limits.energyMismatchKcal ||
    diff / Math.max(stated, derived) <= config.limits.energyMismatchPct
  );
}

/**
 * Final gate for every row from every source. Returns the row (possibly unchanged) when it
 * should be kept, or null to drop it.
 */
export function acceptRow(row) {
  if (!row || !row.name) return null;
  if (isEmptyNutrition(row)) return null;
  if (!energyConsistent(row)) return null;
  return row;
}

/** How complete a row is (0–4), for picking the best of several rows sharing a barcode. */
export function completeness(row) {
  return (
    (row.kcal_100g > 0 ? 1 : 0) +
    (row.protein_100g > 0 ? 1 : 0) +
    (row.carb_100g > 0 ? 1 : 0) +
    (row.fat_100g > 0 ? 1 : 0)
  );
}
