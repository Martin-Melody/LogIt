import { describe, expect, it } from "vitest";
import { machineWeightsKg, snapToMachine, stepMachineWeight } from "./machine";
import type { Machine } from "./exercise";

const base = { id: "m", name: "M", incrementKg: 2.5 };

describe("machine weights", () => {
  it("returns null for a legacy machine with no weights", () => {
    expect(machineWeightsKg(base)).toBeNull();
  });

  it("expands a linear kg stack", () => {
    const m: Machine = { ...base, weights: { kind: "linear", min: 5, step: 5, max: 25 } };
    expect(machineWeightsKg(m)).toEqual([5, 10, 15, 20, 25]);
  });

  it("adds micro add-on plates to every rung", () => {
    const m: Machine = { ...base, weights: { kind: "linear", min: 10, step: 10, max: 20, addOns: [2.5] } };
    expect(machineWeightsKg(m)).toEqual([10, 12.5, 20, 22.5]);
  });

  it("converts an lb-native stack to kg", () => {
    const m: Machine = { ...base, unit: "lbs", weights: { kind: "stack", values: [10, 20, 30] } };
    const kg = machineWeightsKg(m)!;
    expect(kg[0]).toBeCloseTo(4.536, 2);
    expect(kg[2]).toBeCloseTo(13.608, 2);
  });

  it("snaps a target to the nearest achievable weight", () => {
    const m: Machine = { ...base, weights: { kind: "stack", values: [5, 15, 25] } };
    expect(snapToMachine(m, 12).kg).toBe(15);
    expect(snapToMachine(m, 6).kg).toBe(5);
  });

  it("snaps in the machine's native unit for display", () => {
    const m: Machine = { ...base, unit: "lbs", weights: { kind: "linear", min: 10, step: 10, max: 100 } };
    const snap = snapToMachine(m, 45); // ~99.2 lb → nearest rung 100 lb
    expect(snap.unit).toBe("lbs");
    expect(snap.nativeValue).toBe(100);
    expect(snap.kg).toBeCloseTo(45.36, 1);
  });

  it("falls back to incrementKg when there are no explicit weights", () => {
    expect(snapToMachine(base, 41).kg).toBe(40);
    expect(snapToMachine(base, 44).kg).toBe(45);
  });

  it("steps to the adjacent rung", () => {
    const m: Machine = { ...base, weights: { kind: "stack", values: [5, 15, 25] } };
    expect(stepMachineWeight(m, 15, 1)).toBe(25);
    expect(stepMachineWeight(m, 15, -1)).toBe(5);
    expect(stepMachineWeight(m, 25, 1)).toBe(25); // clamps at top
  });
});
