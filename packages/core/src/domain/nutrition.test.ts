import { describe, expect, it } from "vitest";
import {
  addDiaryItem,
  createDiaryDay,
  createRecipe,
  dayTotals,
  kcalFromMacros,
  loggedItemFromFood,
  mealTotals,
  recipeAsFood,
  recomputeRecipe,
  removeDiaryItem,
  scaleMacros,
  type FoodRef,
  type Recipe,
} from "./nutrition";

const chicken: FoodRef = {
  id: "food_chicken",
  source: "usda",
  name: "Chicken breast, raw",
  per100g: { kcal: 120, proteinG: 22.5, carbsG: 0, fatG: 2.6 },
  servings: [{ id: "g", label: "100 g", grams: 100 }],
};

describe("macro helpers", () => {
  it("scaleMacros scales linearly by grams", () => {
    const m = scaleMacros(chicken.per100g, 150);
    expect(m.kcal).toBeCloseTo(180, 5);
    expect(m.proteinG).toBeCloseTo(33.75, 5);
  });

  it("kcalFromMacros uses 4/4/9", () => {
    expect(kcalFromMacros(20, 30, 10)).toBe(20 * 4 + 30 * 4 + 10 * 9);
  });
});

describe("diary day", () => {
  it("adds, totals by meal and by day, and removes items", () => {
    let day = createDiaryDay("2026-01-15");
    day = addDiaryItem(day, loggedItemFromFood(chicken, "lunch", 200));
    day = addDiaryItem(day, loggedItemFromFood(chicken, "dinner", 150));

    expect(day.items).toHaveLength(2);
    expect(mealTotals(day, "lunch").kcal).toBe(240);
    expect(dayTotals(day).kcal).toBe(240 + 180);

    day = removeDiaryItem(day, day.items[0]!.id);
    expect(day.items).toHaveLength(1);
    expect(dayTotals(day).kcal).toBe(180);
  });

  it("stamps a fresh updatedAtMs on mutation", () => {
    const day = createDiaryDay("2026-01-15");
    const next = addDiaryItem(day, loggedItemFromFood(chicken, "lunch", 100));
    expect(next.updatedAtMs).toBeGreaterThanOrEqual(day.updatedAtMs);
  });
});

describe("recipes", () => {
  function twoIngredientRecipe(): Recipe {
    let r = createRecipe("Chicken & rice", 2);
    r.ingredients = [
      { id: "i1", name: "Chicken", grams: 300, computed: scaleMacros(chicken.per100g, 300) },
      {
        id: "i2",
        name: "Rice, cooked",
        grams: 400,
        computed: scaleMacros({ kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 }, 400),
      },
    ];
    return recomputeRecipe(r);
  }

  it("recomputes per-serving totals across ingredients / servings", () => {
    const r = twoIngredientRecipe();
    // chicken 300g = 360 kcal; rice 400g = 520 kcal; total 880 / 2 servings = 440
    expect(r.perServing.kcal).toBe(440);
  });

  it("exposes a recipe as a loggable food (1 serving == 100 units)", () => {
    const food = recipeAsFood(twoIngredientRecipe());
    expect(food.per100g.kcal).toBe(440);
    expect(food.servings.map((s) => s.id)).toEqual(["serving", "whole"]);
    expect(food.servings[1]!.grams).toBe(200); // whole recipe == 2 servings
  });
});
