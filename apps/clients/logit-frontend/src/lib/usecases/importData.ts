import { browser } from "$app/environment";
import {
  getExerciseRepo,
  getSplitRepo,
  getWorkoutRepo,
  getProgressionRepo,
  getNutritionRepo,
  getHabitRepo,
} from "$lib/data/repoProvider";
import { profile } from "$lib/stores/profile.store";
import { type ExportData, EXPORT_VERSION, PLUGIN_KEYS } from "./exportData";

export type { ExportData };

export type ImportCategories = {
  profile: boolean;
  exercises: boolean;
  splits: boolean;
  sessions: boolean;
  progression: boolean;
  nutrition: boolean;
  habits: boolean;
  plugins: boolean;
};

const HOME_CONFIG_KEY = "logit:home-config:v1";
const PROFILE_CONFIG_KEY = "logit:profile-config:v1";

export function parseExportFile(json: string): ExportData {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Invalid file: could not parse JSON.");
  }

  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid file: expected a JSON object.");
  }

  const d = data as Record<string, unknown>;
  const version = typeof d.version === "number" ? d.version : NaN;

  if (!Number.isFinite(version) || version < 1 || version > EXPORT_VERSION) {
    throw new Error(
      `Unsupported backup version: ${String(d.version)}. This app reads versions 1–${EXPORT_VERSION}.`,
    );
  }

  return d as unknown as ExportData;
}

/** Which categories a given file actually carries data for. */
export function availableCategories(data: ExportData): ImportCategories {
  return {
    profile: !!data.profile,
    exercises: Array.isArray(data.exercises),
    splits: !!data.splits,
    sessions: Array.isArray(data.sessions),
    progression: !!data.progression,
    nutrition: !!data.nutrition,
    habits: !!data.habits,
    plugins: !!data.plugins && Object.keys(data.plugins).length > 0,
  };
}

export async function importData(
  data: ExportData,
  categories: ImportCategories,
): Promise<void> {
  const exerciseRepo = getExerciseRepo();
  const splitRepo = getSplitRepo();
  const workoutRepo = getWorkoutRepo();
  const progressionRepo = getProgressionRepo();

  if (categories.profile && data.profile) {
    profile.save(data.profile);
    if (browser) {
      if (data.homeConfig) localStorage.setItem(HOME_CONFIG_KEY, JSON.stringify(data.homeConfig));
      if (data.profileConfig) localStorage.setItem(PROFILE_CONFIG_KEY, JSON.stringify(data.profileConfig));
    }
  }

  if (categories.exercises && data.exercises) {
    await exerciseRepo.clearAll();
    for (const exercise of data.exercises) {
      await exerciseRepo.saveExercise(exercise);
    }
  }

  if (categories.splits && data.splits) {
    const existing = await splitRepo.getListSplits({ includeArchived: true, limit: 100000 });
    for (const split of existing) {
      await splitRepo.deleteSplit(split.id);
    }
    for (const split of data.splits.splits) {
      await splitRepo.saveSplit(split);
    }
    await splitRepo.setActiveSplitId(data.splits.activeSplitId);
  }

  if (categories.sessions && data.sessions) {
    await workoutRepo.clearAllSessions();
    for (const session of data.sessions) {
      await workoutRepo.saveSession(session);
    }
  }

  if (categories.progression && data.progression) {
    await progressionRepo.clearConfig();
    await progressionRepo.clearStates();
    if (data.progression.config) {
      await progressionRepo.saveConfig(data.progression.config);
    }
    for (const state of data.progression.states) {
      await progressionRepo.saveExerciseState(state);
    }
  }

  // Nutrition + habits have no bulk-clear on the repo, so these MERGE (last-write
  // wins per row, same as sync) rather than replace. Fine for the common case —
  // restoring onto a fresh install.
  if (categories.nutrition && data.nutrition) {
    const repo = getNutritionRepo();
    const n = data.nutrition;
    for (const day of n.days ?? []) await repo.upsertDayFromRemote(day);
    for (const f of n.customFoods ?? []) await repo.upsertCustomFoodFromRemote(f);
    for (const r of n.recipes ?? []) await repo.upsertRecipeFromRemote(r);
    for (const fav of n.favorites ?? []) await repo.upsertFavoriteFromRemote(fav);
    for (const t of n.mealTemplates ?? []) await repo.upsertMealTemplateFromRemote(t);
    for (const w of n.weightEntries ?? []) await repo.upsertWeightEntryFromRemote(w);
    if (n.goal) await repo.upsertGoalFromRemote(n.goal);
  }

  if (categories.habits && data.habits) {
    const repo = getHabitRepo();
    for (const h of data.habits.habits ?? []) await repo.upsertHabitFromRemote(h);
    for (const e of data.habits.entries ?? []) await repo.upsertEntryFromRemote(e);
  }

  if (categories.plugins && data.plugins && browser) {
    for (const key of PLUGIN_KEYS) {
      const raw = data.plugins[key];
      if (typeof raw === "string") localStorage.setItem(key, raw);
    }
    // The registry cache is derived — drop it so it rebuilds from the restored sources.
    localStorage.removeItem("logit:plugins:registry-cache:v1");
  }
}
