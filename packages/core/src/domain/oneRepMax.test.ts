import { describe, expect, it } from "vitest";
import { estimated1RM, repsAtLoad } from "./oneRepMax";

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

describe("repsAtLoad", () => {
  it("is the same reps at the same load", () => {
    expect(repsAtLoad(8, 100, 100)).toBeCloseTo(8, 5);
  });

  it("gives more reps at a lighter load and fewer at a heavier one", () => {
    // 5 reps at 93.5 kg (BW+2.5 at 91 kg) ≈ 6 at 91 kg.
    expect(Math.round(repsAtLoad(5, 93.5, 91)!)).toBe(6);
    // 10 reps at 66 kg (BW−25) ≈ 7 at 71 kg (BW−20).
    expect(Math.round(repsAtLoad(10, 66, 71)!)).toBe(7);
  });

  it("keeps the Epley estimate", () => {
    const r = repsAtLoad(5, 100, 90)!;
    expect(90 * (1 + r / 30)).toBeCloseTo(100 * (1 + 5 / 30), 5);
  });

  it("is null without a usable load", () => {
    expect(repsAtLoad(5, 0, 100)).toBeNull();
    expect(repsAtLoad(5, 100, 0)).toBeNull();
    expect(repsAtLoad(0, 100, 90)).toBeNull();
  });
});
