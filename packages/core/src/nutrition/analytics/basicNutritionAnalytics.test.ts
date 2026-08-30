import { describe, expect, it } from "vitest";
import {
  defaultNutritionGoal,
  diaryDayId,
  type DiaryDay,
  type WeightEntry,
} from "../../domain/nutrition";
import { basicNutritionAnalytics } from "./basicNutritionAnalytics";

const NOW = Date.parse("2026-06-15T12:00:00Z");
const DAY = 86_400_000;

function iso(daysAgo: number): string {
  return new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);
}

function diary(n: number, kcal: number, proteinG: number): DiaryDay[] {
  return Array.from({ length: n }, (_, i) => {
    const dateIso = iso(n - i);
    return {
      id: diaryDayId(dateIso),
      dateIso,
      createdAtMs: i,
      updatedAtMs: i,
      items: [
        {
          id: `x${i}`,
          meal: "dinner" as const,
          name: "seed",
          grams: 0,
          computed: { kcal, proteinG, carbsG: 200, fatG: 60 },
        },
      ],
    };
  });
}

function weights(n: number, start: number, perDay: number): WeightEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    dateIso: iso(n - i),
    weightKg: start + i * perDay,
    createdAtMs: i,
    updatedAtMs: i,
  }));
}

const metric = (out: ReturnType<typeof basicNutritionAnalytics.compute>, id: string) =>
  out.metrics.find((m) => m.id === id)?.value;

describe("basicNutritionAnalytics", () => {
  it("computes averages, adherence and the weight trend over the window", () => {
    const out = basicNutritionAnalytics.compute({
      days: diary(25, 2000, 150),
      weightEntries: weights(25, 84, -0.4 / 7),
      goal: { ...defaultNutritionGoal(), goalType: "lose" },
      targets: { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
      range: { startIso: iso(25), endIso: iso(0) },
      now: NOW,
    });

    expect(metric(out, "avgKcal7")).toBe(2000);
    expect(metric(out, "avgKcal30")).toBe(2000);
    expect(metric(out, "avgProtein")).toBe(150);
    expect(metric(out, "adherence")).toBe(100); // every day exactly on target
    expect(Number(metric(out, "weightChange"))).toBeLessThan(0);
    expect(Number(metric(out, "weeklyRate"))).toBeLessThan(0);

    expect(out.series.map((s) => s.metricId)).toEqual(["kcal", "weight"]);
    expect(out.insights?.length).toBeGreaterThan(0);
  });

  it("drops adherence when intake swings around the target", () => {
    const swingy = diary(20, 2000, 150).map((d, i) => ({
      ...d,
      items: [{ ...d.items[0]!, computed: { ...d.items[0]!.computed, kcal: i % 2 ? 3200 : 800 } }],
    }));
    const out = basicNutritionAnalytics.compute({
      days: swingy,
      weightEntries: [],
      goal: null,
      targets: { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
      range: { startIso: iso(20), endIso: iso(0) },
      now: NOW,
    });
    expect(Number(metric(out, "adherence"))).toBeLessThan(70);
  });

  it("handles no data without throwing", () => {
    const out = basicNutritionAnalytics.compute({
      days: [],
      weightEntries: [],
      goal: null,
      targets: null,
      range: { startIso: iso(30), endIso: iso(0) },
      now: NOW,
    });
    expect(metric(out, "avgKcal30")).toBe(0);
    expect(out.metrics.find((m) => m.id === "adherence")?.formatted).toBe("—");
  });
});
