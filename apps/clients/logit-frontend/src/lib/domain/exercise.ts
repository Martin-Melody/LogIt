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

export type Exercise = {
  id: string;
  name: string;
  notes: string | null;
  isCore: boolean;
  createdAtMs: number;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
};

export type ExercisePatch = Partial<Pick<Exercise, "name" | "notes" | "primaryMuscles" | "secondaryMuscles">>;
