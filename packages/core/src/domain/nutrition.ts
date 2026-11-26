import { createId } from "./ids";
import { nowMs } from "./time";
import { addNutrients, cleanNutrients, roundNutrients, scaleNutrients, type Nutrients } from "./nutrients";

export * from "./nutrients";

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
  /** Fibre, sugar, sat fat, salt, vitamins and minerals per 100 g, as far as known. */
  nutrients?: Nutrients;
  /** Named portions; always offer a raw "100 g" too in the UI. */
  servings: ServingOption[];
};

export function gramServing(): ServingOption {
  return { id: "g", label: "100 g", grams: 100 };
}

/** Raw amount units the diary accepts alongside named servings. Volume assumes a
 * density of ~1 (g ≈ ml), the same assumption `per100g` already makes for liquids, so the
 * spoon/cup sizes are approximate (the picker shows their grams). */
export const MEASURE_UNITS = ["g", "ml", "oz", "kg", "l", "lb", "tsp", "tbsp", "cup"] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];

/** The units offered up front; the rest sit behind "more units". */
export const COMMON_MEASURE_UNITS: readonly MeasureUnit[] = ["g", "ml", "oz"];

export const GRAMS_PER_UNIT: Record<MeasureUnit, number> = {
  g: 1,
  ml: 1,
  oz: 28.349523125, // international avoirdupois ounce
  kg: 1000,
  l: 1000,
  lb: 453.59237,
  tsp: 5,
  tbsp: 15,
  cup: 240,
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
  /** The portion as picked (e.g. 2 of serving "medium"), so editing reopens it the same way. */
  amount?: number;
  portionId?: string;
  computed: MacroTotals;
  /** Other nutrients for this amount, as far as the food knew them. */
  nutrients?: Nutrients;
  /** Optional meal photo (small jpeg data URL). Rides in the synced day blob; a coach sees
   * it in the client's diary. */
  photoDataUrl?: string;
  /** Epoch ms this item was actually logged, set only when logged to *today's* diary
   * (see addDiaryItem) -- a backfilled/corrected past day deliberately gets no timestamp,
   * since "now" would misrepresent when it was really eaten. Additive: entries logged
   * before this field existed simply lack it and can't be used for the meal-timing
   * correlation (adaptive-progression-engine.md §9) that needs real clock time; the
   * day-level correlation only needs dateIso and works regardless. */
  loggedAtMs?: number;
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

/** "HH:MM" (24-hour, local) of a moment, for the "Time eaten" field. */
export function timeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The moment `hhmm` ("19:02", local) on a YYYY-MM-DD day. */
export function atTimeOn(dateIso: string, hhmm: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y!, m! - 1, d!, h, min).getTime();
}

/** A time set on the item is kept (eaten earlier, logged now); otherwise today's items get
 * "now", and an earlier day's get none. */
export function addDiaryItem(day: DiaryDay, item: Omit<LoggedItem, "id">): DiaryDay {
  const loggedAtMs = item.loggedAtMs ?? (day.dateIso === localDateIso() ? nowMs() : undefined);
  return touchDay({ ...day, items: [...day.items, { ...item, loggedAtMs, id: createId("nitem") }] });
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

/** Change how much of an item was eaten: its macros and nutrients scale with the grams, and the
 * portion becomes plain grams (web food menu, canvas board 13). */
export function resizeDiaryItem(day: DiaryDay, itemId: string, grams: number): DiaryDay {
  const it = day.items.find((x) => x.id === itemId);
  if (!it || !(grams > 0) || !(it.grams > 0)) return day;
  const f = grams / it.grams;
  return updateDiaryItem(day, itemId, {
    grams,
    computed: roundMacros({ kcal: it.computed.kcal * f, proteinG: it.computed.proteinG * f, carbsG: it.computed.carbsG * f, fatG: it.computed.fatG * f }),
    ...(it.nutrients ? { nutrients: roundNutrients(scaleNutrients(it.nutrients, f * 100)) } : {}),
    servingLabel: `${Math.round(grams)} g`,
    amount: undefined,
    portionId: undefined,
  });
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
    const { id: _id, photoDataUrl: _photo, loggedAtMs, ...rest } = it;
    // Same time of day, on the day it's copied to.
    next = addDiaryItem(next, loggedAtMs === undefined ? rest : { ...rest, loggedAtMs: atTimeOn(day.dateIso, timeOfDay(loggedAtMs)) });
  }
  return next;
}

/** Tombstone a day (clear all items). The row is kept so the deletion propagates on sync. */
export function tombstoneDay(day: DiaryDay): DiaryDay {
  const now = nowMs();
  return { ...day, items: [], deletedAtMs: now, updatedAtMs: now };
}

/** Recipe ids carry the "rcp" prefix (createRecipe). */
export function isRecipeId(id: string | undefined): boolean {
  return !!id && id.startsWith("rcp_");
}

/** Build a LoggedItem from a food (or a recipe via recipeAsFood) and a chosen portion. */
export function loggedItemFromFood(
  food: FoodRef,
  meal: MealSlot,
  grams: number,
  servingLabel?: string,
  portion?: { amount: number; portionId: string },
): Omit<LoggedItem, "id"> {
  return {
    meal,
    sourceId: food.id,
    sourceKind: isRecipeId(food.id) ? "recipe" : "food",
    name: food.name,
    brand: food.brand,
    grams,
    servingLabel,
    ...(portion ? { amount: portion.amount, portionId: portion.portionId } : {}),
    computed: roundMacros(scaleMacros(food.per100g, grams)),
    ...nutrientsFor(food, grams),
  };
}

/** `{ nutrients }` for this many grams of a food, or nothing when the food has none. */
export function nutrientsFor(food: Pick<FoodRef, "nutrients">, grams: number): { nutrients?: Nutrients } {
  const n = roundNutrients(scaleNutrients(food.nutrients, grams));
  return n && Object.keys(n).length > 0 ? { nutrients: n } : {};
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
  nutrients?: Nutrients;
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
    .map(({ name: n, brand, sourceId, sourceKind, grams, servingLabel, computed, nutrients }) => ({
      name: n,
      brand,
      sourceId,
      sourceKind,
      grams,
      servingLabel,
      computed,
      ...(nutrients ? { nutrients } : {}),
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
  amount?: number;
  portionId?: string;
  computed: MacroTotals;
  nutrients?: Nutrients;
  sourceId?: string;
  sourceKind?: "food" | "recipe";
  /** ISO date of the most recent time it was logged. */
  lastLoggedIso: string;
  /** How many times it appears across the scanned window. */
  count: number;
};

export function recentKey(it: Pick<LoggedItem, "sourceId" | "name" | "brand">): string {
  return it.sourceId ?? `${it.name} ${it.brand ?? ""}`;
}

/**
 * Roll up the logged items across `days` into a most-recent-first list of distinct foods.
 * Recency is by calendar date (the diary has no per-item timestamps); later items within a
 * day count as more recent.
 */
/** Keys (see recentKey) of foods logged at this meal at least `min` times. */
export function usualAtMeal(days: readonly DiaryDay[], meal: MealSlot, min = 2): Set<string> {
  const counts = new Map<string, number>();
  for (const d of days) {
    if (d.deletedAtMs) continue;
    for (const it of d.items) if (it.meal === meal) counts.set(recentKey(it), (counts.get(recentKey(it)) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= min).map(([k]) => k));
}

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
        amount: it.amount,
        portionId: it.portionId,
        computed: it.computed,
        ...(it.nutrients ? { nutrients: it.nutrients } : {}),
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
    ...(r.amount != null && r.portionId ? { amount: r.amount, portionId: r.portionId } : {}),
    computed: r.computed,
    ...(r.nutrients ? { nutrients: r.nutrients } : {}),
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
  nutrients?: Nutrients;
  servings?: ServingOption[];
}): CustomFood {
  const now = nowMs();
  const nutrients = cleanNutrients(input.nutrients);
  return {
    food: {
      id: createId("food"),
      source: "custom",
      name: input.name.trim(),
      brand: input.brand?.trim() || undefined,
      barcode: input.barcode?.trim() || undefined,
      per100g: input.per100g,
      ...(nutrients ? { nutrients } : {}),
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
    /** Replaces the whole set; null clears it. */
    nutrients?: Nutrients | null;
    servings?: ServingOption[];
  },
): CustomFood {
  const { nutrients: oldNutrients, ...f } = existing.food;
  const nutrients = patch.nutrients === undefined ? oldNutrients : cleanNutrients(patch.nutrients);
  return {
    ...existing,
    food: {
      ...f,
      ...(nutrients ? { nutrients } : {}),
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
  /** The amount as picked ("3" of portion "tin"), so editing reopens it the same way. */
  amount?: number;
  portionId?: string;
  computed: MacroTotals;
  nutrients?: Nutrients;
};

export type RecipePortionMode = "servings" | "weight";

export type Recipe = {
  id: string;
  name: string;
  /** How many servings the whole recipe makes. */
  servings: number;
  ingredients: RecipeIngredient[];
  /** Cached per-serving totals; recomputed on every edit via recomputeRecipe(). */
  perServing: MacroTotals;
  /** "servings" (default, also for older recipes): logged as equal servings. "weight":
   * logged as grams of the cooked dish, per 100 g = whole recipe ÷ cookedWeightG. */
  portionMode?: RecipePortionMode;
  /** Grams of cooked food the recipe made (weigh the pot, minus the pot). Required for
   * "weight" mode; in "servings" mode it gives each serving its real weight. */
  cookedWeightG?: number;
  /** Day the current pot was cooked (YYYY-MM-DD), for "what's left in the pot". */
  cookedOn?: string;
  notes?: string;
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

export function recipeTotals(recipe: Pick<Recipe, "ingredients">): MacroTotals {
  return recipe.ingredients.reduce((acc, ing) => addMacros(acc, ing.computed), { ...ZERO_MACROS });
}

/** Other nutrients of the whole recipe, from the ingredients that know them. */
export function recipeNutrientTotals(recipe: Pick<Recipe, "ingredients">): Nutrients | undefined {
  return recipe.ingredients.reduce<Nutrients | undefined>((acc, ing) => addNutrients(acc, ing.nutrients), undefined);
}

/** Recompute perServing from ingredients + servings; call after any structural edit. */
export function recomputeRecipe(recipe: Recipe): Recipe {
  const total = recipeTotals(recipe);
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

function hasCookedWeight(recipe: Recipe): recipe is Recipe & { cookedWeightG: number } {
  return typeof recipe.cookedWeightG === "number" && recipe.cookedWeightG > 0;
}

export function isWeightRecipe(recipe: Recipe): boolean {
  return recipe.portionMode === "weight" && hasCookedWeight(recipe);
}

/** Macros per 100 g of the cooked dish, or null until the pot has been weighed. */
export function recipePer100gCooked(recipe: Recipe): MacroTotals | null {
  if (!hasCookedWeight(recipe)) return null;
  return roundMacros(scaleMacros(recipeTotals(recipe), (100 * 100) / recipe.cookedWeightG));
}

/** A recipe presented as a food so it can be searched and logged like one. Once the pot
 * has been weighed, grams are real grams of cooked food (servings are fractions of the
 * pot); before that, 1 serving is a notional 100 "grams". */
export function recipeAsFood(recipe: Recipe): FoodRef {
  const per100 = recipePer100gCooked(recipe);
  if (per100 && hasCookedWeight(recipe)) {
    const w = recipe.cookedWeightG;
    const n = Math.max(1, recipe.servings);
    const servings: ServingOption[] = [];
    if (n > 1) {
      const each = Math.round(w / n);
      servings.push({
        id: "serving",
        label: isWeightRecipe(recipe) ? `1/${n} of the pot (${each} g)` : `1 serving (${each} g)`,
        grams: w / n,
      });
    }
    servings.push({ id: "whole", label: `whole pot (${Math.round(w)} g)`, grams: w });
    const nutrients = roundNutrients(scaleNutrients(recipeNutrientTotals(recipe), (100 * 100) / w));
    return { id: recipe.id, source: "custom", name: recipe.name, per100g: per100, servings, ...(nutrients ? { nutrients } : {}) };
  }
  const perServing = roundNutrients(scaleNutrients(recipeNutrientTotals(recipe), 100 / Math.max(1, recipe.servings)));
  return {
    id: recipe.id,
    source: "custom",
    name: recipe.name,
    per100g: recipe.perServing, // 100 "grams" == 1 serving
    ...(perServing ? { nutrients: perServing } : {}),
    servings: [
      { id: "serving", label: "1 serving", grams: 100 },
      { id: "whole", label: `whole recipe (${recipe.servings})`, grams: 100 * recipe.servings },
    ],
  };
}

/** Whether amounts logged from this recipe are real grams (so plain g/oz units make sense). */
export function recipeHasRealGrams(recipe: Recipe): boolean {
  return hasCookedWeight(recipe);
}

/**
 * What's left of the current pot: its cooked weight minus the grams logged from this recipe
 * since it was cooked. Null when the pot was never weighed or has no cook date. Only counts
 * this person's diary, so a shared pot shows more left than there really is.
 */
export function potRemaining(
  recipe: Recipe,
  days: readonly DiaryDay[],
): { cookedOn: string; leftG: number; eatenG: number } | null {
  if (!hasCookedWeight(recipe) || !recipe.cookedOn) return null;
  let eaten = 0;
  for (const d of days) {
    if (d.deletedAtMs || d.dateIso < recipe.cookedOn) continue;
    for (const it of d.items) if (it.sourceId === recipe.id) eaten += it.grams;
  }
  return { cookedOn: recipe.cookedOn, eatenG: eaten, leftG: Math.max(0, recipe.cookedWeightG - eaten) };
}

// ── Ingredient lists ──────────────────────────────────────────────────────────

/** Unit words in pasted ingredient lists that aren't plain measures, with a typical weight. */
const COUNT_UNITS: Record<string, { label: string; grams: number | null }> = {
  tin: { label: "tin", grams: 400 },
  tins: { label: "tin", grams: 400 },
  can: { label: "tin", grams: 400 },
  cans: { label: "tin", grams: 400 },
  clove: { label: "clove", grams: 5 },
  cloves: { label: "clove", grams: 5 },
  cube: { label: "cube", grams: 10 },
  cubes: { label: "cube", grams: 10 },
  pinch: { label: "pinch", grams: 0.5 },
  handful: { label: "handful", grams: 30 },
  handfuls: { label: "handful", grams: 30 },
  slice: { label: "slice", grams: null },
  slices: { label: "slice", grams: null },
  pack: { label: "pack", grams: null },
  packs: { label: "pack", grams: null },
  pot: { label: "pot", grams: null },
  pots: { label: "pot", grams: null },
};

const UNIT_ALIASES: Record<string, MeasureUnit> = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", millilitre: "ml", milliliter: "ml", millilitres: "ml", milliliters: "ml",
  l: "l", litre: "l", liter: "l", litres: "l", liters: "l",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tbs: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  cup: "cup", cups: "cup",
};

export type ParsedIngredientLine = {
  /** The line as typed. */
  text: string;
  /** What to search for. */
  name: string;
  amount: number;
  /** A plain measure, when the line used one. */
  unit: MeasureUnit | null;
  /** A count word such as "tin" or "clove", when the line used one. */
  countUnit: string | null;
  /** Grams when the line says it outright (a measure, "2 x 400 g", a usual tin). Null =
   * a count of things ("3 eggs") whose weight comes from the matched food's servings. */
  grams: number | null;
};

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

function parseNumber(s: string): number | null {
  const t = s.trim();
  if (FRACTIONS[t] != null) return FRACTIONS[t];
  const mixed = /^(\d+)\s*([½¼¾⅓⅔])$/.exec(t);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]];
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads one line of an ingredient list: "500 g chicken breast", "2 tins chopped tomatoes",
 * "1½ tbsp olive oil", "2 x 400g tins kidney beans", "3 eggs", "Salt". Text after a "|"
 * (a category tag) or in brackets is ignored. Null for blank lines and headings.
 */
export function parseIngredientLine(line: string): ParsedIngredientLine | null {
  const text = line.trim();
  let rest = text
    .replace(/\|.*$/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/^[-*•\d]+[.)]\s+(?=\D)/, "") // list bullets / "1. " numbering
    .replace(/^[-*•]\s*/, "")
    .trim();
  if (!rest || /:$/.test(rest)) return null;

  let amount = 1;
  let unit: MeasureUnit | null = null;
  let countUnit: string | null = null;
  let grams: number | null = null;

  // "2 x 400g" / "2x400 g"
  const multi = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)\b\s*/.exec(rest);
  if (multi && UNIT_ALIASES[multi[3].toLowerCase()]) {
    const count = Number(multi[1].replace(",", "."));
    const each = Number(multi[2].replace(",", "."));
    unit = UNIT_ALIASES[multi[3].toLowerCase()];
    amount = count * each;
    rest = rest.slice(multi[0].length);
    const cu = /^([a-zA-Z]+)\b\s*/.exec(rest);
    if (cu && COUNT_UNITS[cu[1].toLowerCase()]) rest = rest.slice(cu[0].length);
  } else {
    const num = /^(\d+\s*[½¼¾⅓⅔]|[½¼¾⅓⅔]|\d+\/\d+|\d+(?:[.,]\d+)?)\s*/.exec(rest);
    if (num) {
      amount = parseNumber(num[1]) ?? 1;
      rest = rest.slice(num[0].length);
      const u = /^([a-zA-Z]+)\.?(?=\s|$)\s*/.exec(rest);
      const word = u?.[1].toLowerCase();
      if (u && word && UNIT_ALIASES[word]) {
        unit = UNIT_ALIASES[word];
        rest = rest.slice(u[0].length);
      } else if (u && word && COUNT_UNITS[word]) {
        countUnit = COUNT_UNITS[word].label;
        const each = COUNT_UNITS[word].grams;
        if (each != null) grams = amount * each;
        rest = rest.slice(u[0].length);
      }
    }
  }
  rest = rest.replace(/^of\s+/i, "").replace(/[,;].*$/, "").trim();
  if (!rest) return null;
  if (unit) grams = unitToGrams(amount, unit);
  return { text, name: rest, amount, unit, countUnit, grams };
}

export function parseIngredientList(text: string): ParsedIngredientLine[] {
  return text
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter((x): x is ParsedIngredientLine => x !== null);
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
