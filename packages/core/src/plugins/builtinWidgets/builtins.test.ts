import { describe, expect, it } from "vitest";
import type { WidgetInput } from "../widgetView";
import { recentSessionsWidget } from "./recentSessions";
import { activityWidget } from "./activity";
import { progressionWidget } from "./progression";
import { todaysNutritionWidget } from "./todaysNutrition";
import { weightTrendWidget } from "./weightTrend";

const NOW = Date.UTC(2026, 5, 15, 12);
const base: WidgetInput = { now: NOW, prefs: { weightUnit: "kg" } };

describe("recentSessionsWidget", () => {
  it("lists finished sessions newest-first with a top set", () => {
    const view = recentSessionsWidget.compute({
      ...base,
      workouts: [
        { id: "a", startedAtMs: NOW - 3600_000, endedAtMs: NOW - 1800_000, exercises: [{ name: "Bench", sets: [{ weight: 60, reps: 5 }, { weight: 80, reps: 3 }] }] },
      ],
    });
    const list = view.body[0];
    expect(list.kind).toBe("list");
    if (list.kind === "list") {
      expect(list.items[0].sublabel).toBe("Top: Bench 3×80");
      expect(list.items[0].action).toEqual({ navigate: "/sessions/a" });
    }
  });

  it("is empty with no sessions", () => {
    expect(recentSessionsWidget.compute({ ...base, workouts: [] }).empty).toBeTruthy();
  });
});

describe("activityWidget", () => {
  it("puts this month's worked days into a calendar node", () => {
    const day10 = Date.UTC(2026, 5, 10, 18);
    const view = activityWidget.compute({
      ...base,
      workouts: [{ id: "w", startedAtMs: day10, endedAtMs: day10, exercises: [] }],
    });
    const cal = view.body[0];
    expect(cal.kind).toBe("calendar-heatmap");
    if (cal.kind === "calendar-heatmap") {
      expect(cal.month).toBe("2026-06");
      expect(cal.days).toEqual([{ day: 10, value: 1, action: { navigate: "/sessions/w" } }]);
    }
  });
});

describe("progressionWidget", () => {
  it("formats targets into a list", () => {
    const view = progressionWidget.compute({
      ...base,
      progressionTargets: [{ exerciseName: "Squat", target: "3×5 @ 100kg" }],
    });
    const list = view.body[0];
    if (list.kind === "list") expect(list.items[0]).toEqual({ label: "Squat", trailing: "3×5 @ 100kg" });
  });
});

describe("todaysNutritionWidget", () => {
  it("builds calorie + macro bars and a kcal-left subtitle", () => {
    const view = todaysNutritionWidget.compute({
      ...base,
      nutrition: {
        hasGoal: true,
        targetKcal: 2000,
        consumedKcal: 1200,
        targetMacros: { proteinG: 150, carbsG: 200, fatG: 60 },
        consumedMacros: { proteinG: 90, carbsG: 120, fatG: 40 },
      },
    });
    expect(view.subtitle).toContain("800 kcal left");
    const bar = view.body[0];
    if (bar.kind === "bar") {
      expect(bar.bars).toHaveLength(4);
      expect(bar.bars[1]).toMatchObject({ label: "Protein", tone: "protein", sublabel: "90 g / 150 g" });
    }
  });

  it("is empty without a goal", () => {
    expect(todaysNutritionWidget.compute({ ...base, nutrition: { hasGoal: false } }).empty).toBeTruthy();
  });
});

describe("weightTrendWidget", () => {
  it("shows current + rate stats and a line", () => {
    const view = weightTrendWidget.compute({
      ...base,
      bodyweight: {
        currentKg: 80,
        weeklyRateKg: -0.3,
        targetKg: 75,
        trendPoints: [
          { dateIso: "2026-06-01", kg: 81 },
          { dateIso: "2026-06-08", kg: 80.5 },
          { dateIso: "2026-06-15", kg: 80 },
        ],
      },
    });
    expect(view.body[0].kind).toBe("stat-grid");
    expect(view.body[1].kind).toBe("line");
    if (view.body[1].kind === "line") expect(view.body[1].reference).toBe(75);
  });

  it("needs at least two points", () => {
    expect(
      weightTrendWidget.compute({ ...base, bodyweight: { trendPoints: [{ dateIso: "x", kg: 80 }] } }).empty,
    ).toBeTruthy();
  });
});
