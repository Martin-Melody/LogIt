/**
 * Barbell plate maths — per-side plate breakdown for a target weight.
 * All weights in kg (the canonical unit); callers convert for display.
 */

export type BarbellConfig = {
  /** Bar weight, kg. */
  barKg: number;
  /** Available plate denominations, kg (one plate = one of these; order doesn't matter). */
  platesKg: number[];
};

/** Standard Olympic bar + a full metric plate set. */
export const DEFAULT_BARBELL: BarbellConfig = {
  barKg: 20,
  platesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export type PlateBreakdown = {
  /** Plates loaded on ONE side of the bar, heaviest first. */
  perSide: number[];
  /** Weight actually achievable with those plates: bar + 2·Σ(perSide). */
  achievableKg: number;
  /** target − achievable. `> 0` means the plates can't quite reach the target. */
  shortfallKg: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Greedily load the heaviest plates that fit on each side of the bar.
 * A target at or below the bar weight yields no plates.
 */
export function platesPerSide(targetKg: number, cfg: BarbellConfig = DEFAULT_BARBELL): PlateBreakdown {
  const perSideTarget = Math.max(0, (targetKg - cfg.barKg) / 2);
  const plates = [...cfg.platesKg].filter((p) => p > 0).sort((a, b) => b - a);

  const perSide: number[] = [];
  let remaining = perSideTarget;
  for (const p of plates) {
    while (remaining >= p - 1e-9) {
      perSide.push(p);
      remaining = round2(remaining - p);
    }
  }

  const loadedPerSide = perSide.reduce((s, p) => s + p, 0);
  const achievableKg = round2(cfg.barKg + 2 * loadedPerSide);
  return { perSide, achievableKg, shortfallKg: round2(targetKg - achievableKg) };
}

/** Compact label like "20 + 10 + 2.5" (one side), or "bar only". */
export function plateLabel(perSide: number[]): string {
  if (perSide.length === 0) return "bar only";
  return perSide.map((p) => trim(p)).join(" + ");
}

function trim(n: number): string {
  return Number(n.toFixed(2)).toString();
}
