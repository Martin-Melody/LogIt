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

/** Raw amount units the diary accepts alongside named servings. Volume assumes a
 * density of ~1 (g ≈ ml), the same assumption `per100g` already makes for liquids. */
export const MEASURE_UNITS = ["g", "ml", "oz"] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];

const GRAMS_PER_UNIT: Record<MeasureUnit, number> = {
  g: 1,
  ml: 1,
  oz: 28.349523125, // international avoirdupois ounce
};

export function isMeasureUnit(v: string): v is MeasureUnit {
  return (MEASURE_UNITS as readonly string[]).includes(v);
}

/** Convert a raw amount in the given unit to grams for storage / macro scaling. */
export function unitToGrams(amount: number, unit: MeasureUnit): number {
  return amount * GRAMS_PER_UNIT[unit];
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
  /** Optional meal photo (small jpeg data URL). Rides in the synced day blob; a coach sees
   * it in the client's diary. */
  photoDataUrl?: string;
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

/** Replace the day's items wholesale — for drag-to-reorder / move-between-meals. */
export function setDiaryItems(day: DiaryDay, items: LoggedItem[]): DiaryDay {
  return touchDay({ ...day, items });
}

/** Move one item to another meal, keeping the rest untouched. */
export function moveDiaryItem(day: DiaryDay, itemId: string, meal: MealSlot): DiaryDay {
  return updateDiaryItem(day, itemId, { meal });
}

/**
 * Append copies of `items` into `day`, each with a fresh id and its meal slot kept.
 * Meal photos are dropped — they belong to the original day's entry. Used by
 * "copy a previous day" so a repeated day of eating is one tap, not a re-log per food.
 * Optionally restrict to one meal slot.
 */
export function copyDiaryItems(day: DiaryDay, items: LoggedItem[], meal?: MealSlot): DiaryDay {
  let next = day;
  for (const it of items) {
    if (meal && it.meal !== meal) continue;
    const { id: _id, photoDataUrl: _photo, ...rest } = it;
    next = addDiaryItem(next, rest);
  }
  return next;
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

/**
 * Recover the per-100 g macro basis of a logged item from its stored grams + computed
 * totals. Returns null for quick-adds (grams 0) where there is no basis — the caller then
 * edits the absolute macros directly. Used by the item-edit screen to rescale when the
 * amount changes without needing the source food.
 */
export function loggedItemPer100g(
  item: Pick<LoggedItem, "grams" | "computed">,
): MacroTotals | null {
  if (!(item.grams > 0)) return null;
  const f = 100 / item.grams;
  return {
    kcal: item.computed.kcal * f,
    proteinG: item.computed.proteinG * f,
    carbsG: item.computed.carbsG * f,
    fatG: item.computed.fatG * f,
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

// ── Meal templates (a saved set of foods, logged in one tap) ──────────────────

/** One food inside a meal template — a LoggedItem without the per-log fields. */
export type MealTemplateItem = {
  name: string;
  brand?: string;
  sourceId?: string;
  sourceKind?: "food" | "recipe";
  grams: number;
  servingLabel?: string;
  computed: MacroTotals;
};

export type MealTemplate = {
  id: string;
  name: string;
  items: MealTemplateItem[];
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
};

export function createMealTemplate(name: string, items: MealTemplateItem[] = []): MealTemplate {
  const now = nowMs();
  return { id: createId("mtpl"), name: name.trim() || "Meal", items, createdAtMs: now, updatedAtMs: now };
}

/** Snapshot a meal from a day as a reusable template. */
export function mealTemplateFromDay(day: DiaryDay, meal: MealSlot, name: string): MealTemplate {
  const items: MealTemplateItem[] = day.items
    .filter((it) => it.meal === meal)
    .map(({ name: n, brand, sourceId, sourceKind, grams, servingLabel, computed }) => ({
      name: n,
      brand,
      sourceId,
      sourceKind,
      grams,
      servingLabel,
      computed,
    }));
  return createMealTemplate(name, items);
}

export function mealTemplateTotals(t: MealTemplate): MacroTotals {
  return t.items.reduce((acc, it) => addMacros(acc, it.computed), { ...ZERO_MACROS });
}

export function tombstoneMealTemplate(t: MealTemplate): MealTemplate {
  const now = nowMs();
  return { ...t, deletedAtMs: now, updatedAtMs: now };
}

/** Expand a template into diary items for a chosen meal. */
export function mealTemplateToItems(t: MealTemplate, meal: MealSlot): Omit<LoggedItem, "id">[] {
  return t.items.map((it) => ({ ...it, meal }));
}

// ── Favourites & recents (fast logging) ───────────────────────────────────────

/** A food the user pinned for one-tap access. Synced like CustomFood; the id derives from
 * the food's id so the same pin from two devices converges. */
export type FavoriteFood = {
  food: FoodRef;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
};

export function favoriteFoodId(foodRefId: string): string {
  return `fav_${foodRefId}`;
}

export function createFavoriteFood(food: FoodRef): FavoriteFood {
  const now = nowMs();
  return { food, createdAtMs: now, updatedAtMs: now };
}

export function tombstoneFavorite(fav: FavoriteFood): FavoriteFood {
  const now = nowMs();
  return { ...fav, deletedAtMs: now, updatedAtMs: now };
}

/** A distinct food logged in the recent past, ready to re-log in one tap. Derived from the
 * diary — never stored. */
export type RecentFood = {
  /** Dedupe key: source id when the item came from a food/recipe, else name+brand. */
  key: string;
  name: string;
  brand?: string;
  grams: number;
  servingLabel?: string;
  computed: MacroTotals;
  sourceId?: string;
  sourceKind?: "food" | "recipe";
  /** ISO date of the most recent time it was logged. */
  lastLoggedIso: string;
  /** How many times it appears across the scanned window. */
  count: number;
};

function recentKey(it: Pick<LoggedItem, "sourceId" | "name" | "brand">): string {
  return it.sourceId ?? `${it.name} ${it.brand ?? ""}`;
}

/**
 * Roll up the logged items across `days` into a most-recent-first list of distinct foods.
 * Recency is by calendar date (the diary has no per-item timestamps); later items within a
 * day count as more recent.
 */
export function recentFoodsFromDays(days: DiaryDay[], limit = 40): RecentFood[] {
  const byKey = new Map<string, RecentFood>();
  const sorted = [...days]
    .filter((d) => !d.deletedAtMs)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso)); // oldest first

  for (const day of sorted) {
    for (const it of day.items) {
      const key = recentKey(it);
      const existing = byKey.get(key);
      byKey.set(key, {
        key,
        name: it.name,
        brand: it.brand,
        grams: it.grams,
        servingLabel: it.servingLabel,
        computed: it.computed,
        sourceId: it.sourceId,
        sourceKind: it.sourceKind,
        lastLoggedIso: day.dateIso,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.lastLoggedIso.localeCompare(a.lastLoggedIso) || b.count - a.count)
    .slice(0, limit);
}

/** Re-log a recent food into a meal (same portion as last time). */
export function loggedItemFromRecent(r: RecentFood, meal: MealSlot): Omit<LoggedItem, "id"> {
  return {
    meal,
    sourceId: r.sourceId,
    sourceKind: r.sourceKind,
    name: r.name,
    brand: r.brand,
    grams: r.grams,
    servingLabel: r.servingLabel,
    computed: r.computed,
  };
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

/**
 * Edit a custom food in place — keeps its id and createdAtMs so diary items that reference
 * it stay linked, bumps updatedAtMs for sync. Already-logged items keep the macros they
 * snapshotted; only future logs use the new numbers. Pass `null` to clear brand/barcode.
 */
export function updateCustomFood(
  existing: CustomFood,
  patch: {
    name?: string;
    brand?: string | null;
    barcode?: string | null;
    per100g?: MacroTotals;
    servings?: ServingOption[];
  },
): CustomFood {
  const f = existing.food;
  return {
    ...existing,
    food: {
      ...f,
      name: patch.name?.trim() || f.name,
      brand: patch.brand === undefined ? f.brand : patch.brand?.trim() || undefined,
      barcode: patch.barcode === undefined ? f.barcode : patch.barcode?.trim() || undefined,
      per100g: patch.per100g ?? f.per100g,
      servings: patch.servings ?? f.servings,
    },
    updatedAtMs: nowMs(),
  };
}

export function tombstoneCustomFood(food: CustomFood): CustomFood {
  const now = nowMs();
  return { ...food, deletedAtMs: now, updatedAtMs: now };
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
