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

describe("a beginner's first sets (review fix)", () => {
  it("one workout's careful sets aren't used to work out other lifts", async () => {
    const { knownLifts, solidLifts } = await import("./relatedLifts");
    const s = (id: string, t: number) => ({ id, startedAtMs: t, endedAtMs: t + 1, blocks: [{ id: "b", type: "strength", orderIndex: 0, data: { exerciseName: "Squat", sets: [{ id: "x", setType: "normal", reps: 8, weight: 20, orderIndex: 0, completed: true }] } }] });
    const once = knownLifts([s("a", 1000)] as never, 2000, 1);
    expect(solidLifts(once)).toEqual([]);
    const twice = knownLifts([s("a", 1000), s("b", 1500)] as never, 2000, 1);
    expect(solidLifts(twice).map((k) => [k.name, k.sessions])).toEqual([["Squat", 2]]);
  });
});
