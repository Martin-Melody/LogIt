import { browser } from "$app/environment";
import type { ProgressionRepo } from "@logit/core/data/progressionRepo";
import type { ExerciseProgressionSettings, ExerciseProgressionState, UserProgressionConfig } from "@logit/core/domain/progression";
import type { UserAnalyticsConfig } from "@logit/core/domain/analytics";
import { normalizeRecipe, type ProgressionRecipe } from "@logit/core/domain/progressionRecipe";
import type { UserMobilityProgressionConfig } from "@logit/core/domain/mobilityProgression";
import type { UserMuscleGroupInsightConfig } from "@logit/core/domain/muscleGroupInsight";

const STORAGE_KEYS = {
  config: "logit:progression:config:v1",
  mobilityConfig: "logit:mobility-progression:config:v1",
  muscleGroupInsightConfig: "logit:muscle-group-insight:config:v1",
  states: "logit:progression:states:v1",
  analyticsConfig: "logit:analytics:config:v1",
  algorithmPrefs: "logit:progression:prefs:v1",
  exerciseSettings: "logit:progression:exercise-settings:v1",
  recipes: "logit:progression:recipes:v1",
} as const;

function ensureBrowser(): void {
  if (!browser) throw new Error("localStorage repo cannot be used during SSR.");
}

function readJson<T>(key: string, fallback: T): T {
  ensureBrowser();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  ensureBrowser();
  localStorage.setItem(key, JSON.stringify(value));
}

export function createLocalProgressionRepo(): ProgressionRepo {
  return {
    async getExerciseSettings(key: string): Promise<ExerciseProgressionSettings | null> {
      return readJson<Record<string, ExerciseProgressionSettings>>(STORAGE_KEYS.exerciseSettings, {})[key] ?? null;
    },

    async listExerciseSettings(): Promise<ExerciseProgressionSettings[]> {
      return Object.values(readJson<Record<string, ExerciseProgressionSettings>>(STORAGE_KEYS.exerciseSettings, {}));
    },

    async saveExerciseSettings(settings: ExerciseProgressionSettings): Promise<void> {
      const all = readJson<Record<string, ExerciseProgressionSettings>>(STORAGE_KEYS.exerciseSettings, {});
      all[settings.key] = settings;
      writeJson(STORAGE_KEYS.exerciseSettings, all);
    },

    async listRecipes(): Promise<ProgressionRecipe[]> {
      return Object.values(readJson<Record<string, ProgressionRecipe>>(STORAGE_KEYS.recipes, {})).map(normalizeRecipe);
    },

    async saveRecipe(recipe: ProgressionRecipe): Promise<void> {
      const all = readJson<Record<string, ProgressionRecipe>>(STORAGE_KEYS.recipes, {});
      all[recipe.id] = recipe;
      writeJson(STORAGE_KEYS.recipes, all);
    },

    async getConfig(): Promise<UserProgressionConfig | null> {
      return readJson<UserProgressionConfig | null>(STORAGE_KEYS.config, null);
    },

    async saveConfig(config: UserProgressionConfig): Promise<void> {
      writeJson(STORAGE_KEYS.config, config);
    },

    async clearConfig(): Promise<void> {
      ensureBrowser();
      localStorage.removeItem(STORAGE_KEYS.config);
    },

    async getMobilityConfig(): Promise<UserMobilityProgressionConfig | null> {
      return readJson<UserMobilityProgressionConfig | null>(STORAGE_KEYS.mobilityConfig, null);
    },

    async saveMobilityConfig(config: UserMobilityProgressionConfig): Promise<void> {
      writeJson(STORAGE_KEYS.mobilityConfig, config);
    },

    async clearMobilityConfig(): Promise<void> {
      ensureBrowser();
      localStorage.removeItem(STORAGE_KEYS.mobilityConfig);
    },

    async getMuscleGroupInsightConfig(): Promise<UserMuscleGroupInsightConfig | null> {
      return readJson<UserMuscleGroupInsightConfig | null>(STORAGE_KEYS.muscleGroupInsightConfig, null);
    },

    async saveMuscleGroupInsightConfig(config: UserMuscleGroupInsightConfig): Promise<void> {
      writeJson(STORAGE_KEYS.muscleGroupInsightConfig, config);
    },

    async clearMuscleGroupInsightConfig(): Promise<void> {
      ensureBrowser();
      localStorage.removeItem(STORAGE_KEYS.muscleGroupInsightConfig);
    },

    async getExerciseState(key: string): Promise<ExerciseProgressionState | null> {
      const states = readJson<Record<string, ExerciseProgressionState>>(STORAGE_KEYS.states, {});
      return states[key] ?? null;
    },

    async saveExerciseState(state: ExerciseProgressionState): Promise<void> {
      const states = readJson<Record<string, ExerciseProgressionState>>(STORAGE_KEYS.states, {});
      writeJson(STORAGE_KEYS.states, { ...states, [state.key]: state });
    },

    async listExerciseStates(): Promise<ExerciseProgressionState[]> {
      const states = readJson<Record<string, ExerciseProgressionState>>(STORAGE_KEYS.states, {});
      return Object.values(states);
    },

    async clearStates(): Promise<void> {
      ensureBrowser();
      localStorage.removeItem(STORAGE_KEYS.states);
    },

    async resetExerciseState(key: string): Promise<void> {
      const states = readJson<Record<string, ExerciseProgressionState>>(STORAGE_KEYS.states, {});
      if (!(key in states)) return;
      const { [key]: _removed, ...rest } = states;
      writeJson(STORAGE_KEYS.states, rest);
    },

    async getAnalyticsConfig(): Promise<UserAnalyticsConfig | null> {
      return readJson<UserAnalyticsConfig | null>(STORAGE_KEYS.analyticsConfig, null);
    },

    async saveAnalyticsConfig(config: UserAnalyticsConfig): Promise<void> {
      writeJson(STORAGE_KEYS.analyticsConfig, config);
    },

    async clearAnalyticsConfig(): Promise<void> {
      ensureBrowser();
      localStorage.removeItem(STORAGE_KEYS.analyticsConfig);
    },

    async getAlgorithmPreferences(algorithmId: string): Promise<unknown> {
      const all = readJson<Record<string, unknown>>(STORAGE_KEYS.algorithmPrefs, {});
      return all[algorithmId] ?? null;
    },

    async setAlgorithmPreferences(algorithmId: string, prefs: unknown): Promise<void> {
      const all = readJson<Record<string, unknown>>(STORAGE_KEYS.algorithmPrefs, {});
      writeJson(STORAGE_KEYS.algorithmPrefs, { ...all, [algorithmId]: prefs });
    },
  };
}
