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
