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
