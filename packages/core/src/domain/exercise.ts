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

export type Machine = { id: string; name: string; incrementKg: number };

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
