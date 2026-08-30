import { createId } from "./ids";
import { nowMs } from "./time";

// Nutrition domain. Personal-use first (food/weight logging + goal-driven, trend-adaptive
// calorie/macro targets), extended into a PT coaching tool later. Pure data + transforms —
// the target/trend/expenditure math lives in ../nutrition/*.
//
// Storage shapes that sync (DiaryDay, CustomFood, Recipe, WeightEntry, NutritionGoal) follow
// the same last-write-wins + tombstone conventions as the workout entities: an updatedAtMs
// on everything, a deletedAtMs where a row can be removed.

// ── Macros ────────────────────────────────────────────────────────────────────

export type MacroTotals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export const ZERO_MACROS: MacroTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** 4/4/9 kcal per gram — used to derive kcal when only the three macros are known. */
export function kcalFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

export function scaleMacros(per100g: MacroTotals, grams: number): MacroTotals {
  const f = grams / 100;
  return {
    kcal: per100g.kcal * f,
    proteinG: per100g.proteinG * f,
    carbsG: per100g.carbsG * f,
    fatG: per100g.fatG * f,
  };
}

export function addMacros(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  };
}

export function roundMacros(m: MacroTotals): MacroTotals {
  return {
    kcal: Math.round(m.kcal),
    proteinG: Math.round(m.proteinG * 10) / 10,
    carbsG: Math.round(m.carbsG * 10) / 10,
    fatG: Math.round(m.fatG * 10) / 10,
  };
}

// ── Foods ─────────────────────────────────────────────────────────────────────

export type FoodSource = "usda" | "off" | "custom";

export type ServingOption = {
  id: string;
  /** e.g. "medium (118 g)", "1 cup", "100 g". */
  label: string;
  grams: number;
};

export type FoodRef = {
  id: string;
  source: FoodSource;
  name: string;
  brand?: string;
  barcode?: string;
  /** Macros per 100 g. Liquids are treated as g ≈ ml. */
  per100g: MacroTotals;
  /** Named portions; always offer a raw "100 g" too in the UI. */
  servings: ServingOption[];
};

export function gramServing(): ServingOption {
  return { id: "g", label: "100 g", grams: 100 };
}

// ── Diary ─────────────────────────────────────────────────────────────────────

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

/** One logged food or recipe inside a day. Carries its own name + computed macros so the
 * diary stays stable if the source food is later edited or deleted. */
export type LoggedItem = {
  id: string;
  meal: MealSlot;
  /** Source food/recipe id when it came from one; absent for a raw quick-add. */
  sourceId?: string;
  sourceKind?: "food" | "recipe";
  name: string;
  brand?: string;
  /** Grams actually consumed (servings resolved to grams at log time). */
  grams: number;
  /** Human portion for display, e.g. "2 × medium (236 g)". */
  servingLabel?: string;
  computed: MacroTotals;
};

export type DiaryDay = {
  id: string;
  /** Owner-local calendar date, YYYY-MM-DD. Exactly one DiaryDay per date. */
  dateIso: string;
  items: LoggedItem[];
  createdAtMs: number;
  updatedAtMs: number;
  /** Set when the day is cleared — kept (not hard-deleted) so the deletion syncs. */
  deletedAtMs?: number;
};

/** The id is derived from the date so two devices logging the same day converge on one
 * row instead of creating a duplicate. */
export function diaryDayId(dateIso: string): string {
  return `nday_${dateIso}`;
}

export function createDiaryDay(dateIso: string): DiaryDay {
  const now = nowMs();
  return { id: diaryDayId(dateIso), dateIso, items: [], createdAtMs: now, updatedAtMs: now };
}

function touchDay(day: DiaryDay): DiaryDay {
  return { ...day, updatedAtMs: nowMs() };
}

export function addDiaryItem(day: DiaryDay, item: Omit<LoggedItem, "id">): DiaryDay {
  return touchDay({ ...day, items: [...day.items, { ...item, id: createId("nitem") }] });
}

export function updateDiaryItem(
  day: DiaryDay,
  itemId: string,
  patch: Partial<Omit<LoggedItem, "id">>,
): DiaryDay {
  return touchDay({
    ...day,
    items: day.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
  });
}

export function removeDiaryItem(day: DiaryDay, itemId: string): DiaryDay {
  return touchDay({ ...day, items: day.items.filter((it) => it.id !== itemId) });
}

/** Tombstone a day (clear all items). The row is kept so the deletion propagates on sync. */
export function tombstoneDay(day: DiaryDay): DiaryDay {
  const now = nowMs();
  return { ...day, items: [], deletedAtMs: now, updatedAtMs: now };
}

/** Build a LoggedItem from a food and a chosen portion. */
export function loggedItemFromFood(
  food: FoodRef,
  meal: MealSlot,
  grams: number,
  servingLabel?: string,
): Omit<LoggedItem, "id"> {
  return {
    meal,
    sourceId: food.id,
    sourceKind: "food",
    name: food.name,
    brand: food.brand,
    grams,
    servingLabel,
    computed: roundMacros(scaleMacros(food.per100g, grams)),
  };
}

export function dayTotals(day: DiaryDay): MacroTotals {
  return day.items.reduce((acc, it) => addMacros(acc, it.computed), { ...ZERO_MACROS });
}

export function mealTotals(day: DiaryDay, meal: MealSlot): MacroTotals {
  return day.items
    .filter((it) => it.meal === meal)
    .reduce((acc, it) => addMacros(acc, it.computed), { ...ZERO_MACROS });
}

// ── Custom foods ──────────────────────────────────────────────────────────────

export type CustomFood = {
  food: FoodRef;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
};

export function createCustomFood(input: {
  name: string;
  brand?: string;
  barcode?: string;
  per100g: MacroTotals;
  servings?: ServingOption[];
}): CustomFood {
  const now = nowMs();
  return {
    food: {
      id: createId("food"),
      source: "custom",
      name: input.name.trim(),
      brand: input.brand?.trim() || undefined,
      barcode: input.barcode?.trim() || undefined,
      per100g: input.per100g,
      servings: input.servings ?? [gramServing()],
    },
    createdAtMs: now,
    updatedAtMs: now,
  };
}

// ── Recipes ───────────────────────────────────────────────────────────────────

export type RecipeIngredient = {
  id: string;
  sourceId?: string;
  name: string;
  brand?: string;
  grams: number;
  servingLabel?: string;
  computed: MacroTotals;
};

export type Recipe = {
  id: string;
  name: string;
  /** How many servings the whole recipe makes. */
  servings: number;
  ingredients: RecipeIngredient[];
  /** Cached per-serving totals; recomputed on every edit via recomputeRecipe(). */
  perServing: MacroTotals;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
};

export function createRecipe(name: string, servings = 1): Recipe {
  const now = nowMs();
  return {
    id: createId("rcp"),
    name: name.trim() || "Recipe",
    servings: Math.max(1, servings),
    ingredients: [],
    perServing: { ...ZERO_MACROS },
    createdAtMs: now,
    updatedAtMs: now,
  };
}

/** Recompute perServing from ingredients + servings; call after any structural edit. */
export function recomputeRecipe(recipe: Recipe): Recipe {
  const total = recipe.ingredients.reduce(
    (acc, ing) => addMacros(acc, ing.computed),
    { ...ZERO_MACROS },
  );
  const per = Math.max(1, recipe.servings);
  return {
    ...recipe,
    perServing: roundMacros({
      kcal: total.kcal / per,
      proteinG: total.proteinG / per,
      carbsG: total.carbsG / per,
      fatG: total.fatG / per,
    }),
    updatedAtMs: nowMs(),
  };
}

/** A recipe presented as a food so it can be searched and logged like one — one "serving"
 * portion, plus a whole-recipe portion. Grams are notional (1 serving = 100 units). */
export function recipeAsFood(recipe: Recipe): FoodRef {
  return {
    id: recipe.id,
    source: "custom",
    name: recipe.name,
    per100g: recipe.perServing, // 100 "grams" == 1 serving
    servings: [
      { id: "serving", label: "1 serving", grams: 100 },
      { id: "whole", label: `whole recipe (${recipe.servings})`, grams: 100 * recipe.servings },
    ],
  };
}

// ── Weight ────────────────────────────────────────────────────────────────────

export type WeightEntry = {
  id: string;
  /** Owner-local date, YYYY-MM-DD. */
  dateIso: string;
  /** Canonical kilograms; the UI converts for display. */
  weightKg: number;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
};

export function createWeightEntry(dateIso: string, weightKg: number): WeightEntry {
  const now = nowMs();
  return { id: createId("wt"), dateIso, weightKg, createdAtMs: now, updatedAtMs: now };
}

// ── Goal ──────────────────────────────────────────────────────────────────────

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extra";
export type GoalType = "lose" | "maintain" | "gain";

export type NutritionGoal = {
  sex: Sex;
  birthDateIso?: string;
  heightCm?: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  /** Desired rate of change in kg/week, always positive; direction comes from goalType. */
  targetRateKgPerWeek: number;
  targetWeightKg?: number;
  /** Protein target in grams per kg of bodyweight. */
  proteinGPerKg: number;
  /** Fat as a fraction of total calories (0–1); carbs take the remainder. */
  fatPct: number;
  /** @deprecated read-only fallback for the standard-adaptive algorithm's `adaptive` pref.
   * New writes go to algorithmPrefs["standard-adaptive"].adaptive. */
  adaptiveEnabled: boolean;
  /** Hard override — when set, ignore the algorithm's calorie target. */
  manualCalorieTarget?: number;

  /** Which nutrition algorithm computes the calorie target. Undefined → the built-in
   * "standard-adaptive". Community algorithms are installed as plugins. */
  algorithmId?: string;
  /** Per-algorithm preferences, keyed by algorithm id, shape defined by each algorithm's
   * preferencesSchema. Rides on the goal so it syncs with no extra plumbing. */
  algorithmPrefs?: Record<string, Record<string, unknown>>;
  /** Which nutrition analytics plugin powers the insights screen. Undefined → the built-in
   * "basic-nutrition-analytics". */
  analyticsId?: string;

  updatedAtMs: number;
};

export function defaultNutritionGoal(): NutritionGoal {
  return {
    sex: "male",
    activityLevel: "moderate",
    goalType: "maintain",
    targetRateKgPerWeek: 0,
    proteinGPerKg: 1.8,
    fatPct: 0.3,
    adaptiveEnabled: true,
    updatedAtMs: nowMs(),
  };
}

export function touchGoal(goal: NutritionGoal): NutritionGoal {
  return { ...goal, updatedAtMs: nowMs() };
}

export const DEFAULT_NUTRITION_ALGORITHM_ID = "standard-adaptive";
export const DEFAULT_NUTRITION_ANALYTICS_ID = "basic-nutrition-analytics";

export function resolveAlgorithmId(goal: NutritionGoal | null): string {
  return goal?.algorithmId || DEFAULT_NUTRITION_ALGORITHM_ID;
}

export function resolveAnalyticsId(goal: NutritionGoal | null): string {
  return goal?.analyticsId || DEFAULT_NUTRITION_ANALYTICS_ID;
}

/** Stored preferences for one algorithm (may be empty — the caller merges its defaults). */
export function algorithmPrefsFor(
  goal: NutritionGoal | null,
  algorithmId: string,
): Record<string, unknown> {
  return goal?.algorithmPrefs?.[algorithmId] ?? {};
}

export function withAlgorithm(goal: NutritionGoal, algorithmId: string): NutritionGoal {
  return touchGoal({ ...goal, algorithmId });
}

export function withAlgorithmPrefs(
  goal: NutritionGoal,
  algorithmId: string,
  prefs: Record<string, unknown>,
): NutritionGoal {
  return touchGoal({
    ...goal,
    algorithmPrefs: { ...(goal.algorithmPrefs ?? {}), [algorithmId]: prefs },
  });
}

export function withAnalytics(goal: NutritionGoal, analyticsId: string): NutritionGoal {
  return touchGoal({ ...goal, analyticsId });
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** Owner-local YYYY-MM-DD for a Date (defaults to now). Diary days and weight entries key
 * on this so "today" is the user's calendar day, not UTC. */
export function localDateIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
