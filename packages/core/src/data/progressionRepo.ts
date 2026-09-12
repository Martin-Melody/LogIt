import type { ExerciseProgressionState, UserProgressionConfig } from "../domain/progression";
import type { UserAnalyticsConfig } from "../domain/analytics";
import type { UserMobilityProgressionConfig } from "../domain/mobilityProgression";
import type { UserMuscleGroupInsightConfig } from "../domain/muscleGroupInsight";

export interface ProgressionRepo {
  getConfig(): Promise<UserProgressionConfig | null>;
  saveConfig(config: UserProgressionConfig): Promise<void>;
  clearConfig(): Promise<void>;

  /**
   * Which mobility progression algorithm is active. Separate from `getConfig`
   * (strength) — a user can run different schemes for lifting and stretching.
   * Mobility per-drill state reuses `getExerciseState` / `saveExerciseState`
   * with a `mobility::<slug>` key, so no extra state methods are needed.
   */
  getMobilityConfig(): Promise<UserMobilityProgressionConfig | null>;
  saveMobilityConfig(config: UserMobilityProgressionConfig): Promise<void>;
  clearMobilityConfig(): Promise<void>;

  /** Which muscle-group-insight algorithm is active (§5 option B) — same
   * separate-from-strength rationale as getMobilityConfig above. */
  getMuscleGroupInsightConfig(): Promise<UserMuscleGroupInsightConfig | null>;
  saveMuscleGroupInsightConfig(config: UserMuscleGroupInsightConfig): Promise<void>;
  clearMuscleGroupInsightConfig(): Promise<void>;

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
