import { describe, it, expect } from "vitest";
import { convertForUnitChange, type UserProfile } from "$lib/stores/profile.store";

const base = { weight: 91, weightUnit: "kg", height: 174, heightUnit: "cm" } as UserProfile;

describe("convertForUnitChange", () => {
  it("converts the stored weight when only the unit changes", () => {
    expect(convertForUnitChange(base, { weightUnit: "lbs" })).toEqual({ weightUnit: "lbs", weight: 200.6 });
    const lb = { ...base, weight: 200.6, weightUnit: "lbs" } as UserProfile;
    expect(convertForUnitChange(lb, { weightUnit: "kg" }).weight).toBe(91);
  });

  it("converts height the same way", () => {
    expect(convertForUnitChange(base, { heightUnit: "in" }).height).toBe(68.5);
  });

  it("leaves a patch alone when it sets the value too, or the unit doesn't change", () => {
    expect(convertForUnitChange(base, { weightUnit: "lbs", weight: 180 })).toEqual({ weightUnit: "lbs", weight: 180 });
    expect(convertForUnitChange(base, { weightUnit: "kg" })).toEqual({ weightUnit: "kg" });
    expect(convertForUnitChange({ ...base, weight: null }, { weightUnit: "lbs" })).toEqual({ weightUnit: "lbs" });
  });
});
