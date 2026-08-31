import { browser } from "$app/environment";
import type { NutritionRepo } from "@logit/core/data/nutritionRepo";
import type {
  CustomFood,
  DiaryDay,
  FavoriteFood,
  MealTemplate,
  NutritionGoal,
  Recipe,
  WeightEntry,
} from "@logit/core/domain/nutrition";
import { diaryDayId, favoriteFoodId } from "@logit/core/domain/nutrition";

const KEYS = {
  days: "logit:nutritionDays:v1", // Record<id, DiaryDay>
  customFoods: "logit:customFoods:v1", // Record<id, CustomFood>
  recipes: "logit:recipes:v1", // Record<id, Recipe>
  favorites: "logit:favoriteFoods:v1", // Record<favId, FavoriteFood>
  mealTemplates: "logit:mealTemplates:v1", // Record<id, MealTemplate>
  weight: "logit:weightEntries:v1", // Record<id, WeightEntry>
  goal: "logit:nutritionGoal:v1", // NutritionGoal | null
} as const;

function read<T>(key: string): Record<string, T> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, T>;
  } catch {
    return {};
  }
}
function write<T>(key: string, map: Record<string, T>): void {
  if (browser) localStorage.setItem(key, JSON.stringify(map));
}

type Tombstoned = { deletedAtMs?: number; updatedAtMs: number };

function liveValues<T extends Tombstoned>(key: string): T[] {
  return Object.values(read<T>(key))
    .filter((v) => !v.deletedAtMs)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

function tombstone<T extends Tombstoned>(key: string, id: string): void {
  const map = read<T>(key);
  const row = map[id];
  if (!row) return;
  const now = Date.now();
  map[id] = { ...row, deletedAtMs: now, updatedAtMs: now };
  write(key, map);
}

function put<T>(key: string, id: string, value: T): void {
  const map = read<T>(key);
  map[id] = value;
  write(key, map);
}

/** localStorage nutrition repo — used when running logit-frontend on the web (no SQLite). */
export function createLocalNutritionRepo(): NutritionRepo {
  return {
    // ── Diary ──
    async getDay(dateIso) {
      const d = read<DiaryDay>(KEYS.days)[diaryDayId(dateIso)];
      return d && !d.deletedAtMs ? d : null;
    },
    async listDaysInRange(startIso, endIso) {
      return Object.values(read<DiaryDay>(KEYS.days))
        .filter((d) => !d.deletedAtMs && d.dateIso >= startIso && d.dateIso <= endIso)
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    },
    async saveDay(day) {
      put(KEYS.days, day.id, day);
    },
    async deleteDay(dateIso) {
      tombstone<DiaryDay & Tombstoned>(KEYS.days, diaryDayId(dateIso));
    },

    // ── Custom foods ──
    async listCustomFoods() {
      return liveValues<CustomFood & Tombstoned>(KEYS.customFoods);
    },
    async getCustomFood(id) {
      const f = read<CustomFood>(KEYS.customFoods)[id];
      return f && !f.deletedAtMs ? f : null;
    },
    async saveCustomFood(food) {
      put(KEYS.customFoods, food.food.id, food);
    },
    async deleteCustomFood(id) {
      tombstone<CustomFood & Tombstoned>(KEYS.customFoods, id);
    },

    // ── Recipes ──
    async listRecipes() {
      return liveValues<Recipe & Tombstoned>(KEYS.recipes);
    },
    async getRecipe(id) {
      const r = read<Recipe>(KEYS.recipes)[id];
      return r && !r.deletedAtMs ? r : null;
    },
    async saveRecipe(recipe) {
      put(KEYS.recipes, recipe.id, recipe);
    },
    async deleteRecipe(id) {
      tombstone<Recipe & Tombstoned>(KEYS.recipes, id);
    },

    // ── Favourites ──
    async listFavorites() {
      return liveValues<FavoriteFood & Tombstoned>(KEYS.favorites);
    },
    async saveFavorite(fav) {
      put(KEYS.favorites, favoriteFoodId(fav.food.id), fav);
    },
    async deleteFavorite(foodRefId) {
      tombstone<FavoriteFood & Tombstoned>(KEYS.favorites, favoriteFoodId(foodRefId));
    },

    // ── Meal templates ──
    async listMealTemplates() {
      return liveValues<MealTemplate & Tombstoned>(KEYS.mealTemplates);
    },
    async saveMealTemplate(t) {
      put(KEYS.mealTemplates, t.id, t);
    },
    async deleteMealTemplate(id) {
      tombstone<MealTemplate & Tombstoned>(KEYS.mealTemplates, id);
    },

    // ── Weight ──
    async listWeightEntries(startIso, endIso) {
      return Object.values(read<WeightEntry>(KEYS.weight))
        .filter(
          (e) =>
            !e.deletedAtMs &&
            (!startIso || e.dateIso >= startIso) &&
            (!endIso || e.dateIso <= endIso),
        )
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    },
    async getWeightEntry(id) {
      const e = read<WeightEntry>(KEYS.weight)[id];
      return e && !e.deletedAtMs ? e : null;
    },
    async saveWeightEntry(entry) {
      put(KEYS.weight, entry.id, entry);
    },
    async deleteWeightEntry(id) {
      tombstone<WeightEntry & Tombstoned>(KEYS.weight, id);
    },

    // ── Goal ──
    async getGoal() {
      if (!browser) return null;
      try {
        return JSON.parse(localStorage.getItem(KEYS.goal) ?? "null") as NutritionGoal | null;
      } catch {
        return null;
      }
    },
    async saveGoal(goal) {
      if (browser) localStorage.setItem(KEYS.goal, JSON.stringify(goal));
    },

    // ── Sync-merge surface ──
    async listDaysForPush() {
      return Object.values(read<DiaryDay>(KEYS.days));
    },
    async upsertDayFromRemote(day) {
      put(KEYS.days, day.id, day);
    },
    async removeDayFromRemote(id) {
      tombstone<DiaryDay & Tombstoned>(KEYS.days, id);
    },

    async listCustomFoodsForPush() {
      return Object.values(read<CustomFood>(KEYS.customFoods));
    },
    async upsertCustomFoodFromRemote(food) {
      put(KEYS.customFoods, food.food.id, food);
    },
    async removeCustomFoodFromRemote(id) {
      tombstone<CustomFood & Tombstoned>(KEYS.customFoods, id);
    },

    async listRecipesForPush() {
      return Object.values(read<Recipe>(KEYS.recipes));
    },
    async upsertRecipeFromRemote(recipe) {
      put(KEYS.recipes, recipe.id, recipe);
    },
    async removeRecipeFromRemote(id) {
      tombstone<Recipe & Tombstoned>(KEYS.recipes, id);
    },

    async listFavoritesForPush() {
      return Object.values(read<FavoriteFood>(KEYS.favorites));
    },
    async upsertFavoriteFromRemote(fav) {
      put(KEYS.favorites, favoriteFoodId(fav.food.id), fav);
    },
    async removeFavoriteFromRemote(id) {
      tombstone<FavoriteFood & Tombstoned>(KEYS.favorites, id);
    },

    async listMealTemplatesForPush() {
      return Object.values(read<MealTemplate>(KEYS.mealTemplates));
    },
    async upsertMealTemplateFromRemote(t) {
      put(KEYS.mealTemplates, t.id, t);
    },
    async removeMealTemplateFromRemote(id) {
      tombstone<MealTemplate & Tombstoned>(KEYS.mealTemplates, id);
    },

    async listWeightEntriesForPush() {
      return Object.values(read<WeightEntry>(KEYS.weight));
    },
    async upsertWeightEntryFromRemote(entry) {
      put(KEYS.weight, entry.id, entry);
    },
    async removeWeightEntryFromRemote(id) {
      tombstone<WeightEntry & Tombstoned>(KEYS.weight, id);
    },

    async upsertGoalFromRemote(goal) {
      if (browser) localStorage.setItem(KEYS.goal, JSON.stringify(goal));
    },
  };
}
