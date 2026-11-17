import { describe, expect, it } from "vitest";
import { CORE_EXERCISES } from "./coreExercises";
import {
  buildStarterPlan, otherPlanKinds, planKindFor, repRangesFor, starterPlanToSplit, starterRepRanges,
  type PlanEquipment, type PlanLength, type DaysPerWeek, type StarterAnswers,
} from "./starterPlan";

const base: StarterAnswers = { goal: "both", experience: "under2", days: 4, equipment: "gym", minutes: 45 };
const names = new Set(CORE_EXERCISES.map((e) => e.name));

describe("the plan onboarding builds", () => {
  it("4 days for 'both' is Upper / Lower on Mon Tue Thu Fri, big lifts 5–8 and the rest 8–12 (canvas O3)", () => {
    const plan = buildStarterPlan(base);
    expect(plan.name).toBe("Upper / Lower");
    expect(plan.days.map((d) => [d.name, d.weekday])).toEqual([["Upper A", 1], ["Lower A", 2], ["Upper B", 4], ["Lower B", 5]]);
    expect(plan.days[0]!.exercises.map((e) => [e.name, e.sets, e.repRange.join("–")])).toEqual([
      ["Bench Press", 3, "5–8"],
      ["Barbell Row", 3, "5–8"],
      ["Incline Dumbbell Press", 3, "8–12"],
      ["Lat Pulldown", 3, "8–12"],
      ["Bicep Curl", 2, "8–12"],
    ]);
    expect(plan.days[0]!.minutes).toBeGreaterThanOrEqual(40);
    expect(plan.days[0]!.minutes).toBeLessThanOrEqual(55);
  });

  it("picks the plan from the days", () => {
    expect([2, 3, 4, 5].map((d) => planKindFor(d as DaysPerWeek))).toEqual(["fullbody2", "fullbody3", "upperlower4", "ulppl5"]);
    expect(buildStarterPlan({ ...base, days: 5 }).days.map((d) => d.weekday)).toEqual([1, 2, 4, 5, 6]);
  });

  it("only ever uses exercises from the library, with their ids, for every equipment and length", () => {
    for (const equipment of ["gym", "home", "dumbbells"] as PlanEquipment[]) {
      for (const minutes of [30, 45, 60] as PlanLength[]) {
        for (const days of [2, 3, 4, 5] as DaysPerWeek[]) {
          const plan = buildStarterPlan({ ...base, equipment, minutes, days });
          for (const day of plan.days) {
            expect(day.exercises.length).toBeGreaterThanOrEqual(4);
            expect(new Set(day.exercises.map((e) => e.name)).size).toBe(day.exercises.length);
            for (const ex of day.exercises) {
              expect(names.has(ex.name), ex.name).toBe(true);
              expect(ex.id).toBeTruthy();
            }
          }
        }
      }
    }
  });

  it("dumbbells only swaps the barbell and machine lifts", () => {
    const plan = buildStarterPlan({ ...base, equipment: "dumbbells" });
    const all = plan.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(all).toContain("Dumbbell Bench Press");
    expect(all).not.toContain("Bench Press");
    expect(all).not.toContain("Leg Press");
    expect(all).not.toContain("Lat Pulldown");
  });

  it("a shorter workout drops exercises from the end; someone just starting gets at most five", () => {
    expect(buildStarterPlan({ ...base, minutes: 30 }).days[0]!.exercises).toHaveLength(4);
    expect(buildStarterPlan({ ...base, minutes: 60 }).days[0]!.exercises).toHaveLength(6);
    expect(buildStarterPlan({ ...base, minutes: 60, experience: "new" }).days[0]!.exercises).toHaveLength(5);
  });

  it("the goal sets the rep ranges", () => {
    expect(repRangesFor("strength").main).toEqual([3, 6]);
    expect(repRangesFor("muscle").main).toEqual([8, 12]);
    expect(buildStarterPlan({ ...base, goal: "strength" }).days[0]!.exercises[0]!.repRange).toEqual([3, 6]);
  });

  it("other plans come closest in days first", () => {
    expect(otherPlanKinds("upperlower4").map((p) => p.kind)).toEqual(["fullbody3", "ppl3", "ulppl5", "fullbody2"]);
  });

  it("becomes a split on a weekday schedule with sets, and one rep range per exercise", () => {
    const plan = buildStarterPlan(base);
    const split = starterPlanToSplit(plan);
    expect(split.schedule).toBe("weekdays");
    expect(split.days.map((d) => d.weekday)).toEqual([1, 2, 4, 5]);
    expect(split.days[0]!.blocks[0]).toMatchObject({ type: "strength", exerciseName: "Bench Press", targets: { sets: 3 } });
    const ranges = starterRepRanges(plan);
    expect(new Set(ranges.map((r) => r.name)).size).toBe(ranges.length);
    expect(ranges.find((r) => r.name === "Bench Press")?.repRange).toEqual([5, 8]);
  });
});
