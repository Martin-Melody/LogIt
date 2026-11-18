// What a set's weight can be picked from (WeightPickerSheet, design canvas X2/X3).
import type { Machine } from "@logit/core/domain/exercise";
import type { BarbellConfig } from "@logit/core/domain/plates";

export type WeightSource =
  | { kind: "machine"; machine: Machine; placeName?: string }
  | { kind: "bar"; barbell: BarbellConfig; placeName?: string }
  | { kind: "dumbbells"; weightsKg: number[]; placeName?: string };
