import { describe, expect, it } from "vitest";
import { prText } from "./prText";

describe("prText", () => {
  it("says rep for one and reps for more", () => {
    expect(prText(200, "kg", 1)).toBe("200 kg × 1 rep");
    expect(prText(100, "lb", 5)).toBe("100 lb × 5 reps");
  });
  it("handles a missing weight, reps or unit", () => {
    expect(prText(0, "kg", 12)).toBe("12 reps");
    expect(prText(140, null, null)).toBe("140 kg");
    expect(prText(null, null, null)).toBe("");
  });
});
