import { createId } from "./ids";
import { nowMs } from "./time";
import {
  addMacros,
  roundMacros,
  ZERO_MACROS,
  type LoggedItem,
  type MacroTotals,
  type MealSlot,
  type Recipe,
} from "./nutrition";
import type { NutrientId, Nutrients } from "./nutrients";

// A nutrition target set a coach assigns to one client. The mirror image of the coach-read
// path (SyncEndpoints / CoachProgram): the coach owns and writes this row, the client pulls
// it read-only via GET /coach/nutrition-plans/assigned. It never touches the client's
// Synced* rows.
//
// The daily numbers (kcalTarget + macros + note) are always present; a structured
// meal-by-meal plan (meals → foods, with coach-approved swaps) is optional.

/** One food the coach has prescribed, at a fixed amount. */
export type PlannedFood = {
  id: string;
  name: string;
  brand?: string;
  /** Grams (or ml) of this food. */
  grams: number;
  /** Human portion for display, e.g. "1 scoop (30 g)". */
  servingLabel?: string;
  /** Macros for `grams` of this food. */
  computed: MacroTotals;
  /** Coach-approved alternatives the client may log instead. */
  swaps?: PlannedFood[];
  /** One of the coach's recipes (canvas MP2 "Your recipe"): a copy as it was when added, so
   * the client sees the ingredients and method. `grams`/`computed` are for the servings used. */
  recipe?: Pick<Recipe, "id" | "name" | "servings" | "ingredients" | "perServing" | "notes">;
  /** Servings of the recipe (recipe foods only). */
  servingsUsed?: number;
  /** Other nutrients for `grams`, when known. */
  nutrients?: Nutrients;
};

/** When a meal is (canvas Q5): a clock time, or relative to that day's training session. */
export type MealTime =
  | { kind: "clock"; at: string }
  | { kind: "before-training"; minutes: number }
  | { kind: "after-training"; withinMinutes: number };

export type PlannedMeal = {
  id: string;
  name: string;
  foods: PlannedFood[];
  /** Unset: no set time. */
  time?: MealTime;
};

/** A target beyond calories and the macros (canvas NT1): fibre, salt, iron… */
export type NutrientTarget = { id: NutrientId; kind: "atLeast" | "atMost" | "about"; amount: number };

/** A kind of day with its own targets and meals (canvas MP2): training, rest, high carb… */
export type PlanDayType = {
  id: string;
  name: string;
  /** "training-rest" plans: which of the two this is. */
  role?: "training" | "rest";
  /** "own" plans: the weekdays it's for (0 = Sunday). A weekday belongs to one type. */
  weekdays?: number[];
  kcalTarget: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  meals: PlannedMeal[];
};

export type CoachNutritionPlan = {
  id: string;
  name: string;
  /** Daily calorie target the coach wants the client to hit. */
  kcalTarget: number;
  /** Absolute macro targets in grams. Any omitted macro is left to the client's own split. */
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  /** Free-text guidance shown to the client. */
  note?: string;
  /** Optional structured plan. When present, the client sees the meals with a "Log" (and,
   * where swaps exist, "Swap") action per food, plus a grocery list. */
  meals?: PlannedMeal[];
  // ── Meal plans v2 (canvas MP2, NT1, Q5, FX1). All optional: an older phone reads the
  // numbers and meals above, which mirror the training day (or the first day type).
  /** "same" (default): one set of meals and targets. "training-rest": two day types, by
   * whether the day has training. "own": the coach's day types, by weekday. */
  mode?: "same" | "training-rest" | "own";
  dayTypes?: PlanDayType[];
  /** Targets beyond calories and the macros, the same every day. */
  nutrients?: NutrientTarget[];
  /** "adaptive": calories follow the client's own Adaptive targets (aimed at their goal
   * pace), with each day type's difference from the plan's calories kept. */
  kcalMode?: "fixed" | "adaptive";
  /** On a rest day, "before/after training" meals are at this time (default 16:30). */
  restDayClock?: string;
  /** A client's plan: the first day it applies (YYYY-MM-DD, their local date). Unset on older
   * plans: from when it was made. */
  fromIso?: string;
  /** A replaced or stopped plan: the day it stopped applying (exclusive). Past days before it
   * keep being measured against this plan. */
  untilIso?: string;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export function createCoachNutritionPlan(name = "Nutrition plan"): CoachNutritionPlan {
  const now = nowMs();
  return {
    id: createId("cnplan"),
    name: name.trim() || "Nutrition plan",
    kcalTarget: 2000,
    proteinG: 150,
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function touchCoachNutritionPlan(plan: CoachNutritionPlan): CoachNutritionPlan {
  return { ...plan, updatedAtMs: nowMs() };
}

export function updateCoachNutritionPlan(
  plan: CoachNutritionPlan,
  patch: Partial<Omit<CoachNutritionPlan, "id" | "createdAtMs" | "updatedAtMs">>,
): CoachNutritionPlan {
  return touchCoachNutritionPlan({ ...plan, ...patch });
}

/** The plan's targets as MacroTotals, filling unset macros with 0 (the UI shows "—"). */
export function planMacros(plan: CoachNutritionPlan): MacroTotals {
  return {
    kcal: plan.kcalTarget,
    proteinG: plan.proteinG ?? 0,
    carbsG: plan.carbsG ?? 0,
    fatG: plan.fatG ?? 0,
  };
}

// ── Structured meal plan ─────────────────────────────────────────────────────

export function createPlannedMeal(name = "Meal"): PlannedMeal {
  return { id: createId("pmeal"), name: name.trim() || "Meal", foods: [] };
}

export function addMeal(plan: CoachNutritionPlan, name?: string): CoachNutritionPlan {
  return touchCoachNutritionPlan({
    ...plan,
    meals: [...(plan.meals ?? []), createPlannedMeal(name)],
  });
}

export function removeMeal(plan: CoachNutritionPlan, mealId: string): CoachNutritionPlan {
  return touchCoachNutritionPlan({
    ...plan,
    meals: (plan.meals ?? []).filter((m) => m.id !== mealId),
  });
}

export function updateMeal(
  plan: CoachNutritionPlan,
  mealId: string,
  fn: (meal: PlannedMeal) => PlannedMeal,
): CoachNutritionPlan {
  return touchCoachNutritionPlan({
    ...plan,
    meals: (plan.meals ?? []).map((m) => (m.id === mealId ? fn(m) : m)),
  });
}

export function addPlannedFood(meal: PlannedMeal, food: Omit<PlannedFood, "id">): PlannedMeal {
  return { ...meal, foods: [...meal.foods, { ...food, id: createId("pfood") }] };
}

export function removePlannedFood(meal: PlannedMeal, foodId: string): PlannedMeal {
  return { ...meal, foods: meal.foods.filter((f) => f.id !== foodId) };
}

export function mealTotals(meal: PlannedMeal): MacroTotals {
  return roundMacros(
    meal.foods.reduce((acc, f) => addMacros(acc, f.computed), { ...ZERO_MACROS }),
  );
}

export function planTotals(plan: CoachNutritionPlan): MacroTotals {
  return roundMacros(
    (plan.meals ?? []).reduce((acc, m) => addMacros(acc, mealTotals(m)), { ...ZERO_MACROS }),
  );
}

/** Best-guess diary slot for a planned meal, from its name. */
export function slotForMeal(meal: PlannedMeal): MealSlot {
  const n = meal.name.toLowerCase();
  if (n.includes("breakfast") || n.includes("morning")) return "breakfast";
  if (n.includes("lunch") || n.includes("midday")) return "lunch";
  if (n.includes("dinner") || n.includes("evening")) return "dinner";
  return "snack";
}

/** Turn a coach-prescribed food into a diary item the client can log verbatim. */
export function plannedFoodToLoggedItem(
  food: PlannedFood,
  meal: MealSlot,
): Omit<LoggedItem, "id"> {
  return {
    meal,
    name: food.name,
    brand: food.brand,
    grams: food.grams,
    servingLabel: food.servingLabel,
    computed: food.computed,
  };
}

/** Flat, de-duplicated shopping list (by name+brand), grams summed across meals. */
export function groceryList(plan: CoachNutritionPlan): { name: string; brand?: string; grams: number }[] {
  const byKey = new Map<string, { name: string; brand?: string; grams: number }>();
  for (const meal of plan.meals ?? []) {
    for (const f of meal.foods) {
      const key = `${f.name}::${f.brand ?? ""}`.toLowerCase();
      const cur = byKey.get(key);
      if (cur) cur.grams += f.grams;
      else byKey.set(key, { name: f.name, brand: f.brand, grams: f.grams });
    }
  }
  return [...byKey.values()].map((x) => ({ ...x, grams: Math.round(x.grams) }));
}


// ── Meal plans v2: which plan and which day type applied on a day ─────────────

const isoOfMs = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const planFromIso = (p: CoachNutritionPlan) => p.fromIso ?? isoOfMs(p.createdAtMs);

/** The plan that applied on a day (canvas FX1): the latest to start on or before it that
 * hadn't stopped. A plan archived without an end date is gone (how plans ended before v2). */
export function planOn(plans: CoachNutritionPlan[], dateIso: string): CoachNutritionPlan | null {
  const live = plans.filter((p) => planFromIso(p) <= dateIso && (p.untilIso ? dateIso < p.untilIso : !p.archived));
  live.sort((a, b) => planFromIso(b).localeCompare(planFromIso(a)) || b.updatedAtMs - a.updatedAtMs);
  return live[0] ?? null;
}

/** Stop a plan from a day: days before it keep being measured against it. */
export function endPlan(plan: CoachNutritionPlan, untilIso: string): CoachNutritionPlan {
  return touchCoachNutritionPlan({ ...plan, archived: true, untilIso });
}

const weekdayOf = (dateIso: string) => new Date(`${dateIso}T12:00:00`).getDay();

/** A plan's day as one day type: its targets and meals for that day. */
export type PlanDay = Omit<PlanDayType, "role" | "weekdays">;

/** Which day type a day is (canvas MP2): by training for "training-rest", by weekday for
 * "own", else the plan's one set of targets and meals. */
export function planDay(plan: CoachNutritionPlan, dateIso: string, trainingDay: boolean): PlanDay {
  const base: PlanDay = { id: "day", name: plan.name, kcalTarget: plan.kcalTarget, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG, meals: plan.meals ?? [] };
  const types = plan.dayTypes ?? [];
  if (!types.length || !plan.mode || plan.mode === "same") return base;
  const found = plan.mode === "training-rest"
    ? types.find((d) => d.role === (trainingDay ? "training" : "rest"))
    : types.find((d) => d.weekdays?.includes(weekdayOf(dateIso)));
  const { role: _r, weekdays: _w, ...day } = found ?? types[0]!;
  return day;
}

/** Copies the first (training) day type into the plan's own numbers and meals, so a phone from
 * before day types still shows a sensible plan. Call before saving. */
export function withPlanFallback(plan: CoachNutritionPlan): CoachNutritionPlan {
  const types = plan.dayTypes ?? [];
  if (!types.length || !plan.mode || plan.mode === "same") return plan;
  const main = types.find((d) => d.role === "training") ?? types[0]!;
  return { ...plan, kcalTarget: main.kcalTarget, proteinG: main.proteinG, carbsG: main.carbsG, fatG: main.fatG, meals: main.meals };
}

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const toClock = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** When a meal is on a day, "HH:MM" (canvas Q5). "Before/after training" follows that day's
 * session time; on a day without one, the plan's rest-day time (default 16:30). Null: no set time. */
export function mealClock(meal: PlannedMeal, sessionTime: string | null, restDayClock = "16:30"): string | null {
  const t = meal.time;
  if (!t) return null;
  if (t.kind === "clock") return toMin(t.at) == null ? null : toClock(toMin(t.at)!);
  const anchor = toMin(sessionTime ?? "") ?? toMin(restDayClock) ?? 16 * 60 + 30;
  return t.kind === "before-training" ? toClock(anchor - t.minutes) : toClock(anchor + 60);
}

/** A meal's time in words: "07:30", "90 min before training", "within 1 h after training". */
export function mealTimeLabel(time: MealTime | undefined): string {
  if (!time) return "No set time";
  if (time.kind === "clock") return time.at;
  if (time.kind === "before-training") return `${time.minutes} min before training`;
  return time.withinMinutes % 60 === 0 ? `within ${time.withinMinutes / 60} h after training` : `within ${time.withinMinutes} min after training`;
}

/** One of the coach's recipes in a meal (canvas MP2 "Your recipe"): a copy of it as it is now,
 * at `servings` servings, so the client sees the ingredients and the plan's numbers don't move
 * if the coach edits the recipe later. */
export function plannedFoodFromRecipe(recipe: Recipe, servings = 1): Omit<PlannedFood, "id"> {
  const n = Math.max(0.25, servings);
  const scale = (m: MacroTotals): MacroTotals => roundMacros({ kcal: m.kcal * n, proteinG: m.proteinG * n, carbsG: m.carbsG * n, fatG: m.fatG * n });
  const grams = recipe.cookedWeightG ? (recipe.cookedWeightG / Math.max(1, recipe.servings)) * n : recipe.ingredients.reduce((g, i) => g + i.grams, 0) / Math.max(1, recipe.servings) * n;
  return {
    name: recipe.name,
    grams: Math.round(grams),
    servingLabel: `${n === 1 ? "1 serving" : `${n} servings`}`,
    computed: scale(recipe.perServing),
    recipe: { id: recipe.id, name: recipe.name, servings: recipe.servings, ingredients: recipe.ingredients, perServing: recipe.perServing, ...(recipe.notes ? { notes: recipe.notes } : {}) },
    servingsUsed: n,
  };
}
