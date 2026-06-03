import { browser } from "$app/environment";
import type { ProgressionRepo } from "$lib/data/progressionRepo";
import type { ExerciseProgressionState, UserProgressionConfig } from "$lib/domain/progression";
import type { UserAnalyticsConfig } from "$lib/domain/analytics";

const STORAGE_KEYS = {
  config: "logit:progression:config:v1",
  states: "logit:progression:states:v1",
  analyticsConfig: "logit:analytics:config:v1",
  algorithmPrefs: "logit:progression:prefs:v1",
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
