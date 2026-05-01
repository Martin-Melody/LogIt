export type Exercise = {
  id: string;
  name: string;
  notes: string | null;
  isCore: boolean;
  createdAtMs: number;
};

export type ExercisePatch = Partial<Pick<Exercise, "name" | "notes">>;
