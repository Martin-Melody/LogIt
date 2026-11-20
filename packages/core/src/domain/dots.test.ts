import { describe, expect, it } from "vitest";
import { dotsScore } from "./dots";

describe("dotsScore", () => {
  it("follows the IPF formula", () => {
    // The polynomial is 812.33 for a 100 kg man and 451.05 for a 60 kg woman (IPF coefficients).
    expect(dotsScore(700, 100, "men")).toBeCloseTo((700 * 500) / 812.33, 1);
    expect(dotsScore(400, 60, "women")).toBeCloseTo((400 * 500) / 451.05, 1);
  });

  it("clamps bodyweight to the formula's range", () => {
    expect(dotsScore(800, 250, "men")).toBe(dotsScore(800, 210, "men"));
    expect(dotsScore(300, 30, "women")).toBe(dotsScore(300, 40, "women"));
  });
});
