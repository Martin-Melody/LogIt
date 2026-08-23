import type { ExerciseProgressionState, UserProgressionConfig } from "$lib/domain/progression";
import type { UserAnalyticsConfig } from "$lib/domain/analytics";

export interface ProgressionRepo {
  getConfig(): Promise<UserProgressionConfig | null>;
  saveConfig(config: UserProgressionConfig): Promise<void>;
  clearConfig(): Promise<void>;

  getAnalyticsConfig(): Promise<UserAnalyticsConfig | null>;
  saveAnalyticsConfig(config: UserAnalyticsConfig): Promise<void>;
  clearAnalyticsConfig(): Promise<void>;

  getExerciseState(key: string): Promise<ExerciseProgressionState | null>;
  saveExerciseState(state: ExerciseProgressionState): Promise<void>;
  listExerciseStates(): Promise<ExerciseProgressionState[]>;
  clearStates(): Promise<void>;
  resetExerciseState(key: string): Promise<void>;

  getAlgorithmPreferences(algorithmId: string): Promise<unknown>;
  setAlgorithmPreferences(algorithmId: string, prefs: unknown): Promise<void>;
}
