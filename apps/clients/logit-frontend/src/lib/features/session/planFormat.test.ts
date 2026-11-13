import { describe, expect, it } from "vitest";
import { meterRow } from "./planFormat";

describe("meterRow", () => {
  it("reads a set at the planned weight as before", () => {
    const r = meterRow(5, 7, 8);
    expect(r.right).toBe("5/7");
    expect(r.converted).toBe(false);
    expect(r.cells.filter((c) => c === "hit")).toHaveLength(5);
  });

  it("shows a set at another weight as reps at the planned weight", () => {
    // 5 at BW+2.5 worked out as ≈6 at BW, aiming for 7.
    const r = meterRow(6, 7, 8, 5);
    expect(r.right).toBe("≈6/7");
    expect(r.converted).toBe(true);
    expect(r.cells).toEqual(["hit", "hit", "hit", "hit", "hit", "hit", "target", "rest"]);
    expect(r.spoken).toContain("5 reps at a different weight");
  });

  it("never ticks a converted set as reaching the goal", () => {
    expect(meterRow(9, 7, 8, 7).right).toBe("≈9 +2");
    expect(meterRow(7, 7, 8, 6).right).toBe("≈7");
  });
});
