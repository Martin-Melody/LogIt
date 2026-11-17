import { describe, expect, it } from "vitest";
import {
  addNutrients,
  cleanNutrients,
  createCustomFood,
  createRecipe,
  dayNutrients,
  formatNutrient,
  hasMicros,
  loggedItemFromFood,
  mealTemplateFromDay,
  mealTemplateToItems,
  percentOfDaily,
  recentFoodsFromDays,
  loggedItemFromRecent,
  recipeAsFood,
  scaleNutrients,
  updateCustomFood,
  type DiaryDay,
  type FoodRef,
} from "./nutrition";

const oats: FoodRef = {
  id: "usda:1",
  source: "usda",
  name: "Rolled oats",
  per100g: { kcal: 375, proteinG: 13.2, carbsG: 66, fatG: 6.9 },
  nutrients: { fibreG: 10, ironMg: 4.7, thiaminMg: 0.46 },
  servings: [],
};
const yoghurt: FoodRef = {
  id: "off:2",
  source: "off",
  name: "Protein yoghurt",
  per100g: { kcal: 60, proteinG: 10, carbsG: 3.5, fatG: 0.2 },
  nutrients: { sugarG: 3.5, saltG: 0.1 },
  servings: [],
};

describe("nutrients", () => {
  it("scales and adds, keeping unknown apart from zero", () => {
    expect(scaleNutrients({ fibreG: 10, ironMg: 4 }, 50)).toEqual({ fibreG: 5, ironMg: 2 });
    expect(addNutrients({ fibreG: 1 }, { ironMg: 2 })).toEqual({ fibreG: 1, ironMg: 2 });
    expect(addNutrients(undefined, undefined)).toBeUndefined();
    expect(hasMicros({ fibreG: 3, saltG: 1 })).toBe(false);
    expect(hasMicros({ ironMg: 1 })).toBe(true);
  });

  it("drops unknown ids and bad numbers", () => {
    expect(cleanNutrients({ fibreG: 2, bogus: 4, ironMg: -1, zincMg: Number.NaN })).toEqual({ fibreG: 2 });
    expect(cleanNutrients({})).toBeUndefined();
  });

  it("formats amounts and shares of the daily amount", () => {
    expect(formatNutrient("ironMg", 3.76)).toBe("3.8 mg");
    expect(formatNutrient("potassiumMg", 2450)).toBe("2,450 mg");
    expect(formatNutrient("thiaminMg", 0.374)).toBe("0.37 mg");
    expect(formatNutrient("satFatG", 0.96)).toBe("1 g");
    expect(formatNutrient("fibreG", 8.24)).toBe("8.2 g");
    expect(formatNutrient("saltG", 0.25)).toBe("0.25 g");
    expect(percentOfDaily("ironMg", 7)).toBe(50);
    expect(percentOfDaily("sugarG", 30)).toBeNull();
  });

  it("logs a food's nutrients for the amount eaten", () => {
    const item = loggedItemFromFood(oats, "breakfast", 80);
    expect(item.nutrients).toEqual({ fibreG: 8, ironMg: 3.76, thiaminMg: 0.368 });
    const plain = loggedItemFromFood({ ...oats, nutrients: undefined }, "breakfast", 80);
    expect("nutrients" in plain).toBe(false);
  });

  it("carries them through meals, recents and re-logging", () => {
    const day: DiaryDay = {
      id: "d", dateIso: "2026-11-16", createdAtMs: 0, updatedAtMs: 0,
      items: [{ id: "i1", ...loggedItemFromFood(oats, "breakfast", 80) }],
    };
    const tpl = mealTemplateFromDay(day, "breakfast", "Oats");
    expect(mealTemplateToItems(tpl, "lunch")[0].nutrients?.fibreG).toBe(8);
    const [recent] = recentFoodsFromDays([day]);
    expect(loggedItemFromRecent(recent, "snack").nutrients?.ironMg).toBe(3.76);
  });

  it("works a recipe's nutrients out from its ingredients", () => {
    const r = {
      ...createRecipe("Porridge", 2),
      ingredients: [
        { id: "a", name: "Oats", grams: 100, computed: oats.per100g, nutrients: { fibreG: 10, ironMg: 4.7 } },
        { id: "b", name: "Water", grams: 300, computed: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } },
      ],
    };
    expect(recipeAsFood(r).nutrients).toEqual({ fibreG: 5, ironMg: 2.35 }); // per serving
    expect(recipeAsFood({ ...r, cookedWeightG: 400 }).nutrients).toEqual({ fibreG: 2.5, ironMg: 1.18 }); // per 100 g cooked
  });

  it("adds up a day and says how much of it has vitamin data", () => {
    const items = [
      { ...loggedItemFromFood(oats, "breakfast", 100), id: "1" },
      { ...loggedItemFromFood(yoghurt, "breakfast", 200), id: "2" },
      { ...loggedItemFromFood(oats, "snack", 50), id: "3" },
    ];
    const d = dayNutrients(items);
    expect(d.totals.fibreG).toBe(15);
    expect(d.totals.sugarG).toBe(7);
    expect(d.sources.ironMg).toEqual([{ name: "Rolled oats", amount: 4.7 + 2.35 }]);
    expect(d.coverage).toEqual({ items: 3, withMicros: 2, kcal: 375 + 120 + 188, kcalWithMicros: 375 + 188 });
    expect(d.missingMicros).toEqual(["Protein yoghurt"]);
  });

  it("custom foods keep, replace and clear their nutrients", () => {
    const f = createCustomFood({ name: "Granola", per100g: oats.per100g, nutrients: { fibreG: 8, saltG: 0.3 } });
    expect(f.food.nutrients).toEqual({ fibreG: 8, saltG: 0.3 });
    expect(updateCustomFood(f, { name: "Granola 2" }).food.nutrients).toEqual({ fibreG: 8, saltG: 0.3 });
    expect(updateCustomFood(f, { nutrients: { ironMg: 2 } }).food.nutrients).toEqual({ ironMg: 2 });
    expect("nutrients" in updateCustomFood(f, { nutrients: null }).food).toBe(false);
  });
});
