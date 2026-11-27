import { describe, expect, it } from "vitest";
import { copyData } from "./copyData";
import { copyProgramForClient, createCoachProgram } from "./CoachProgram";
import { createCoachNutritionPlan } from "./CoachNutritionPlan";
import { copyPlanForClient } from "./givingMealPlan";

describe("copying programs and plans that a UI wrapped in a Proxy", () => {
  it("copies through a Proxy, where structuredClone throws", () => {
    const wrap = <T extends object>(o: T): T => new Proxy(o, {});
    const program = wrap(createCoachProgram("Strength"));
    expect(() => structuredClone(program)).toThrow();
    expect(copyProgramForClient(program, { mode: "manual" }).weeks).toEqual(program.weeks);
    expect(copyPlanForClient(wrap(createCoachNutritionPlan("Fat loss")), "2026-12-01").name).toBe("Fat loss");
    expect(copyData({ a: [1, { b: 2 }] })).toEqual({ a: [1, { b: 2 }] });
  });
});
