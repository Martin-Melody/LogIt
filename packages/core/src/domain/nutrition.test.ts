import { describe, expect, it } from "vitest";
import {
  addDiaryItem,
  createDiaryDay,
  createFavoriteFood,
  createRecipe,
  dayTotals,
  favoriteFoodId,
  kcalFromMacros,
  createMealTemplate,
  loggedItemFromFood,
  loggedItemFromRecent,
  mealTemplateFromDay,
  mealTemplateToItems,
  mealTemplateTotals,
  mealTotals,
  moveDiaryItem,
  recentFoodsFromDays,
  setDiaryItems,
  recipeAsFood,
  recomputeRecipe,
  removeDiaryItem,
  scaleMacros,
  unitToGrams,
  isMeasureUnit,
  tombstoneFavorite,
  type DiaryDay,
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

  it("unitToGrams converts g/ml/oz", () => {
    expect(unitToGrams(64.5, "g")).toBe(64.5);
    expect(unitToGrams(250, "ml")).toBe(250);
    expect(unitToGrams(1, "oz")).toBeCloseTo(28.3495, 3);
    expect(isMeasureUnit("oz")).toBe(true);
    expect(isMeasureUnit("cup")).toBe(false);
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

  it("moves an item between meals and replaces items wholesale", () => {
    let day = createDiaryDay("2026-01-15");
    day = addDiaryItem(day, loggedItemFromFood(chicken, "lunch", 100));
    const id = day.items[0]!.id;

    day = moveDiaryItem(day, id, "dinner");
    expect(mealTotals(day, "lunch").kcal).toBe(0);
    expect(mealTotals(day, "dinner").kcal).toBe(120);

    const reordered = [...day.items].reverse();
    day = setDiaryItems(day, reordered);
    expect(day.items).toEqual(reordered);
    expect(dayTotals(day).kcal).toBe(120);
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

describe("meal templates", () => {
  it("snapshots a meal from a day and expands it back into a chosen meal", () => {
    let day = createDiaryDay("2026-02-01");
    day = addDiaryItem(day, loggedItemFromFood(chicken, "lunch", 200));
    day = addDiaryItem(day, {
      meal: "lunch",
      name: "Rice, cooked",
      grams: 150,
      computed: { kcal: 195, proteinG: 4, carbsG: 42, fatG: 0.5 },
    });
    day = addDiaryItem(day, loggedItemFromFood(chicken, "dinner", 100));

    const t = mealTemplateFromDay(day, "lunch", "  Work lunch  ");
    expect(t.name).toBe("Work lunch");
    expect(t.items.map((i) => i.name)).toEqual(["Chicken breast, raw", "Rice, cooked"]);
    expect(mealTemplateTotals(t).kcal).toBe(chicken.per100g.kcal * 2 + 195);

    const items = mealTemplateToItems(t, "breakfast");
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.meal === "breakfast")).toBe(true);
    expect(items[1]!.grams).toBe(150);
  });

  it("createMealTemplate defaults a blank name and tombstones", () => {
    const t = createMealTemplate("   ");
    expect(t.name).toBe("Meal");
    expect(t.items).toEqual([]);
  });
});

describe("favourites", () => {
  it("derives a stable id from the food id and tombstones", () => {
    const fav = createFavoriteFood(chicken);
    expect(favoriteFoodId(fav.food.id)).toBe("fav_food_chicken");
    expect(fav.deletedAtMs).toBeUndefined();
    const gone = tombstoneFavorite(fav);
    expect(gone.deletedAtMs).toBeGreaterThan(0);
    expect(gone.updatedAtMs).toBe(gone.deletedAtMs);
  });
});

describe("recents", () => {
  function dayWith(dateIso: string, ...items: { name: string; meal: "lunch" | "dinner"; sourceId?: string; grams?: number }[]): DiaryDay {
    let d = createDiaryDay(dateIso);
    for (const it of items) {
      d = addDiaryItem(d, {
        meal: it.meal,
        name: it.name,
        sourceId: it.sourceId,
        sourceKind: it.sourceId ? "food" : undefined,
        grams: it.grams ?? 100,
        computed: { kcal: 100, proteinG: 5, carbsG: 10, fatG: 2 },
      });
    }
    return d;
  }

  it("rolls up distinct foods, most-recent-first, with a count", () => {
    const days = [
      dayWith("2026-01-10", { name: "Oats", meal: "lunch", sourceId: "off:1" }),
      dayWith("2026-01-12", { name: "Oats", meal: "lunch", sourceId: "off:1" }, { name: "Eggs", meal: "dinner" }),
      dayWith("2026-01-14", { name: "Eggs", meal: "dinner" }),
    ];
    const recent = recentFoodsFromDays(days);
    expect(recent.map((r) => r.name)).toEqual(["Eggs", "Oats"]);
    expect(recent[0]!.count).toBe(2);
    expect(recent[0]!.lastLoggedIso).toBe("2026-01-14");
    expect(recent.find((r) => r.name === "Oats")!.sourceId).toBe("off:1");
  });

  it("skips tombstoned days and re-logs a recent into a chosen meal", () => {
    const alive = dayWith("2026-01-12", { name: "Rice", meal: "lunch", grams: 150 });
    const dead: DiaryDay = { ...dayWith("2026-01-13", { name: "Ghost", meal: "dinner" }), deletedAtMs: 1 };
    const [rice] = recentFoodsFromDays([alive, dead]);
    expect(rice!.name).toBe("Rice");
    const item = loggedItemFromRecent(rice!, "breakfast");
    expect(item.meal).toBe("breakfast");
    expect(item.grams).toBe(150);
    expect(item.computed.kcal).toBe(100);
  });
});
