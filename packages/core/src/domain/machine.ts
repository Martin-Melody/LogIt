import type { Machine } from "./exercise";
import { toDisplayWeight, fromDisplayWeight, type WeightUnit } from "./units";

const LINEAR_CAP = 60; // safety cap on generated stack rungs when no max given

export function machineUnit(m: Pick<Machine, "unit">): WeightUnit {
  return m.unit === "lbs" ? "lbs" : "kg";
}

/**
 * Every weight the machine can be set to, in **kg**, ascending. Returns null
 * when the machine has no explicit `weights` (callers fall back to incrementKg).
 */
export function machineWeightsKg(m: Machine): number[] | null {
  const w = m.weights;
  if (!w) return null;
  const unit = machineUnit(m);
  const toKg = (native: number) => fromDisplayWeight(native, unit);

  if (w.kind === "stack") {
    const vals = [...new Set(w.values)].sort((a, b) => a - b);
    return vals.map(toKg);
  }

  // linear
  const step = w.step > 0 ? w.step : 1;
  const max = w.max ?? w.min + step * LINEAR_CAP;
  const base: number[] = [];
  for (let v = w.min; v <= max + 1e-9; v += step) base.push(round2(v));

  const addOns = w.addOns ?? [];
  const all = new Set<number>(base);
  for (const rung of base) {
    for (const a of addOns) all.add(round2(rung + a));
  }
  return [...all].sort((a, b) => a - b).map(toKg);
}

export type SnappedWeight = {
  /** kg — for storage and progression math. */
  kg: number;
  /** the same weight in the machine's native unit — for display / input. */
  nativeValue: number;
  unit: WeightUnit;
};

/** Snap a target weight (kg) to the nearest weight the machine actually has. */
export function snapToMachine(m: Machine, targetKg: number): SnappedWeight {
  const unit = machineUnit(m);
  const weights = machineWeightsKg(m);

  if (!weights || weights.length === 0) {
    const inc = m.incrementKg > 0 ? m.incrementKg : 2.5;
    const kg = round2(Math.round(targetKg / inc) * inc);
    return { kg, nativeValue: round2(toDisplayWeight(kg, unit)), unit };
  }

  let best = weights[0]!;
  for (const w of weights) {
    if (Math.abs(w - targetKg) < Math.abs(best - targetKg)) best = w;
  }
  return { kg: best, nativeValue: round2(toDisplayWeight(best, unit)), unit };
}

/** The next / previous achievable weight from a current one (for +/- steppers). */
export function stepMachineWeight(m: Machine, currentKg: number, dir: 1 | -1): number {
  const weights = machineWeightsKg(m);
  if (!weights || weights.length === 0) {
    const inc = m.incrementKg > 0 ? m.incrementKg : 2.5;
    return round2(Math.max(0, currentKg + dir * inc));
  }
  // find current index (nearest), move one rung
  let idx = 0;
  for (let i = 1; i < weights.length; i++) {
    if (Math.abs(weights[i]! - currentKg) < Math.abs(weights[idx]! - currentKg)) idx = i;
  }
  const nextIdx = Math.max(0, Math.min(weights.length - 1, idx + dir));
  return weights[nextIdx]!;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
