import type { Exercise } from "$lib/domain/exercise";

export type ListExercisesOptions = {
  query?: string;
  limit?: number;
  offset?: number;
};

export interface ExerciseRepo {
  list(options?: ListExercisesOptions): Promise<Exercise[]>;
  create(name: string): Promise<Exercise>;
  getByName(name: string): Promise<Exercise | null>;
}
