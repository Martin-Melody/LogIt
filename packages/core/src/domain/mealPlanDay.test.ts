import { describe, expect, it } from "vitest";
import { createCoachNutritionPlan, type CoachNutritionPlan, type PlannedFood } from "./CoachNutritionPlan";
import { atAmount, dayAgainstPlan, foodForThem, groceryForDays, loggedFromPlan, swapAmount } from "./mealPlanDay";

const f = (name: string, grams: number, kcal: number, proteinG: number, extra: Partial<PlannedFood> = {}): PlannedFood => ({ id: name, name, grams, computed: { kcal, proteinG, carbsG: 0, fatG: 0 }, ...extra });

describe("a client's day on a meal plan (canvas MP7, SW2, Q7, MP8)", () => {
  it("a swap matches the planned food's protein", () => {
    const salmon = f("Salmon", 130, 270, 26);
    expect(swapAmount(salmon, f("Chicken", 100, 120, 23)).grams).toBe(113);
    expect(swapAmount(f("Rice", 100, 130, 0), f("Pasta", 100, 160, 0)).grams).toBe(81);
  });

  it("they see a swap that fits in place of food they don't eat", () => {
    const dressing = f("Greek yogurt dressing", 50, 100, 3, { notFor: ["dairy-free"], swaps: [f("Tahini dressing", 30, 180, 5)] });
    const seen = foodForThem(dressing, ["dairy-free"]);
    expect([seen.food.name, seen.swappedFor]).toEqual(["Tahini dressing", "Greek yogurt dressing"]);
    expect(foodForThem(dressing, []).food.name).toBe("Greek yogurt dressing");
  });

  it("logs from the plan, changes amounts, and tells the coach how the day went", () => {
    const meal = { id: "dinner", name: "Dinner", foods: [f("Salmon", 130, 270, 26), f("Potatoes", 200, 150, 4)] };
    const plan: CoachNutritionPlan = { ...createCoachNutritionPlan("Fat loss"), meals: [meal, { id: "lunch", name: "Lunch", foods: [f("Bowl", 400, 640, 52)] }] };
    const a = loggedFromPlan(plan.id, meal, meal.foods[0]!, swapAmount(meal.foods[0]!, f("Chicken", 100, 120, 23)), "swapped");
    expect(a.plan).toEqual({ planId: plan.id, mealId: "dinner", foodId: "Salmon", how: "swapped" });
    expect(atAmount(meal.foods[1]!, 0)).toBeNull();
    expect(atAmount(meal.foods[1]!, 100)!.computed.kcal).toBe(75);
    const day = { id: "d", dateIso: "2026-12-01", createdAtMs: 0, updatedAtMs: 0, items: [{ ...a, id: "1" }, { id: "2", meal: "snack" as const, name: "Crisps", grams: 30, computed: { kcal: 160, proteinG: 2, carbsG: 15, fatG: 10 } }] };
    expect(dayAgainstPlan(day, plan, plan.meals!)).toEqual({ logged: 1, of: 2, swapped: ["dinner"], changed: false, offPlan: 1 });
  });

  it("shops for the days ahead, recipes as ingredients", () => {
    const recipe = { id: "r", name: "Bowl", servings: 4, perServing: { kcal: 640, proteinG: 52, carbsG: 78, fatG: 13 }, ingredients: [{ id: "i", name: "Chicken breast", grams: 600, computed: { kcal: 714, proteinG: 150, carbsG: 0, fatG: 10 } }] };
    const plan = { ...createCoachNutritionPlan("Plan"), meals: [{ id: "l", name: "Lunch", foods: [f("Bowl", 400, 640, 52, { recipe, servingsUsed: 1 }), f("Banana", 120, 107, 1)] }] };
    const days = [1, 2, 3].map((d) => ({ dateIso: `2026-12-0${d}`, training: false }));
    expect(groceryForDays(plan, days)).toEqual([{ name: "Banana", grams: 360 }, { name: "Chicken breast", grams: 450 }]);
  });
});
