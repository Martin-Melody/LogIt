import { describe, expect, it } from "vitest";
import { warmupSets } from "./warmup";

describe("warmupSets", () => {
  it("ramps bar → 40/60/80% for a normal working weight", () => {
    const sets = warmupSets(100, { minKg: 20 });
    expect(sets).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 2 },
    ]);
  });

  it("drops steps at/above the working weight", () => {
    const sets = warmupSets(45, { minKg: 20 });
    // 40% = 18 → clamped to bar 20; 60% = 27; 80% = 36. bar(20) then 27 then 36.
    expect(sets.map((s) => s.weight)).toEqual([20, 27, 36]);
  });

  it("returns nothing when the working weight is the bar", () => {
    expect(warmupSets(20, { minKg: 20 })).toEqual([]);
  });

  it("snaps each weight and de-dupes", () => {
    const sets = warmupSets(100, { minKg: 20, snap: (kg) => Math.round(kg / 5) * 5 });
    expect(sets.map((s) => s.weight)).toEqual([20, 40, 60, 80]);
  });

  it("collapses duplicate rungs after snapping", () => {
    // bar (20) and 40% of 48 (19.2 → clamped 20) both snap to 20 → one entry
    const sets = warmupSets(48, { minKg: 20, snap: (kg) => Math.round(kg / 10) * 10 });
    expect(sets.map((s) => s.weight)).toEqual([20, 30, 40]);
  });
});
