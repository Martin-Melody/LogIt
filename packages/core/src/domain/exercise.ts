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
};

export type ExercisePatch = Partial<Pick<Exercise, "name" | "notes" | "primaryMuscles" | "secondaryMuscles" | "exerciseType" | "machines" | "defaultMachineId">>;
