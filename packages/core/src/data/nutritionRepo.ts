import type {
  CustomFood,
  DiaryDay,
  NutritionGoal,
  Recipe,
  WeightEntry,
} from "../domain/nutrition";

/**
 * The user's own nutrition data: food diary, custom foods, recipes, bodyweight log and the
 * nutrition goal. All client-owned (like workout sessions) — authored on-device, synced up
 * through /sync/nutrition/*, and (from Phase 3) readable by an Active coach via ?clientId=.
 *
 * The `*FromRemote` / `*ForPush` methods are the sync-loop surface and are never called
 * from the UI. Split out the same way as AssignedCheckinRepo.
 */
export interface NutritionRepo {
  // ── Diary (one DiaryDay per calendar date) ──
  getDay(dateIso: string): Promise<DiaryDay | null>;
  listDaysInRange(startIso: string, endIso: string): Promise<DiaryDay[]>;
  saveDay(day: DiaryDay): Promise<void>;
  /** Remove all logged items for a date (tombstoned for sync). */
  deleteDay(dateIso: string): Promise<void>;

  // ── Custom foods ──
  listCustomFoods(): Promise<CustomFood[]>;
  getCustomFood(id: string): Promise<CustomFood | null>;
  saveCustomFood(food: CustomFood): Promise<void>;
  deleteCustomFood(id: string): Promise<void>;

  // ── Recipes ──
  listRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | null>;
  saveRecipe(recipe: Recipe): Promise<void>;
  deleteRecipe(id: string): Promise<void>;

  // ── Bodyweight ──
  listWeightEntries(startIso?: string, endIso?: string): Promise<WeightEntry[]>;
  saveWeightEntry(entry: WeightEntry): Promise<void>;
  deleteWeightEntry(id: string): Promise<void>;

  // ── Goal (singleton per owner) ──
  getGoal(): Promise<NutritionGoal | null>;
  saveGoal(goal: NutritionGoal): Promise<void>;

  // ── Sync-merge surface (sync loop only) ──
  listDaysForPush(): Promise<DiaryDay[]>;
  upsertDayFromRemote(day: DiaryDay): Promise<void>;
  removeDayFromRemote(id: string): Promise<void>;

  listCustomFoodsForPush(): Promise<CustomFood[]>;
  upsertCustomFoodFromRemote(food: CustomFood): Promise<void>;
  removeCustomFoodFromRemote(id: string): Promise<void>;

  listRecipesForPush(): Promise<Recipe[]>;
  upsertRecipeFromRemote(recipe: Recipe): Promise<void>;
  removeRecipeFromRemote(id: string): Promise<void>;

  listWeightEntriesForPush(): Promise<WeightEntry[]>;
  upsertWeightEntryFromRemote(entry: WeightEntry): Promise<void>;
  removeWeightEntryFromRemote(id: string): Promise<void>;

  upsertGoalFromRemote(goal: NutritionGoal): Promise<void>;
}
