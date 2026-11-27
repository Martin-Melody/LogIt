import { describe, expect, it } from "vitest";
import { createCoachNutritionPlan, planOn, type CoachNutritionPlan } from "./CoachNutritionPlan";
import { copyPlanForClient, copyState, foodsTheyDontEat, planClashes, replacePlan, restingBurn, updatePlanCopy } from "./givingMealPlan";
import { defaultNutritionGoal } from "./nutrition";

const food = (name: string, extra = {}) => ({ id: name, name, grams: 100, computed: { kcal: 100, proteinG: 0, carbsG: 0, fatG: 0 }, ...extra });

describe("giving a meal plan (canvas MP5, FX1)", () => {
  it("reads the start-up form's foods they don't eat", () => {
    const asked = [{ id: "q1", prompt: "Foods you don't eat", type: "choice" as const, options: ["Vegetarian", "Dairy-free", "Nut allergy"] }];
    expect(foodsTheyDontEat(asked, [{ questionId: "q1", choices: ["Dairy-free", "Nut allergy"] }])).toEqual(["dairy-free", "nut-free"]);
    expect(foodsTheyDontEat(undefined, [])).toEqual([]);
  });

  it("finds foods they don't eat, and the swap they'd see", () => {
    const plan: CoachNutritionPlan = { ...createCoachNutritionPlan("Fat loss"), meals: [{ id: "m", name: "Dinner", foods: [
      food("Greek yogurt dressing", { notFor: ["dairy-free"], swaps: [food("Tahini dressing")] }),
      food("Cheese", { notFor: ["dairy-free"] }),
      food("Salmon"),
    ] }] };
    const c = planClashes(plan, ["dairy-free"]);
    expect(c.map((x) => [x.food.name, x.swap?.name ?? null])).toEqual([["Greek yogurt dressing", "Tahini dressing"], ["Cheese", null]]);
  });

  it("works out a resting burn from their own goal", () => {
    const g = { ...defaultNutritionGoal(), sex: "female" as const, birthDateIso: "2000-06-15", heightCm: 165 };
    expect(restingBurn(g, 62, new Date("2026-06-15T12:00:00"))).toBe(1360); // 10×62 + 6.25×165 − 5×26 − 161
    expect(restingBurn({ ...g, heightCm: undefined }, 62)).toBeNull();
  });

  it("replaces from tomorrow, or from when the wrong plan started; past days follow", () => {
    const old = { ...createCoachNutritionPlan("Lean bulk"), kcalTarget: 2800, fromIso: "2026-11-26" };
    const lib = { ...createCoachNutritionPlan("Fat loss"), kcalTarget: 2100 };
    const next = copyPlanForClient(lib, "2026-12-10");
    expect(next.sourcePlanId).toBe(lib.id);
    const a = replacePlan(old, next, "tomorrow", "2026-12-10");
    expect(a.plan.fromIso).toBe("2026-12-11");
    expect(planOn([a.ended!, a.plan], "2026-12-10")?.name).toBe("Lean bulk");
    const b = replacePlan(old, next, "wrong", "2026-12-10");
    expect(planOn([b.ended!, b.plan], "2026-11-30")?.name).toBe("Fat loss");
  });

  it("knows when a copy is behind its library plan, and keeps its dates when updated", () => {
    const lib = { ...createCoachNutritionPlan("Fat loss"), updatedAtMs: 1000 };
    const copy = { ...copyPlanForClient(lib, "2026-12-01"), createdAtMs: 2000, updatedAtMs: 2000 };
    expect(copyState(copy, lib)).toEqual({ behind: false, changedForThem: false });
    const changed = { ...lib, kcalTarget: 1900, updatedAtMs: 5000 };
    expect(copyState(copy, changed).behind).toBe(true);
    const up = updatePlanCopy(copy, changed);
    expect([up.id, up.fromIso, up.kcalTarget, up.sourcePlanId]).toEqual([copy.id, "2026-12-01", 1900, lib.id]);
    expect(copyState({ ...copy, updatedAtMs: 9000 }, changed).changedForThem).toBe(true);
  });
});
