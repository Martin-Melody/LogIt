// Weight is stored and computed in kilograms everywhere in the domain
// (progression, volume, analytics). These helpers convert only at the UI
// boundary — display and input — so a user who trains in pounds never sees kg.

export type WeightUnit = "kg" | "lbs";

const LBS_PER_KG = 2.20462262185;

/** kg → the number shown in the user's unit. Not rounded — callers format. */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === "lbs" ? kg * LBS_PER_KG : kg;
}

/** A value typed by the user in their unit → kg for storage. */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === "lbs" ? value / LBS_PER_KG : value;
}

/**
 * Round a display-unit weight to a sensible input granularity:
 * 0.5 lb in pounds, 0.25 kg in kilograms (finer because kg plates go to 1.25).
 */
export function roundDisplayWeight(value: number, unit: WeightUnit): number {
  const step = unit === "lbs" ? 0.5 : 0.25;
  return Math.round(value / step) * step;
}

/** Trim trailing ".0" / ".00" so "100.0" shows as "100" but "102.5" stays. */
export function trimWeight(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * kg → a formatted string in the user's unit.
 * Default: "102.5 kg". `space: false` gives the dense "102.5kg" used in
 * target/summary lines. `withUnit: false` gives just the number.
 */
export function formatWeight(
  kg: number,
  unit: WeightUnit,
  opts: { withUnit?: boolean; space?: boolean } = {},
): string {
  const shown = roundDisplayWeight(toDisplayWeight(kg, unit), unit);
  const num = trimWeight(shown);
  if (opts.withUnit === false) return num;
  return opts.space === false ? `${num}${unit}` : `${num} ${unit}`;
}

/**
 * A load that may be relative to bodyweight. With `bodyweight`, 0 is "BW",
 * −25 is "BW−25" (assisted) and 10 is "BW+10" (added weight); the unit is
 * appended unless `withUnit: false`. Otherwise the same as formatWeight.
 */
export function formatLoad(
  kg: number,
  unit: WeightUnit,
  bodyweight: boolean,
  opts: { withUnit?: boolean; space?: boolean } = {},
): string {
  if (!bodyweight) return formatWeight(kg, unit, opts);
  const shown = roundDisplayWeight(toDisplayWeight(Math.abs(kg), unit), unit);
  if (shown === 0) return "BW";
  const num = `BW${kg < 0 ? "−" : "+"}${trimWeight(shown)}`;
  if (opts.withUnit === false) return num;
  return opts.space === false ? `${num}${unit}` : `${num} ${unit}`;
}

export const weightUnitLabel = (unit: WeightUnit): string => unit;
