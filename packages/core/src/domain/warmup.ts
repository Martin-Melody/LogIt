/**
 * Warm-up ramp generator — turns a working weight into a short ladder of
 * warm-up sets. All weights in kg.
 */

export type WarmupStep = {
  /** Fraction of the working weight (0 = just the bar / minimum). */
  pct: number;
  reps: number;
};

/** A sensible default: bar, then 40 / 60 / 80 %. */
export const DEFAULT_WARMUP_SCHEME: WarmupStep[] = [
  { pct: 0, reps: 10 },
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.8, reps: 2 },
];

export type WarmupSet = { weight: number; reps: number };

export type WarmupOptions = {
  /** Minimum load — the bar for a barbell lift, or 0 for bodyweight/dumbbell. */
  minKg?: number;
  scheme?: WarmupStep[];
  /** Snap each generated weight to something achievable (plates / machine stack). */
  snap?: (kg: number) => number;
};

/**
 * Build the warm-up ladder for `workingKg`. Steps that land at or above the
 * working weight, or that duplicate the previous step, are dropped — so a light
 * working weight just yields a short ramp (or nothing).
 */
export function warmupSets(workingKg: number, opts: WarmupOptions = {}): WarmupSet[] {
  const minKg = opts.minKg ?? 20;
  const scheme = opts.scheme ?? DEFAULT_WARMUP_SCHEME;
  const snap = opts.snap ?? ((kg: number) => Math.round(kg * 2) / 2);

  const out: WarmupSet[] = [];
  for (const step of scheme) {
    const raw = step.pct <= 0 ? minKg : Math.max(minKg, workingKg * step.pct);
    const weight = snap(raw);
    if (weight >= workingKg - 1e-9) continue;
    if (out.length > 0 && out[out.length - 1]!.weight === weight) continue;
    out.push({ weight, reps: step.reps });
  }
  return out;
}
