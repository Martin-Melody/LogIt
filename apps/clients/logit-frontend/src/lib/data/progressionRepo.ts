import type { ExerciseProgressionState, UserProgressionConfig } from "$lib/domain/progression";

export interface ProgressionRepo {
  getConfig(): Promise<UserProgressionConfig | null>;
  saveConfig(config: UserProgressionConfig): Promise<void>;
  clearConfig(): Promise<void>;

  getExerciseState(key: string): Promise<ExerciseProgressionState | null>;
  saveExerciseState(state: ExerciseProgressionState): Promise<void>;
  listExerciseStates(): Promise<ExerciseProgressionState[]>;
  clearStates(): Promise<void>;
}
