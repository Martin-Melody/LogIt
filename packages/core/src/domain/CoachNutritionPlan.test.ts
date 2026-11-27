import { describe, expect, it } from "vitest";
import {
  addMeal,
  addPlannedFood,
  createCoachNutritionPlan,
  groceryList,
  mealTotals,
  planMacros,
  planTotals,
  plannedFoodToLoggedItem,
  slotForMeal,
  updateMeal,
  type PlannedFood,
} from "./CoachNutritionPlan";
import { plannedFoodFromRecipe, mealPlanSummary, recipeUse } from "./CoachNutritionPlan";
import { createRecipe as createRecipeV2 } from "./nutrition";
import { mealClock, mealTimeLabel, planDay, withPlanFallback, createCoachNutritionPlan as createPlanV2, type PlannedMeal as PlannedMealV2 } from "./CoachNutritionPlan";

const food = (name: string, kcal: number, grams = 100): Omit<PlannedFood, "id"> => ({
  name,
  grams,
  computed: { kcal, proteinG: kcal / 40, carbsG: kcal / 20, fatG: kcal / 90 },
});

describe("CoachNutritionPlan", () => {
  it("planMacros fills unset macros with 0", () => {
    const p = createCoachNutritionPlan();
    p.kcalTarget = 2000;
    p.proteinG = 160;
    expect(planMacros(p)).toEqual({ kcal: 2000, proteinG: 160, carbsG: 0, fatG: 0 });
  });

  it("builds meals, totals and a grocery list", () => {
    let p = createCoachNutritionPlan("Cut");
    p = addMeal(p, "Breakfast");
    p = addMeal(p, "Dinner");
    const [bId, dId] = p.meals!.map((m) => m.id);
    p = updateMeal(p, bId, (m) => addPlannedFood(m, food("Oats", 350)));
    p = updateMeal(p, bId, (m) => addPlannedFood(m, food("Oats", 350))); // same food again
    p = updateMeal(p, dId, (m) => addPlannedFood(m, food("Chicken", 300)));

    expect(mealTotals(p.meals![0]).kcal).toBe(700);
    expect(planTotals(p).kcal).toBe(1000);

    const grocery = groceryList(p);
    expect(grocery).toContainEqual({ name: "Oats", brand: undefined, grams: 200 }); // summed
    expect(grocery).toContainEqual({ name: "Chicken", brand: undefined, grams: 100 });
  });

  it("slotForMeal maps names to diary slots", () => {
    expect(slotForMeal({ id: "x", name: "Breakfast", foods: [] })).toBe("breakfast");
    expect(slotForMeal({ id: "x", name: "Post-workout", foods: [] })).toBe("snack");
  });

  it("plannedFoodToLoggedItem carries name/grams/macros verbatim", () => {
    const f: PlannedFood = { id: "p1", ...food("Skyr", 120, 150) };
    const item = plannedFoodToLoggedItem(f, "snack");
    expect(item.name).toBe("Skyr");
    expect(item.grams).toBe(150);
    expect(item.computed.kcal).toBe(120);
    expect(item.meal).toBe("snack");
  });
});

describe("meal plans v2: days and times (canvas MP2, Q5)", () => {
  const meal = (time?: PlannedMealV2["time"]): PlannedMealV2 => ({ id: "m", name: "Before training", foods: [], ...(time ? { time } : {}) });
  it("a meal's time follows that day's session, or the rest-day time", () => {
    expect(mealClock(meal({ kind: "clock", at: "7:30" }), null)).toBe("07:30");
    expect(mealClock(meal({ kind: "before-training", minutes: 90 }), "18:00")).toBe("16:30");
    expect(mealClock(meal({ kind: "before-training", minutes: 90 }), null)).toBe("15:00");
    expect(mealClock(meal({ kind: "after-training", withinMinutes: 60 }), "07:00")).toBe("08:00");
    expect(mealClock(meal(), "07:00")).toBeNull();
    expect(mealTimeLabel({ kind: "after-training", withinMinutes: 60 })).toBe("within 1 h after training");
  });

  it("own day types go by weekday; an older phone sees the training day", () => {
    const p = { ...createPlanV2("Carb cycling"), mode: "own", dayTypes: [
      { id: "h", name: "High carb", weekdays: [2, 4], kcalTarget: 2600, carbsG: 320, meals: [] },
      { id: "l", name: "Low carb", weekdays: [0, 1, 3, 5, 6], kcalTarget: 2000, carbsG: 150, meals: [] },
    ] } as ReturnType<typeof createPlanV2>;
    expect(planDay(p, "2026-06-16", false).name).toBe("High carb"); // a Tuesday
    expect(planDay(p, "2026-06-17", true).name).toBe("Low carb");
    expect(withPlanFallback(p).kcalTarget).toBe(2600);
  });
});

describe("coach recipes in a meal plan (canvas MP2)", () => {
  it("a recipe becomes a planned food at the servings used, with its ingredients", () => {
    const r = { ...createRecipeV2("Overnight oats", 2), ingredients: [
      { id: "i1", name: "Oats", grams: 80, computed: { kcal: 300, proteinG: 10, carbsG: 50, fatG: 6 } },
      { id: "i2", name: "Soy milk", grams: 300, computed: { kcal: 120, proteinG: 9, carbsG: 6, fatG: 6 } },
    ], perServing: { kcal: 210, proteinG: 9.5, carbsG: 28, fatG: 6 } };
    const f = plannedFoodFromRecipe(r, 1);
    expect(f.computed.kcal).toBe(210);
    expect(f.grams).toBe(190);
    expect(f.recipe?.ingredients).toHaveLength(2);
    expect(plannedFoodFromRecipe(r, 2).computed.proteinG).toBe(19);
  });
});

describe("Nutrition › Meal plans and Recipes (canvas MP1, MP3)", () => {
  it("one line per plan, and where a recipe is used", () => {
    const targetsOnly = { ...createPlanV2("Targets only"), kcalTarget: 2200, proteinG: 150, kcalMode: "adaptive" as const };
    expect(mealPlanSummary(targetsOnly)).toBe("Calories and protein, no meals · Adaptive targets");
    const oats = { id: "r1", name: "Oats", servings: 1, ingredients: [], perServing: { kcal: 430, proteinG: 28, carbsG: 50, fatG: 10 } };
    const meal = { id: "m", name: "Breakfast", foods: [{ id: "f", name: "Oats", grams: 300, computed: oats.perServing, recipe: oats }] };
    const tr = { ...createPlanV2("Fat loss"), mode: "training-rest" as const, kcalMode: "adaptive" as const, dayTypes: [
      { id: "t", name: "Training day", role: "training" as const, kcalTarget: 2100, meals: [meal, { ...meal, id: "m2" }] },
      { id: "r", name: "Rest day", role: "rest" as const, kcalTarget: 1850, meals: [meal] },
    ] };
    expect(mealPlanSummary(tr)).toBe("Training day 2,100 kcal · rest day 1,850 · 2 meals · Adaptive targets");
    expect(recipeUse("r1", [tr, targetsOnly])).toEqual({ plans: 1, swapOnly: false });
  });
});
