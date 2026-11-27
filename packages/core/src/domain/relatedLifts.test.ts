import { describe, expect, it } from "vitest";
import { liftKind, relatedEstimate, type KnownLift } from "./relatedLifts";
import { estimated1RM } from "./oneRepMax";

const k = (name: string, weight: number, reps: number, atMs = 1): KnownLift => ({ name, weight, reps, e1rm: estimated1RM(weight, reps), atMs });

describe("lifts not logged yet", () => {
  it("places common lifts", () => {
    expect(liftKind("Leg Extension")).toMatchObject({ movement: "knee-extension", machine: true });
    expect(liftKind("Romanian Deadlift")).toMatchObject({ movement: "hinge", factor: 0.7 });
    expect(liftKind("Incline Dumbbell Press")).toMatchObject({ movement: "incline-press" });
    expect(liftKind("Pull-up")).toBeNull();
  });

  it("Martin's example: a 200 × 5 deadlift says leg extension is safely over 40 kg", () => {
    const e = relatedEstimate("Leg extension", [k("Deadlift", 200, 5)])!;
    expect(e.confidence).toBe("guess");
    expect(e.basis).toEqual({ name: "Deadlift", weight: 200, reps: 5 });
    expect(e.e1rmKg).toBeGreaterThan(40);
    expect(e.e1rmKg).toBeLessThan(estimated1RM(200, 5) * 0.45); // never above the table's level
  });

  it("uses their own lifts in the same movement first, at the low end", () => {
    const e = relatedEstimate("Romanian deadlift", [k("Deadlift", 180, 5), k("Bench press", 100, 5)])!;
    expect(e.confidence).toBe("rough");
    expect(e.basis.name).toBe("Deadlift");
    expect(e.e1rmKg).toBeCloseTo(estimated1RM(180, 5) * 0.7 * 0.85, 0);
  });

  it("has nothing to say without a lift it can place", () => {
    expect(relatedEstimate("Bench press", [])).toBeNull();
    expect(relatedEstimate("Bench press", [k("Pull-up", 10, 8)])).toBeNull();
    expect(relatedEstimate("Pull-up", [k("Bench press", 100, 5)])).toBeNull();
  });
});
