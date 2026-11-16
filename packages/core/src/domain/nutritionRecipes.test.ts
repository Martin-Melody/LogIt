import { describe, expect, it } from "vitest";
import {
  createDiaryDay,
  createRecipe,
  parseIngredientLine,
  parseIngredientList,
  potRemaining,
  recipeAsFood,
  recipePer100gCooked,
  recomputeRecipe,
  type DiaryDay,
  type Recipe,
} from "./nutrition";

function chilli(extra: Partial<Recipe> = {}): Recipe {
  const r = createRecipe("Chilli", 10);
  r.ingredients = [
    { id: "i1", name: "Mince", grams: 1500, computed: { kcal: 1875, proteinG: 322, carbsG: 0, fatG: 75 } },
    { id: "i2", name: "Tomatoes", grams: 1200, computed: { kcal: 1025, proteinG: 52, carbsG: 220, fatG: 10 } },
  ];
  return recomputeRecipe({ ...r, ...extra });
}

describe("recipeAsFood", () => {
  it("keeps the notional 100-unit serving until the pot is weighed", () => {
    const f = recipeAsFood(chilli());
    expect(f.per100g.kcal).toBe(290);
    expect(f.servings[0]).toEqual({ id: "serving", label: "1 serving", grams: 100 });
  });

  it("uses real grams of cooked food once weighed (weight mode)", () => {
    const r = chilli({ portionMode: "weight", cookedWeightG: 2900 });
    expect(recipePer100gCooked(r)?.kcal).toBe(100);
    const f = recipeAsFood(r);
    expect(f.per100g.kcal).toBe(100);
    expect(f.servings.map((s) => s.label)).toEqual(["1/10 of the pot (290 g)", "whole pot (2900 g)"]);
  });

  it("gives servings their real weight in servings mode when weighed", () => {
    const f = recipeAsFood(chilli({ portionMode: "servings", cookedWeightG: 2900 }));
    expect(f.servings[0].label).toBe("1 serving (290 g)");
    expect(f.servings[0].grams).toBe(290);
  });
});

describe("potRemaining", () => {
  function day(dateIso: string, grams: number[], sourceId = "x"): DiaryDay {
    const d = createDiaryDay(dateIso);
    d.items = grams.map((g, i) => ({
      id: `${dateIso}-${i}`,
      meal: "lunch",
      sourceId,
      name: "Chilli",
      grams: g,
      computed: { kcal: g, proteinG: 0, carbsG: 0, fatG: 0 },
    }));
    return d;
  }

  it("subtracts what was logged since the pot was cooked", () => {
    const r = chilli({ portionMode: "weight", cookedWeightG: 2900, cookedOn: "2026-11-15" });
    const days = [day("2026-11-14", [400], r.id), day("2026-11-15", [420, 380], r.id), day("2026-11-16", [458], r.id), day("2026-11-16", [999])];
    expect(potRemaining(r, days)).toEqual({ cookedOn: "2026-11-15", eatenG: 1258, leftG: 1642 });
  });

  it("is null until the pot has a weight and a date", () => {
    expect(potRemaining(chilli({ cookedWeightG: 2900 }), [])).toBeNull();
    expect(potRemaining(chilli({ cookedOn: "2026-11-15" }), [])).toBeNull();
  });
});

describe("parseIngredientLine", () => {
  it("reads measures", () => {
    expect(parseIngredientLine("500 g chicken breast")).toMatchObject({ name: "chicken breast", amount: 500, unit: "g", grams: 500 });
    expect(parseIngredientLine("1.5kg beef mince (5% fat)")).toMatchObject({ name: "beef mince", unit: "kg", grams: 1500 });
    expect(parseIngredientLine("1½ tbsp olive oil")).toMatchObject({ name: "olive oil", amount: 1.5, unit: "tbsp", grams: 22.5 });
    expect(parseIngredientLine("1/2 cup of milk")).toMatchObject({ name: "milk", amount: 0.5, unit: "cup", grams: 120 });
  });

  it("reads counts and tins", () => {
    expect(parseIngredientLine("3 eggs")).toMatchObject({ name: "eggs", amount: 3, unit: null, countUnit: null, grams: null });
    expect(parseIngredientLine("2 tins chopped tomatoes")).toMatchObject({ name: "chopped tomatoes", amount: 2, countUnit: "tin", grams: 800 });
    expect(parseIngredientLine("2 x 400g tins kidney beans")).toMatchObject({ name: "kidney beans", unit: "g", grams: 800 });
    expect(parseIngredientLine("4 cloves garlic, crushed")).toMatchObject({ name: "garlic", countUnit: "clove", grams: 20 });
  });

  it("copes with list formatting", () => {
    expect(parseIngredientLine("- 200 g rice | carbs")).toMatchObject({ name: "rice", grams: 200 });
    expect(parseIngredientLine("Salt")).toMatchObject({ name: "Salt", amount: 1, grams: null });
    expect(parseIngredientLine("Ingredients:")).toBeNull();
    expect(parseIngredientLine("   ")).toBeNull();
  });

  it("splits a pasted list", () => {
    expect(parseIngredientList("500 g mince\n\nSauce:\n1 tin tomatoes").map((l) => l.name)).toEqual(["mince", "tomatoes"]);
  });
});
