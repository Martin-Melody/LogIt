import { describe, expect, it } from "vitest";
import { formatLoad } from "./units";
import { usesBodyweightLoad } from "./exercise";

describe("formatLoad", () => {
  it("shows bodyweight-relative loads as BW, BW−x and BW+x", () => {
    expect(formatLoad(0, "kg", true)).toBe("BW");
    expect(formatLoad(-25, "kg", true)).toBe("BW−25 kg");
    expect(formatLoad(2.5, "kg", true, { withUnit: false })).toBe("BW+2.5");
    expect(formatLoad(-25, "lbs", true, { withUnit: false })).toBe("BW−55");
  });

  it("is plain formatWeight otherwise", () => {
    expect(formatLoad(60, "kg", false)).toBe("60 kg");
  });
});

describe("usesBodyweightLoad", () => {
  it("is true for the bodyweight type and for any negative weight", () => {
    expect(usesBodyweightLoad("bodyweight")).toBe(true);
    expect(usesBodyweightLoad(undefined, [0, -25])).toBe(true);
    expect(usesBodyweightLoad("normal", [0, 0])).toBe(false);
  });

  it("is false for the assisted type, whose weight is the assistance", () => {
    expect(usesBodyweightLoad("assisted", [-25])).toBe(false);
  });
});
