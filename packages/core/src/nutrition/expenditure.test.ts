import { describe, expect, it } from "vitest";
import type { WeightEntry } from "../domain/nutrition";
import { blendExpenditure, estimateExpenditure } from "./expenditure";

let seq = 0;
function weightSeries(startIso: string, n: number, start: number, perDay: number): WeightEntry[] {
  const out: WeightEntry[] = [];
  const base = Date.parse(`${startIso}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    seq += 1;
    out.push({
      id: `wt_${seq}`,
      dateIso: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
      weightKg: start + i * perDay,
      createdAtMs: seq,
      updatedAtMs: seq,
    });
  }
  return out;
}

function intakeSeries(startIso: string, n: number, kcal: number) {
  const base = Date.parse(`${startIso}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    dateIso: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    kcal,
  }));
}

describe("estimateExpenditure", () => {
  it("recovers TDEE from intake + weight change via energy balance", () => {
    // Eating 2000 kcal/day, losing 0.5 kg/week -> true maintenance ~2550.
    const weights = weightSeries("2026-01-01", 21, 80, -0.5 / 7);
    const intake = intakeSeries("2026-01-01", 21, 2000);
    const est = estimateExpenditure({ weightEntries: weights, dailyIntakeKcal: intake })!;
    expect(est).not.toBeNull();
    expect(est.tdee).toBeGreaterThan(2450);
    expect(est.tdee).toBeLessThan(2650);
    expect(est.confidence).toBeGreaterThan(0.8);
  });

  it("recovers a maintenance TDEE when weight is stable", () => {
    const weights = weightSeries("2026-01-01", 21, 75, 0);
    const intake = intakeSeries("2026-01-01", 21, 2400);
    const est = estimateExpenditure({ weightEntries: weights, dailyIntakeKcal: intake })!;
    expect(est.tdee).toBeGreaterThan(2300);
    expect(est.tdee).toBeLessThan(2500);
  });

  it("returns null without enough weight history", () => {
    expect(
      estimateExpenditure({
        weightEntries: weightSeries("2026-01-01", 4, 80, -0.05),
        dailyIntakeKcal: intakeSeries("2026-01-01", 4, 2000),
      }),
    ).toBeNull();
  });

  it("returns null without enough logged intake days", () => {
    expect(
      estimateExpenditure({
        weightEntries: weightSeries("2026-01-01", 21, 80, -0.05),
        dailyIntakeKcal: intakeSeries("2026-01-01", 3, 2000),
      }),
    ).toBeNull();
  });
});

describe("blendExpenditure", () => {
  it("returns the calculated figure when there is no estimate", () => {
    expect(blendExpenditure(2500, null)).toBe(2500);
  });

  it("weights by confidence", () => {
    expect(blendExpenditure(2500, { tdee: 2700, confidence: 1 })).toBeCloseTo(2700, 0);
    expect(blendExpenditure(2500, { tdee: 2700, confidence: 0.5 })).toBeCloseTo(2600, 0);
  });

  it("clamps a wild estimate to ±35% of the calculated figure", () => {
    expect(blendExpenditure(2500, { tdee: 9000, confidence: 1 })).toBeCloseTo(3375, 0);
    expect(blendExpenditure(2500, { tdee: 500, confidence: 1 })).toBeCloseTo(1625, 0);
  });
});
