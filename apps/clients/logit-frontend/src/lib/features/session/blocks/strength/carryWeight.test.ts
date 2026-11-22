import { describe, expect, it } from "vitest";
import type { SetEntry } from "@logit/core/domain/workout";
import { carriedWeight } from "./carryWeight";

const set = (orderIndex: number, weight: number, target?: SetEntry["target"]): SetEntry =>
  ({ id: `s${orderIndex}`, setType: "normal", reps: 8, weight, orderIndex, ...(target ? { target } : {}) }) as SetEntry;

describe("carriedWeight", () => {
  it("a coach's set with no load carries the set before it (10, 0, 0 → 10, 10, 10)", () => {
    const sets = [set(0, 10, { reps: 8, weight: 0 }), set(1, 0, { reps: 8, weight: 0 }), set(2, 0, { reps: 8, weight: 0 })];
    expect(carriedWeight(sets, sets[1]!)).toBe(10);
    expect(carriedWeight(sets, sets[2]!)).toBe(10);
  });
  it("keeps a planned weight, an entered weight, and plain bodyweight sets as they are", () => {
    const planned = [set(0, 10), set(1, 0, { reps: 8, weight: 12.5 })];
    expect(carriedWeight(planned, planned[1]!)).toBeUndefined();
    const entered = [set(0, 10), set(1, 12)];
    expect(carriedWeight(entered, entered[1]!)).toBeUndefined();
    const bodyweight = [set(0, 0), set(1, 0)];
    expect(carriedWeight(bodyweight, bodyweight[1]!)).toBeUndefined();
  });
  it("carries assisted (negative) weight too", () => {
    const sets = [set(0, -20), set(1, 0)];
    expect(carriedWeight(sets, sets[1]!)).toBe(-20);
  });
});
