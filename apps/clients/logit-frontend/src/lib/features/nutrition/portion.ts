import {
  COMMON_MEASURE_UNITS,
  MEASURE_UNITS,
  isMeasureUnit,
  unitToGrams,
  type FoodRef,
  type MeasureUnit,
  type ServingOption,
} from "@logit/core/domain/nutrition";

/** A choice in the amount picker: a raw unit (grams depend on the amount) or a named
 * serving from the food (fixed grams each). `more` = tucked behind "More units". */
export type PortionOption = { id: string; label: string; grams: number | null; more?: boolean };

const UNIT_LABEL: Record<MeasureUnit, string> = {
  g: "g",
  ml: "ml",
  oz: "oz",
  kg: "kg",
  l: "litre",
  lb: "lb",
  tsp: "tsp (5 g)",
  tbsp: "tbsp (15 g)",
  cup: "cup (240 ml)",
};

/** A serving worth offering by name: not the plain "100 g" every food carries (the food
 * database lists it as a serving too), which the g unit already covers. */
export function isRealServing(s: ServingOption): boolean {
  if (!(s.grams > 0) || s.id === "g") return false;
  return !(s.grams === 100 && /^100\s*g$/i.test(s.label.trim()));
}

/** Named servings first (they're what people mean: "1 scoop", "1 tin"), then raw units.
 * `rawUnits: false` for things with no real weight (a recipe that was never weighed). */
export function portionOptions(
  servings: ServingOption[] | undefined,
  opts: { rawUnits?: boolean } = {},
): PortionOption[] {
  const named = (servings ?? [])
    .filter((s) => isRealServing(s))
    .map((s) => ({ id: s.id, label: s.label, grams: s.grams }));
  if (opts.rawUnits === false) return named;
  const units: PortionOption[] = MEASURE_UNITS.map((u) => ({
    id: u,
    label: UNIT_LABEL[u],
    grams: null,
    more: !COMMON_MEASURE_UNITS.includes(u),
  }));
  return [...named, ...units];
}

export function portionToGrams(amount: number, o: PortionOption | undefined): number {
  const amt = Number(amount) || 0;
  if (amt <= 0 || !o) return 0;
  if (o.grams === null) return isMeasureUnit(o.id) ? unitToGrams(amt, o.id) : amt;
  return amt * o.grams;
}

export function fmtAmount(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** Human portion string stored on the logged item, e.g. "2 × medium (236 g)", "250 g",
 * "2 tbsp". */
export function portionLabel(amount: number, o: PortionOption | undefined, grams: number): string {
  const amt = Number(amount) || 0;
  if (!o) return `${Math.round(grams)} g`;
  if (o.grams === null) return `${fmtAmount(amt)} ${isMeasureUnit(o.id) ? o.id : o.label}`;
  const each = amt === 1 ? "" : `${fmtAmount(amt)} × `;
  return `${each}${o.label}${/\d\s*g\)?$/.test(o.label) ? "" : ` (${Math.round(grams)} g)`}`;
}

/** How much one tap of − / + changes the amount. */
export function stepFor(o: PortionOption | undefined, amount: number): number {
  if (!o) return 1;
  if (o.grams !== null) return amount < 1 ? 0.25 : 0.5;
  switch (o.id) {
    case "g":
    case "ml":
      return amount < 50 ? 5 : amount < 500 ? 10 : 50;
    case "kg":
    case "l":
      return 0.1;
    case "lb":
      return 0.25;
    case "tsp":
    case "tbsp":
      return 0.5;
    case "cup":
      return 0.25;
    default:
      return 1;
  }
}

/** Where the picker starts: the remembered portion, else the food's first named serving,
 * else 100 g. */
export function defaultPortion(
  food: Pick<FoodRef, "servings">,
  remembered?: { amount?: number; portionId?: string; grams?: number },
  opts: { rawUnits?: boolean } = {},
): { amount: number; portionId: string } {
  const options = portionOptions(food.servings, opts);
  if (remembered?.portionId && remembered.amount && options.some((o) => o.id === remembered.portionId)) {
    return { amount: remembered.amount, portionId: remembered.portionId };
  }
  if (remembered?.grams && remembered.grams > 0 && opts.rawUnits !== false) {
    return { amount: Math.round(remembered.grams), portionId: "g" };
  }
  const named = options.find((o) => o.grams !== null);
  if (named) return { amount: 1, portionId: named.id };
  return { amount: 100, portionId: "g" };
}

/** The portion a list row quotes: first named serving, else 100 g. */
export function rowPortion(food: Pick<FoodRef, "servings">): { label: string; grams: number } {
  const named = food.servings.find(isRealServing);
  return named ? { label: named.label, grams: named.grams } : { label: "100 g", grams: 100 };
}

