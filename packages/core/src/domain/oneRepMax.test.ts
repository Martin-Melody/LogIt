import { describe, expect, it } from "vitest";
import { estimated1RM } from "./oneRepMax";

describe("estimated1RM", () => {
  it("returns the weight unchanged at 1 rep", () => {
    expect(estimated1RM(100, 1)).toBe(100);
  });

  it("applies the Epley formula for reps > 1", () => {
    // 100 * (1 + 5/30) = 116.666...
    expect(estimated1RM(100, 5)).toBeCloseTo(116.67, 1);
  });

  it("scales with reps", () => {
    expect(estimated1RM(100, 10)).toBeGreaterThan(estimated1RM(100, 5));
  });
});
