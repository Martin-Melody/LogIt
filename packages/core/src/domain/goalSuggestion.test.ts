import { describe, expect, it } from "vitest";
import { goalLine, parseGoalSuggestion, useGoalSuggestion } from "./goalSuggestion";
import { defaultNutritionGoal } from "./nutrition";

describe("suggesting a goal change (canvas GL1)", () => {
  it("says the pace and when they'd get there", () => {
    const now = new Date("2026-12-10T12:00:00");
    expect(goalLine({ goalType: "lose", rateKgPerWeek: 0.5, targetWeightKg: 65 }, 71, now)).toBe(`−0.5 kg a week, 65 kg by ${new Date("2027-03-04T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })}`);
    expect(goalLine({ goalType: "lose", rateKgPerWeek: 0.3 }, null)).toBe("−0.3 kg a week");
  });
  it("using it changes only the goal's pace and target", () => {
    const g = { ...defaultNutritionGoal(), goalType: "lose" as const, targetRateKgPerWeek: 0.5, proteinGPerKg: 2 };
    const s = parseGoalSuggestion(JSON.stringify({ id: "s1", goalType: "lose", rateKgPerWeek: 0.3, targetWeightKg: 65 }))!;
    expect(useGoalSuggestion(g, s)).toMatchObject({ targetRateKgPerWeek: 0.3, targetWeightKg: 65, proteinGPerKg: 2 });
    expect(parseGoalSuggestion("nope")).toBeNull();
  });
});
