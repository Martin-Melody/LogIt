// Home's one-at-a-time suggestion (src/lib/features/onboarding/nextStep.ts, canvas O7).
import { describe, expect, it } from "vitest";
import { pickNextStep } from "$lib/features/onboarding/nextStep";

const base = { workouts: 0, hasFoodGoal: false, hasName: false, signedIn: false, firstWeekOver: false, goal: "muscle" as const, dismissed: [] as string[] };

describe("the next step on Home", () => {
  it("nothing until it's earned", () => {
    expect(pickNextStep({ ...base, workouts: 1 })).toBeNull();
  });

  it("food after workout 2, worded for the goal", () => {
    expect(pickNextStep({ ...base, workouts: 2 })).toMatchObject({ id: "food", title: "Eating enough protein?", href: "/nutrition/goal" });
    expect(pickNextStep({ ...base, workouts: 2, goal: "leaner" })?.title).toBe("Lose fat, keep the strength");
  });

  it("one at a time: dismissing or doing one brings the next", () => {
    expect(pickNextStep({ ...base, workouts: 3, dismissed: ["food"] })?.id).toBe("name");
    expect(pickNextStep({ ...base, workouts: 3, hasFoodGoal: true, hasName: true })?.id).toBe("friends");
    expect(pickNextStep({ ...base, workouts: 3, hasFoodGoal: true, hasName: true, signedIn: false })?.href).toBe("/auth?mode=register");
    expect(pickNextStep({ ...base, workouts: 3, hasFoodGoal: true, hasName: true, dismissed: ["friends"] })).toBeNull();
    expect(pickNextStep({ ...base, workouts: 3, hasFoodGoal: true, hasName: true, dismissed: ["friends"], firstWeekOver: true })?.id).toBe("summary");
  });
});
