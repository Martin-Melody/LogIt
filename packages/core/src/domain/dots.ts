/**
 * DOTS (powerlifting's bodyweight-adjusted score, used by most federations since 2019):
 * total × 500 ÷ a polynomial of bodyweight, with one set of coefficients for men and one for
 * women. Bodyweight is clamped to the formula's range (men 40–210 kg, women 40–150 kg).
 */
export type DotsFormula = "men" | "women";

const COEFFICIENTS: Record<DotsFormula, { a: number; b: number; c: number; d: number; e: number; max: number }> = {
  men: { a: -307.75076, b: 24.0900756, c: -0.1918759221, d: 0.0007391293, e: -0.000001093, max: 210 },
  women: { a: -57.96288, b: 13.6175032, c: -0.1126655495, d: 0.0005158568, e: -0.0000010706, max: 150 },
};

export function dotsScore(totalKg: number, bodyweightKg: number, formula: DotsFormula): number {
  const k = COEFFICIENTS[formula];
  const bw = Math.min(Math.max(bodyweightKg, 40), k.max);
  const denominator = k.a + k.b * bw + k.c * bw ** 2 + k.d * bw ** 3 + k.e * bw ** 4;
  return (totalKg * 500) / denominator;
}
