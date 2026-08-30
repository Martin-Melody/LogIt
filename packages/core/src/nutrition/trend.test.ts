import { describe, expect, it } from "vitest";
import type { WeightEntry } from "../domain/nutrition";
import { projectGoalDate, smoothWeightSeries } from "./trend";

let seq = 0;
function entry(dateIso: string, weightKg: number): WeightEntry {
  seq += 1;
  return { id: `wt_${seq}`, dateIso, weightKg, createdAtMs: seq, updatedAtMs: seq };
}

/** n daily entries starting at startIso, weight = start + i*perDay + noise(i). */
function series(startIso: string, n: number, start: number, perDay: number, noise = 0) {
  const out: WeightEntry[] = [];
  const base = Date.parse(startIso);
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    const wobble = noise ? (i % 2 === 0 ? noise : -noise) : 0;
    out.push(entry(d, start + i * perDay + wobble));
  }
  return out;
}

describe("smoothWeightSeries", () => {
  it("returns empty trend for no entries", () => {
    const t = smoothWeightSeries([]);
    expect(t.points).toEqual([]);
    expect(t.currentKg).toBeNull();
    expect(t.weeklyRateKg).toBe(0);
  });

  it("fills a daily series between first and last entry", () => {
    const t = smoothWeightSeries([entry("2026-01-01", 80), entry("2026-01-11", 80)]);
    expect(t.points).toHaveLength(11);
    expect(t.points[0]!.dateIso).toBe("2026-01-01");
    expect(t.points[10]!.dateIso).toBe("2026-01-11");
    expect(t.points[5]!.actualKg).toBeNull(); // gap day
  });

  it("smooths out daily water-weight noise", () => {
    const noisy = series("2026-01-01", 30, 80, 0, 1); // flat 80 ±1 kg
    const t = smoothWeightSeries(noisy);
    expect(t.currentKg).toBeGreaterThan(79.4);
    expect(t.currentKg).toBeLessThan(80.6);
    expect(Math.abs(t.weeklyRateKg)).toBeLessThan(0.15);
  });

  it("recovers a steady downward rate", () => {
    // -0.1 kg/day == -0.7 kg/week
    const losing = series("2026-01-01", 40, 85, -0.1);
    const t = smoothWeightSeries(losing);
    expect(t.weeklyRateKg).toBeGreaterThan(-0.75);
    expect(t.weeklyRateKg).toBeLessThan(-0.6);
  });

  it("averages multiple entries on the same day", () => {
    const t = smoothWeightSeries([
      entry("2026-01-01", 80),
      entry("2026-01-01", 82),
      entry("2026-01-02", 81),
    ]);
    expect(t.points[0]!.actualKg).toBe(81);
  });
});

describe("projectGoalDate", () => {
  it("projects an ETA when the trend points at the target", () => {
    const p = projectGoalDate({
      currentKg: 85,
      targetKg: 80,
      weeklyRateKg: -0.5,
      now: new Date("2026-01-01T12:00:00"), // local noon -> +70d stays on the same local date
    });
    expect(p.weeksRemaining).toBe(10);
    expect(p.etaIso).toBe("2026-03-12");
  });

  it("returns null when the trend moves away from the target", () => {
    const p = projectGoalDate({ currentKg: 85, targetKg: 80, weeklyRateKg: 0.3 });
    expect(p.etaIso).toBeNull();
    expect(p.weeksRemaining).toBeNull();
  });

  it("returns null for a flat trend", () => {
    expect(projectGoalDate({ currentKg: 85, targetKg: 80, weeklyRateKg: 0 }).etaIso).toBeNull();
  });

  it("returns null with no target", () => {
    expect(
      projectGoalDate({ currentKg: 85, targetKg: undefined, weeklyRateKg: -0.5 }).etaIso,
    ).toBeNull();
  });
});
