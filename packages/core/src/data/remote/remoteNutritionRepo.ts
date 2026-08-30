import type {
  CustomFood,
  DiaryDay,
  NutritionGoal,
  Recipe,
  WeightEntry,
} from "../../domain/nutrition";
import type { NutritionRepo } from "../nutritionRepo";
import { syncApi } from "../../api/syncApi";

// API-backed reads of a client's nutrition data, for the Studio (logit-web) coach dashboard.
// Requires an Active coach relationship — enforced server-side via `?clientId=`.

function parseJson<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function fetchClientDiary(clientId: string): Promise<DiaryDay[]> {
  const { days } = await syncApi.pullNutritionDays(0, clientId);
  return days
    .filter((d) => !d.deletedAtMs)
    .map((d) => parseJson<DiaryDay>(d.dataJson))
    .filter((d): d is DiaryDay => d !== null);
}

export async function fetchClientWeightLog(clientId: string): Promise<WeightEntry[]> {
  const { entries } = await syncApi.pullWeightEntries(0, clientId);
  return entries
    .filter((e) => !e.deletedAtMs)
    .map((e) => parseJson<WeightEntry>(e.dataJson))
    .filter((e): e is WeightEntry => e !== null);
}

export async function fetchClientNutritionGoal(clientId: string): Promise<NutritionGoal | null> {
  const { goal } = await syncApi.pullNutritionGoal(clientId);
  return goal ? parseJson<NutritionGoal>(goal.dataJson) : null;
}

const unsupported = () => {
  throw new Error("remoteNutritionRepo is read-only (coach view of a client)");
};

/**
 * A read-only `NutritionRepo` over one client's data, so the @logit/core nutrition usecases
 * (getNutritionTargets, getNutritionInsights) can run unchanged in the Studio dashboard.
 * Every write / sync-merge method throws — a coach never mutates a client's log.
 */
export function createRemoteNutritionRepo(clientId: string): NutritionRepo {
  let diaryCache: Promise<DiaryDay[]> | null = null;
  const allDays = () => (diaryCache ??= fetchClientDiary(clientId));

  return {
    async getDay(dateIso) {
      return (await allDays()).find((d) => d.dateIso === dateIso) ?? null;
    },
    async listDaysInRange(startIso, endIso) {
      return (await allDays())
        .filter((d) => d.dateIso >= startIso && d.dateIso <= endIso)
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    },
    saveDay: unsupported,
    deleteDay: unsupported,

    async listCustomFoods() {
      return [] as CustomFood[];
    },
    async getCustomFood() {
      return null;
    },
    saveCustomFood: unsupported,
    deleteCustomFood: unsupported,

    async listRecipes() {
      return [] as Recipe[];
    },
    async getRecipe() {
      return null;
    },
    saveRecipe: unsupported,
    deleteRecipe: unsupported,

    async listWeightEntries(startIso, endIso) {
      const all = await fetchClientWeightLog(clientId);
      return all
        .filter((e) => (!startIso || e.dateIso >= startIso) && (!endIso || e.dateIso <= endIso))
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    },
    async getWeightEntry(id) {
      return (await fetchClientWeightLog(clientId)).find((e) => e.id === id) ?? null;
    },
    saveWeightEntry: unsupported,
    deleteWeightEntry: unsupported,

    getGoal() {
      return fetchClientNutritionGoal(clientId);
    },
    saveGoal: unsupported,

    listDaysForPush: unsupported,
    upsertDayFromRemote: unsupported,
    removeDayFromRemote: unsupported,
    listCustomFoodsForPush: unsupported,
    upsertCustomFoodFromRemote: unsupported,
    removeCustomFoodFromRemote: unsupported,
    listRecipesForPush: unsupported,
    upsertRecipeFromRemote: unsupported,
    removeRecipeFromRemote: unsupported,
    listWeightEntriesForPush: unsupported,
    upsertWeightEntryFromRemote: unsupported,
    removeWeightEntryFromRemote: unsupported,
    upsertGoalFromRemote: unsupported,
  };
}
