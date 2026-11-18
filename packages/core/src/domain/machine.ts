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

// ── One history, per-machine starting weight (My gym, decided 2026-11-18) ─────────────
// An exercise keeps one history wherever it's done, but machines differ (cable ratios, leg
// press angles), so the next weight on a machine comes from the last time on that machine.

type HistoryLike = { sets: { machineId?: string | null; weight: number; completed?: boolean; setType?: string }[] };

function topWorkingKg(entry: HistoryLike, machineId?: string): number | null {
  const ws = entry.sets
    .filter((s) => s.completed !== false && s.setType !== "warmup" && (!machineId || s.machineId === machineId))
    .map((s) => s.weight);
  return ws.length ? Math.max(...ws) : null;
}

export type MachineRebase = {
  /** Multiply the plan's weights by this (1 = unchanged). */
  factor: number;
  /** No set was ever logged on this machine, though others were: start carefully. */
  firstTime: boolean;
};

/**
 * How to move a plan made from the whole history onto `machineId`. When the latest session was
 * on a different machine but an older one was on this machine, the weights scale by the ratio
 * of the two (60 kg here last time vs 80 kg on the other machine). Nothing changes when the
 * latest session was on this machine, or when sets were never tagged with a machine.
 */
export function rebaseForMachine(historyNewestFirst: HistoryLike[], machineId: string | undefined): MachineRebase {
  const same: MachineRebase = { factor: 1, firstTime: false };
  if (!machineId || historyNewestFirst.length === 0) return same;
  const latest = historyNewestFirst[0]!;
  if (latest.sets.some((s) => s.machineId === machineId)) return same;
  const anyTagged = historyNewestFirst.some((h) => h.sets.some((s) => s.machineId));
  if (!anyTagged) return same;
  const onThis = historyNewestFirst.find((h) => h.sets.some((s) => s.machineId === machineId));
  if (!onThis) return { factor: 1, firstTime: true };
  const here = topWorkingKg(onThis, machineId);
  const there = topWorkingKg(latest);
  if (!here || !there) return same;
  return { factor: here / there, firstTime: false };
}
