// What a set's weight can be picked from (WeightPickerSheet, design canvas X2/X3).
import type { Machine } from "@logit/core/domain/exercise";
import { platesPerSide, type BarbellConfig } from "@logit/core/domain/plates";
import { snapToMachine, stepMachineWeight } from "@logit/core/domain/machine";
import { fromDisplayWeight, toDisplayWeight, type WeightUnit } from "@logit/core/domain/units";

export type WeightSource =
  | { kind: "machine"; machine: Machine; placeName?: string }
  | { kind: "bar"; barbell: BarbellConfig; placeName?: string }
  | { kind: "dumbbells"; weightsKg: number[]; placeName?: string };

/** Nearest loadable weight, and the next loadable one below, for re-planning sets mid-workout
 * (replanAfterSet). Without a source: 2.5 kg or 5 lb steps. */
export function loadsFor(source: WeightSource | null, unit: WeightUnit): { round: (kg: number) => number; down: (kg: number) => number } {
  if (source?.kind === "machine") {
    const m = source.machine;
    return { round: (kg) => snapToMachine(m, kg).kg, down: (kg) => stepMachineWeight(m, kg, -1) };
  }
  if (source?.kind === "dumbbells" && source.weightsKg.length) {
    const ws = [...source.weightsKg].sort((a, b) => a - b);
    return {
      round: (kg) => ws.reduce((best, w) => (Math.abs(w - kg) < Math.abs(best - kg) ? w : best)),
      down: (kg) => [...ws].reverse().find((w) => w < kg - 0.001) ?? ws[0]!,
    };
  }
  if (source?.kind === "bar") {
    // platesPerSide rounds down, so the nearest is that or the next one up.
    const cfg = source.barbell;
    const floor = (kg: number) => platesPerSide(kg, cfg).achievableKg;
    const pair = 2 * Math.min(...cfg.platesKg.filter((p) => p > 0));
    return {
      round: (kg) => [floor(kg), floor(kg + pair)].reduce((a, b) => (Math.abs(b - kg) < Math.abs(a - kg) ? b : a)),
      down: (kg) => floor(kg - 0.001),
    };
  }
  const step = unit === "lbs" ? 5 : 2.5;
  const round = (kg: number) => fromDisplayWeight(Math.round(toDisplayWeight(kg, unit) / step) * step, unit);
  return { round, down: (kg) => fromDisplayWeight(Math.max(0, Math.round(toDisplayWeight(kg, unit) / step) * step - step), unit) };
}
