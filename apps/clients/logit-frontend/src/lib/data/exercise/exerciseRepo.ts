import type { Exercise, ExercisePatch, ExerciseType } from "$lib/domain/exercise";

export type ListExercisesOptions = {
  query?: string;
  filter?: "all" | "core" | "mine";
  limit?: number;
  offset?: number;
};

export interface ExerciseRepo {
  list(options?: ListExercisesOptions): Promise<Exercise[]>;
  create(name: string, exerciseType?: ExerciseType): Promise<Exercise>;
  getByName(name: string): Promise<Exercise | null>;
  getById(id: string): Promise<Exercise | null>;
  update(id: string, patch: ExercisePatch): Promise<Exercise>;
  remove(id: string): Promise<void>;
  saveExercise(exercise: Exercise): Promise<void>;
  clearAll(): Promise<void>;
}
