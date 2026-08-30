import { describe, expect, it } from "vitest";
import { defaultNutritionGoal, type NutritionGoal } from "../domain/nutrition";
import {
  ageFromBirthDate,
  bmrMifflinStJeor,
  calorieTargetForGoal,
  computeTargets,
  macroTargets,
  tdee,
} from "./targets";

describe("bmrMifflinStJeor", () => {
  it("matches the Mifflin–St Jeor formula for men", () => {
    // 10*80 + 6.25*180 - 5*30 + 5
    expect(bmrMifflinStJeor({ sex: "male", weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(
      1780,
    );
  });

  it("matches the formula for women (−161 constant)", () => {
    expect(
      bmrMifflinStJeor({ sex: "female", weightKg: 60, heightCm: 165, ageYears: 30 }),
    ).toBeCloseTo(1320.25, 2);
  });
});

describe("tdee", () => {
  it("scales BMR by the activity multiplier", () => {
    expect(tdee(1780, "moderate")).toBeCloseTo(2759, 0);
    expect(tdee(1780, "sedentary")).toBeCloseTo(2136, 0);
  });
});

describe("ageFromBirthDate", () => {
  it("accounts for whether the birthday has passed this year", () => {
    expect(ageFromBirthDate("1990-01-01", new Date("2026-06-15"))).toBe(36);
    expect(ageFromBirthDate("1990-12-31", new Date("2026-06-15"))).toBe(35);
  });
});

describe("calorieTargetForGoal", () => {
  it("subtracts a deficit to lose weight (7700 kcal/kg)", () => {
    // 0.5 kg/wk => 550 kcal/day
    expect(
      calorieTargetForGoal({ expenditure: 2759, goalType: "lose", rateKgPerWeek: 0.5 }),
    ).toBeCloseTo(2209, 0);
  });

  it("adds a surplus to gain weight", () => {
    expect(
      calorieTargetForGoal({ expenditure: 2759, goalType: "gain", rateKgPerWeek: 0.25 }),
    ).toBeCloseTo(3034, 0);
  });

  it("returns expenditure unchanged for maintenance", () => {
    expect(
      calorieTargetForGoal({ expenditure: 2759, goalType: "maintain", rateKgPerWeek: 0 }),
    ).toBe(2759);
  });

  it("never dips below the floor", () => {
    expect(
      calorieTargetForGoal({
        expenditure: 1800,
        goalType: "lose",
        rateKgPerWeek: 1,
        floor: 1500,
      }),
    ).toBe(1500);
  });
});

describe("macroTargets", () => {
  it("anchors protein to bodyweight, fat to a calorie fraction, carbs to the remainder", () => {
    const m = macroTargets({
      kcalTarget: 2200,
      weightKg: 80,
      proteinGPerKg: 1.8,
      fatPct: 0.3,
    });
    expect(m.proteinG).toBe(144); // 80 * 1.8
    expect(m.fatG).toBe(73); // 2200 * 0.3 / 9
    expect(m.carbsG).toBe(241); // (2200 - 576 - 660) / 4
    expect(m.kcal).toBe(2200);
  });
});

describe("computeTargets", () => {
  const goal: NutritionGoal = {
    ...defaultNutritionGoal(),
    sex: "male",
    birthDateIso: "1994-06-15",
    heightCm: 180,
    activityLevel: "moderate",
    goalType: "lose",
    targetRateKgPerWeek: 0.5,
    proteinGPerKg: 1.8,
    fatPct: 0.3,
    adaptiveEnabled: true,
  };
  const now = new Date("2026-06-15");

  it("returns null without enough profile data and no manual override", () => {
    expect(computeTargets({ ...goal, birthDateIso: undefined }, { weightKg: 80, now })).toBeNull();
    expect(computeTargets(goal, { weightKg: undefined, now })).toBeNull();
  });

  it("computes a calculated target from the formula TDEE", () => {
    const t = computeTargets(goal, { weightKg: 80, now })!;
    expect(t.source).toBe("calculated");
    // age 32 on 2026-06-15 -> 10*80 + 6.25*180 - 5*32 + 5
    expect(t.bmr).toBe(1770);
    expect(t.expenditure).toBeCloseTo(1770 * 1.55, 5); // 2743.5
    expect(t.kcal).toBe(2194); // round(2743.5 - 550)
  });

  it("uses the adaptive expenditure when enabled and supplied", () => {
    const t = computeTargets(goal, { weightKg: 80, adaptiveExpenditure: 2500, now })!;
    expect(t.source).toBe("adaptive");
    expect(t.expenditure).toBe(2500);
    expect(t.kcal).toBeCloseTo(2500 - 550, 0);
  });

  it("manual override wins and reports source 'manual'", () => {
    const t = computeTargets(
      { ...goal, manualCalorieTarget: 2000 },
      { weightKg: 80, adaptiveExpenditure: 2500, now },
    )!;
    expect(t.source).toBe("manual");
    expect(t.kcal).toBe(2000);
  });

  it("does not use adaptive when the goal has it disabled", () => {
    const t = computeTargets(
      { ...goal, adaptiveEnabled: false },
      { weightKg: 80, adaptiveExpenditure: 2500, now },
    )!;
    expect(t.source).toBe("calculated");
  });
});
