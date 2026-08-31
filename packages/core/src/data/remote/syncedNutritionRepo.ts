import {
  createDiaryDay,
  diaryDayId,
  favoriteFoodId,
  tombstoneDay,
  tombstoneFavorite,
  tombstoneMealTemplate,
  type CustomFood,
  type DiaryDay,
  type FavoriteFood,
  type MealTemplate,
  type NutritionGoal,
  type Recipe,
  type WeightEntry,
} from "../../domain/nutrition";
import type { NutritionRepo } from "../nutritionRepo";
import { syncApi } from "../../api/syncApi";

// A read+write `NutritionRepo` over the sync API, scoped to the caller's own account —
// for logit-web's personal nutrition screens. Reads pull the full set once and cache it;
// writes mutate the cache and push the single changed row to `/sync/nutrition/*`
// immediately (server does last-write-wins). There is no local device copy and no sync
// loop here, so the `*ForPush` / `*FromRemote` methods throw.

const SYNC_LOOP_ONLY = () => {
  throw new Error("syncedNutritionRepo has no local sync loop (web owns its data live)");
};

function parseJson<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

type Row = { createdAtMs: number; updatedAtMs: number; deletedAtMs?: number };

/** Same shape the mobile syncService pushes (`nutritionRowDto`). */
function rowDto(id: string, row: Row) {
  return {
    id,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    dataJson: row.deletedAtMs ? null : JSON.stringify(row),
    deletedAtMs: row.deletedAtMs,
  };
}

/** A lazily-pulled, in-memory cache of one entity type. */
function collection<T extends { deletedAtMs?: number }>(
  pull: () => Promise<T[]>,
) {
  let cache: T[] | null = null;
  let loading: Promise<T[]> | null = null;

  async function all(): Promise<T[]> {
    if (cache) return cache;
    loading ??= pull().then((rows) => {
      cache = rows.filter((r) => !r.deletedAtMs);
      loading = null;
      return cache;
    });
    return loading;
  }

  return {
    all,
    /** Insert or replace by identity, keyed via `keyOf`. */
    async put(item: T, keyOf: (x: T) => string): Promise<void> {
      const list = await all();
      const k = keyOf(item);
      const next = list.filter((x) => keyOf(x) !== k);
      if (!item.deletedAtMs) next.push(item);
      cache = next;
    },
  };
}

export function createSyncedNutritionRepo(): NutritionRepo {
  const days = collection<DiaryDay>(async () => {
    const { days } = await syncApi.pullNutritionDays(0);
    return days.map((d) => parseJson<DiaryDay>(d.dataJson)).filter((d): d is DiaryDay => !!d);
  });
  const customFoods = collection<CustomFood>(async () => {
    const { foods } = await syncApi.pullCustomFoods(0);
    return foods.map((f) => parseJson<CustomFood>(f.dataJson)).filter((f): f is CustomFood => !!f);
  });
  const recipes = collection<Recipe>(async () => {
    const { recipes } = await syncApi.pullRecipes(0);
    return recipes.map((r) => parseJson<Recipe>(r.dataJson)).filter((r): r is Recipe => !!r);
  });
  const favorites = collection<FavoriteFood>(async () => {
    const { favorites } = await syncApi.pullFavorites(0);
    return favorites
      .map((f) => parseJson<FavoriteFood>(f.dataJson))
      .filter((f): f is FavoriteFood => !!f);
  });
  const mealTemplates = collection<MealTemplate>(async () => {
    const { templates } = await syncApi.pullMealTemplates(0);
    return templates
      .map((t) => parseJson<MealTemplate>(t.dataJson))
      .filter((t): t is MealTemplate => !!t);
  });
  const weights = collection<WeightEntry>(async () => {
    const { entries } = await syncApi.pullWeightEntries(0);
    return entries
      .map((e) => parseJson<WeightEntry>(e.dataJson))
      .filter((e): e is WeightEntry => !!e);
  });

  let goalCache: NutritionGoal | null = null;
  let goalLoading: Promise<NutritionGoal | null> | null = null;
  async function loadGoal(): Promise<NutritionGoal | null> {
    if (goalCache !== null) return goalCache;
    goalLoading ??= syncApi.pullNutritionGoal().then(({ goal }) => {
      goalCache = goal ? parseJson<NutritionGoal>(goal.dataJson) : null;
      goalLoading = null;
      return goalCache;
    });
    return goalLoading;
  }

  return {
    // ── Diary ──
    async getDay(dateIso) {
      return (await days.all()).find((d) => d.dateIso === dateIso) ?? null;
    },
    async listDaysInRange(startIso, endIso) {
      return (await days.all())
        .filter((d) => d.dateIso >= startIso && d.dateIso <= endIso)
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    },
    async saveDay(day) {
      await days.put(day, (d) => d.id);
      await syncApi.pushNutritionDays([rowDto(day.id, day)]);
    },
    async deleteDay(dateIso) {
      const existing = (await days.all()).find((d) => d.dateIso === dateIso);
      const tomb = tombstoneDay(existing ?? createDiaryDay(dateIso));
      await days.put(tomb, (d) => d.id);
      await syncApi.pushNutritionDays([rowDto(diaryDayId(dateIso), tomb)]);
    },

    // ── Custom foods ──
    async listCustomFoods() {
      return customFoods.all();
    },
    async getCustomFood(id) {
      return (await customFoods.all()).find((f) => f.food.id === id) ?? null;
    },
    async saveCustomFood(food) {
      await customFoods.put(food, (f) => f.food.id);
      await syncApi.pushCustomFoods([rowDto(food.food.id, food)]);
    },
    async deleteCustomFood(id) {
      const existing = (await customFoods.all()).find((f) => f.food.id === id);
      if (!existing) return;
      const tomb = { ...existing, deletedAtMs: Date.now(), updatedAtMs: Date.now() };
      await customFoods.put(tomb, (f) => f.food.id);
      await syncApi.pushCustomFoods([rowDto(id, tomb)]);
    },

    // ── Recipes ──
    async listRecipes() {
      return recipes.all();
    },
    async getRecipe(id) {
      return (await recipes.all()).find((r) => r.id === id) ?? null;
    },
    async saveRecipe(recipe) {
      await recipes.put(recipe, (r) => r.id);
      await syncApi.pushRecipes([rowDto(recipe.id, recipe)]);
    },
    async deleteRecipe(id) {
      const existing = (await recipes.all()).find((r) => r.id === id);
      if (!existing) return;
      const tomb = { ...existing, deletedAtMs: Date.now(), updatedAtMs: Date.now() };
      await recipes.put(tomb, (r) => r.id);
      await syncApi.pushRecipes([rowDto(id, tomb)]);
    },

    // ── Favourites ──
    async listFavorites() {
      return favorites.all();
    },
    async saveFavorite(fav) {
      await favorites.put(fav, (f) => f.food.id);
      await syncApi.pushFavorites([rowDto(favoriteFoodId(fav.food.id), fav)]);
    },
    async deleteFavorite(foodRefId) {
      const existing = (await favorites.all()).find((f) => f.food.id === foodRefId);
      if (!existing) return;
      const tomb = tombstoneFavorite(existing);
      await favorites.put(tomb, (f) => f.food.id);
      await syncApi.pushFavorites([rowDto(favoriteFoodId(foodRefId), tomb)]);
    },

    // ── Meal templates ──
    async listMealTemplates() {
      return mealTemplates.all();
    },
    async saveMealTemplate(template) {
      await mealTemplates.put(template, (t) => t.id);
      await syncApi.pushMealTemplates([rowDto(template.id, template)]);
    },
    async deleteMealTemplate(id) {
      const existing = (await mealTemplates.all()).find((t) => t.id === id);
      if (!existing) return;
      const tomb = tombstoneMealTemplate(existing);
      await mealTemplates.put(tomb, (t) => t.id);
      await syncApi.pushMealTemplates([rowDto(id, tomb)]);
    },

    // ── Bodyweight ──
    async listWeightEntries(startIso, endIso) {
      return (await weights.all())
        .filter((e) => (!startIso || e.dateIso >= startIso) && (!endIso || e.dateIso <= endIso))
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    },
    async getWeightEntry(id) {
      return (await weights.all()).find((e) => e.id === id) ?? null;
    },
    async saveWeightEntry(entry) {
      await weights.put(entry, (e) => e.id);
      await syncApi.pushWeightEntries([rowDto(entry.id, entry)]);
    },
    async deleteWeightEntry(id) {
      const existing = (await weights.all()).find((e) => e.id === id);
      if (!existing) return;
      const tomb = { ...existing, deletedAtMs: Date.now(), updatedAtMs: Date.now() };
      await weights.put(tomb, (e) => e.id);
      await syncApi.pushWeightEntries([rowDto(id, tomb)]);
    },

    // ── Goal ──
    async getGoal() {
      return loadGoal();
    },
    async saveGoal(goal) {
      goalCache = goal;
      await syncApi.pushNutritionGoal({ dataJson: JSON.stringify(goal), updatedAtMs: goal.updatedAtMs });
    },

    // ── Sync-loop surface — unused on web ──
    listDaysForPush: SYNC_LOOP_ONLY,
    upsertDayFromRemote: SYNC_LOOP_ONLY,
    removeDayFromRemote: SYNC_LOOP_ONLY,
    listCustomFoodsForPush: SYNC_LOOP_ONLY,
    upsertCustomFoodFromRemote: SYNC_LOOP_ONLY,
    removeCustomFoodFromRemote: SYNC_LOOP_ONLY,
    listRecipesForPush: SYNC_LOOP_ONLY,
    upsertRecipeFromRemote: SYNC_LOOP_ONLY,
    removeRecipeFromRemote: SYNC_LOOP_ONLY,
    listFavoritesForPush: SYNC_LOOP_ONLY,
    upsertFavoriteFromRemote: SYNC_LOOP_ONLY,
    removeFavoriteFromRemote: SYNC_LOOP_ONLY,
    listMealTemplatesForPush: SYNC_LOOP_ONLY,
    upsertMealTemplateFromRemote: SYNC_LOOP_ONLY,
    removeMealTemplateFromRemote: SYNC_LOOP_ONLY,
    listWeightEntriesForPush: SYNC_LOOP_ONLY,
    upsertWeightEntryFromRemote: SYNC_LOOP_ONLY,
    removeWeightEntryFromRemote: SYNC_LOOP_ONLY,
    upsertGoalFromRemote: SYNC_LOOP_ONLY,
  };
}
