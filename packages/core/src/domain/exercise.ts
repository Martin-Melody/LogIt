export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "forearms";

export type ExerciseType = "normal" | "assisted" | "bodyweight";

/**
 * The set of weights a machine can actually be set to, expressed in the
 * machine's own `unit`:
 *  - `linear`  — a regular stack: `min`, `min + step`, … up to `max`
 *    (plus optional `addOns`, e.g. a 2.5 micro-plate that clips on any setting).
 *  - `stack`   — an explicit, possibly non-linear list (`values`).
 */
export type MachineWeights =
  | { kind: "linear"; min: number; step: number; max?: number; addOns?: number[] }
  | { kind: "stack"; values: number[] };

export type Machine = {
  id: string;
  name: string;
  /**
   * Flat kg increment — kept for back-compat and as the fallback when `weights`
   * is not defined. Older machines only have this.
   */
  incrementKg: number;
  /** Native unit the machine is labelled in. Defaults to "kg". */
  unit?: "kg" | "lbs";
  /** Real achievable weights; when present, progression + input snap to these. */
  weights?: MachineWeights;
};

/** What an exercise is done with. Shown next to the muscles and used to tell look-alikes apart. */
export type Equipment =
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "cable"
  | "machine"
  | "smith"
  | "bodyweight"
  | "band"
  | "other";

export const EQUIPMENT: readonly Equipment[] = [
  "barbell", "dumbbell", "kettlebell", "cable", "machine", "smith", "bodyweight", "band", "other",
] as const;

/**
 * A photo or clip attached to a library item. Reserved: nothing uploads these yet, but
 * every kind of item carries the field so adding uploads later needs no data change.
 */
export type LibraryMedia = { kind: "image" | "video"; url: string; caption?: string };

export type Exercise = {
  id: string;
  name: string;
  notes: string | null;
  isCore: boolean;
  createdAtMs: number;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  exerciseType?: ExerciseType;
  machines?: Machine[];
  defaultMachineId?: string;
  equipment?: Equipment;
  /** Short how-to points shown with the exercise ("Elbows under the bar"). */
  cues?: string[];
  media?: LibraryMedia[];
  /** Last edit. Missing on exercises from before the library; sync treats that as 0. */
  updatedAtMs?: number;
};

export type ExercisePatch = Partial<Pick<Exercise, "name" | "notes" | "primaryMuscles" | "secondaryMuscles" | "exerciseType" | "machines" | "defaultMachineId" | "equipment" | "cues">>;

/**
 * Whether an exercise's weights are relative to bodyweight (0 = BW, negative =
 * assisted, positive = added). True for the "bodyweight" type, and for any
 * exercise with a negative weight logged (BW−25 on an assisted dip), except the
 * "assisted" type, whose weight is the assistance itself.
 */
export function usesBodyweightLoad(
  exerciseType: ExerciseType | undefined,
  weights: Iterable<number> = [],
): boolean {
  if (exerciseType === "assisted") return false;
  if (exerciseType === "bodyweight") return true;
  for (const w of weights) if (w < 0) return true;
  return false;
}
