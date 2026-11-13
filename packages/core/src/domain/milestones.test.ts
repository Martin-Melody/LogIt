import { describe, expect, it } from "vitest";
import { bigLiftOf, liftMilestones } from "./milestones";

describe("bigLiftOf", () => {
  it("matches the competition lifts and not their variations", () => {
    expect(bigLiftOf("Bench Press")).toBe("bench");
    expect(bigLiftOf("Barbell Bench Press")).toBe("bench");
    expect(bigLiftOf("Incline Bench Press")).toBeNull();
    expect(bigLiftOf("Dumbbell Bench Press")).toBeNull();
    expect(bigLiftOf("Back Squat")).toBe("squat");
    expect(bigLiftOf("Squat")).toBe("squat");
    expect(bigLiftOf("Front Squat")).toBeNull();
    expect(bigLiftOf("Bulgarian Split Squat")).toBeNull();
    expect(bigLiftOf("Deadlift")).toBe("deadlift");
    expect(bigLiftOf("Sumo Deadlift")).toBe("deadlift");
    expect(bigLiftOf("Romanian Deadlift")).toBeNull();
    expect(bigLiftOf("Lat Pulldown")).toBeNull();
  });
});

describe("liftMilestones", () => {
  it("awards plates and bodyweight ratios from the heaviest set", () => {
    const m = liftMilestones(
      [
        { exerciseName: "Bench Press", weight: 100 },
        { exerciseName: "Bench Press", weight: 80 },
        { exerciseName: "Squat", weight: 140 },
        { exerciseName: "Deadlift", weight: 180 },
        { exerciseName: "Incline Bench Press", weight: 200 },
      ],
      91,
    ).map((x) => x.label);
    expect(m).toEqual([
      "One-plate bench",
      "Two-plate bench",
      "Two-plate squat",
      "Three-plate squat",
      "Three-plate deadlift",
      "Four-plate deadlift",
      "Bodyweight bench",
      "1.5× bodyweight squat",
    ]);
  });

  it("skips ratios when bodyweight isn't known", () => {
    expect(liftMilestones([{ exerciseName: "Bench Press", weight: 100 }], null).map((x) => x.id)).toEqual([
      "plates-bench-60",
      "plates-bench-100",
    ]);
  });

  it("uses the bodyweight at the time of the lift when given", () => {
    const m = liftMilestones([{ exerciseName: "Bench Press", weight: 80, bodyweightKg: 80 }], 95);
    expect(m.map((x) => x.label)).toContain("Bodyweight bench");
  });
});
