import {
  MEASURE_UNITS,
  isMeasureUnit,
  unitToGrams,
  type ServingOption,
} from "@logit/core/domain/nutrition";

/** A choice in the amount/serving picker: a raw unit (grams unknown until amount is set)
 * or a named serving from the food (fixed grams each). */
export type PortionOption = { id: string; label: string; grams: number | null };

/** Raw units first, then the food's named servings (the plain "100 g" one is dropped —
 * "g" as a unit covers it). */
export function portionOptions(servings: ServingOption[] | undefined): PortionOption[] {
  const units: PortionOption[] = MEASURE_UNITS.map((u) => ({ id: u, label: u, grams: null }));
  const named = (servings ?? [])
    .filter((s) => s.id !== "g" && s.grams > 0)
    .map((s) => ({ id: s.id, label: s.label, grams: s.grams }));
  return [...units, ...named];
}

export function portionToGrams(amount: number, o: PortionOption | undefined): number {
  const amt = Number(amount) || 0;
  if (amt <= 0 || !o) return 0;
  if (o.grams === null) return isMeasureUnit(o.id) ? unitToGrams(amt, o.id) : amt;
  return amt * o.grams;
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** Human portion string stored on the logged item, e.g. "2 × medium (236 g)" or "250 g". */
export function portionLabel(amount: number, o: PortionOption | undefined, grams: number): string {
  const amt = Number(amount) || 0;
  if (!o) return `${Math.round(grams)} g`;
  if (o.grams === null) return `${fmt(amt)} ${o.label}`;
  const each = amt === 1 ? "" : `${fmt(amt)} × `;
  return `${each}${o.label} (${Math.round(grams)} g)`;
}
