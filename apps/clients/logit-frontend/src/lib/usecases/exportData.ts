import { get } from "svelte/store";
import type { Exercise } from "@logit/core/domain/exercise";
import type { WorkoutSession } from "@logit/core/domain/workout";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import type { ExerciseProgressionState, UserProgressionConfig } from "@logit/core/domain/progression";
import type {
  CustomFood,
  DiaryDay,
  FavoriteFood,
  MealTemplate,
  NutritionGoal,
  Recipe,
  WeightEntry,
} from "@logit/core/domain/nutrition";
import type { Habit, HabitEntry } from "@logit/core/domain/habit";
import type { UserProfile } from "$lib/stores/profile.store";
import type { HomeConfig } from "$lib/features/widgets/widget";
import {
  getExerciseRepo,
  getSplitRepo,
  getWorkoutRepo,
  getProgressionRepo,
  getNutritionRepo,
  getHabitRepo,
} from "$lib/data/repoProvider";
import { profile } from "$lib/stores/profile.store";
import { homeConfig } from "$lib/stores/homeConfig.store";
import { profileConfig } from "$lib/stores/profileConfig.store";
import { saveTextFile } from "$lib/platform/fileSave";
import { browser } from "$app/environment";

/**
 * v1 → covered profile, exercises, splits, sessions, progression.
 * v2 → adds nutrition, habits and plugins. v1 files still import (the new
 * sections are simply absent). Bump this when the shape changes; see
 * docs/data-export-schema.md for the documented contract.
 */
export const EXPORT_VERSION = 2 as const;

/** localStorage keys that make up a plugin install — durable state only. */
export const PLUGIN_KEYS = [
  "logit:plugins:installed:v1",
  "logit:plugins:bundles:v1",
  "logit:plugin-settings:v1",
  "logit:plugins:packs:v1",
  "logit:plugins:registries:v1",
] as const;

export type NutritionExport = {
  days: DiaryDay[];
  customFoods: CustomFood[];
  recipes: Recipe[];
  favorites: FavoriteFood[];
  mealTemplates: MealTemplate[];
  weightEntries: WeightEntry[];
  goal: NutritionGoal | null;
};

export type HabitsExport = {
  habits: Habit[];
  entries: HabitEntry[];
};

/** Raw localStorage snapshot for the plugin subsystem (key → JSON string). */
export type PluginsExport = Record<string, string>;

export type ExportData = {
  version: typeof EXPORT_VERSION;
  exportedAtMs: number;
  profile: UserProfile;
  homeConfig: HomeConfig;
  profileConfig: HomeConfig;
  exercises: Exercise[];
  splits: { splits: WorkoutSplit[]; activeSplitId: string | null };
  sessions: WorkoutSession[];
  progression: { config: UserProgressionConfig | null; states: ExerciseProgressionState[] };
  nutrition: NutritionExport;
  habits: HabitsExport;
  plugins: PluginsExport;
};

async function collectNutrition(): Promise<NutritionExport> {
  const repo = getNutritionRepo();
  const [days, customFoods, recipes, favorites, mealTemplates, weightEntries, goal] =
    await Promise.all([
      repo.listDaysForPush(),
      repo.listCustomFoodsForPush(),
      repo.listRecipesForPush(),
      repo.listFavoritesForPush(),
      repo.listMealTemplatesForPush(),
      repo.listWeightEntriesForPush(),
      repo.getGoal(),
    ]);
  return { days, customFoods, recipes, favorites, mealTemplates, weightEntries, goal };
}

async function collectHabits(): Promise<HabitsExport> {
  const repo = getHabitRepo();
  const [habits, entries] = await Promise.all([
    repo.listHabitsForPush(),
    repo.listEntriesForPush(),
  ]);
  return { habits, entries };
}

function collectPlugins(): PluginsExport {
  const out: PluginsExport = {};
  if (!browser) return out;
  for (const key of PLUGIN_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw != null) out[key] = raw;
  }
  return out;
}

export async function exportData(): Promise<ExportData> {
  const exerciseRepo = getExerciseRepo();
  const splitRepo = getSplitRepo();
  const workoutRepo = getWorkoutRepo();
  const progressionRepo = getProgressionRepo();

  // Only export user-created exercises — core exercises are always present in the app
  const exercises = await exerciseRepo.list({ filter: "mine", limit: 100000 });

  const splitHeaders = await splitRepo.getListSplits({ includeArchived: true, limit: 100000 });
  const splitsFull = await Promise.all(splitHeaders.map((s) => splitRepo.getSplit(s.id)));
  const activeSplitId = await splitRepo.getActiveSplitId();

  const sessions = await workoutRepo.listAllSessions();

  const progressionConfig = await progressionRepo.getConfig();
  const progressionStates = await progressionRepo.listExerciseStates();

  const [nutrition, habits] = await Promise.all([collectNutrition(), collectHabits()]);

  return {
    version: EXPORT_VERSION,
    exportedAtMs: Date.now(),
    profile: get(profile),
    homeConfig: get(homeConfig),
    profileConfig: get(profileConfig),
    exercises,
    splits: {
      splits: splitsFull.filter((s): s is WorkoutSplit => s !== null),
      activeSplitId,
    },
    sessions,
    progression: {
      config: progressionConfig,
      states: progressionStates,
    },
    nutrition,
    habits,
    plugins: collectPlugins(),
  };
}

export async function downloadExport(data: ExportData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const date = new Date(data.exportedAtMs).toISOString().slice(0, 10);
  await saveTextFile(`logit-backup-${date}.json`, json);
}
