import { describe, expect, it } from "vitest";
import { platesPerSide, plateLabel, DEFAULT_BARBELL } from "./plates";

describe("platesPerSide", () => {
  it("breaks a clean target into heaviest-first plates per side", () => {
    const r = platesPerSide(100); // (100-20)/2 = 40 per side
    expect(r.perSide).toEqual([25, 15]);
    expect(r.achievableKg).toBe(100);
    expect(r.shortfallKg).toBe(0);
  });

  it("returns no plates at or below the bar", () => {
    expect(platesPerSide(20).perSide).toEqual([]);
    expect(platesPerSide(15).perSide).toEqual([]);
  });

  it("reports a shortfall when plates can't reach the target", () => {
    const r = platesPerSide(101, DEFAULT_BARBELL); // 40.5/side; smallest plate 1.25
    expect(r.achievableKg).toBe(100);
    expect(r.shortfallKg).toBe(1);
  });

  it("uses micro plates when they help", () => {
    const r = platesPerSide(62.5); // 21.25/side
    expect(r.perSide).toEqual([20, 1.25]);
    expect(r.achievableKg).toBe(62.5);
  });

  it("respects a custom bar and plate set (lb-ish numbers)", () => {
    const r = platesPerSide(135, { barKg: 45, platesKg: [45, 25, 10, 5, 2.5] });
    expect(r.perSide).toEqual([45]);
    expect(r.achievableKg).toBe(135);
  });

  it("plateLabel formats", () => {
    expect(plateLabel([25, 15])).toBe("25 + 15");
    expect(plateLabel([])).toBe("bar only");
  });
});
