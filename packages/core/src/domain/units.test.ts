import { describe, expect, it } from "vitest";
import {
  toDisplayWeight,
  fromDisplayWeight,
  roundDisplayWeight,
  formatWeight,
  trimWeight,
} from "./units";

describe("weight units", () => {
  it("kg is identity", () => {
    expect(toDisplayWeight(100, "kg")).toBe(100);
    expect(fromDisplayWeight(100, "kg")).toBe(100);
  });

  it("converts kg <-> lbs", () => {
    expect(toDisplayWeight(100, "lbs")).toBeCloseTo(220.462, 2);
    expect(fromDisplayWeight(225, "lbs")).toBeCloseTo(102.058, 2);
  });

  it("round-trips a pound value within input granularity", () => {
    const kg = fromDisplayWeight(185, "lbs");
    expect(roundDisplayWeight(toDisplayWeight(kg, "lbs"), "lbs")).toBe(185);
  });

  it("rounds display to 0.5 lb / 0.25 kg", () => {
    expect(roundDisplayWeight(185.3, "lbs")).toBe(185.5);
    expect(roundDisplayWeight(100.1, "kg")).toBe(100);
    expect(roundDisplayWeight(100.2, "kg")).toBe(100.25);
  });

  it("trims trailing zeros", () => {
    expect(trimWeight(100)).toBe("100");
    expect(trimWeight(102.5)).toBe("102.5");
    expect(trimWeight(102.0)).toBe("102");
  });

  it("formats with and without unit", () => {
    expect(formatWeight(102.5, "kg")).toBe("102.5 kg");
    expect(formatWeight(102.5, "kg", { withUnit: false })).toBe("102.5");
    expect(formatWeight(100, "lbs")).toBe("220.5 lbs");
  });
});
