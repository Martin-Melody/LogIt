import type {
  NutritionAnalyticsInput,
  NutritionAnalyticsOutput,
  NutritionAnalyticsPlugin,
} from "../../domain/nutritionAnalytics";
import { dayTotals } from "../../domain/nutrition";
import { calorieAdherenceScore } from "../adherence";
import { smoothWeightSeries } from "../trend";

// The built-in nutrition analytics: weekly/monthly calorie averages, calorie adherence,
// average protein, and the weight trend over the window — plus a couple of plain-language
// insights. Community plugins implement the same contract (docs/plugin-bundle-format.md).

const DAY_MS = 86_400_000;

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function isoToMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export const basicNutritionAnalytics: NutritionAnalyticsPlugin = {
  id: "basic-nutrition-analytics",
  name: "Basic insights",
  description:
    "Calorie averages, on-target days, average protein and your weight trend over the window.",
  author: "logit",
  metricDefinitions: [
    { id: "avgKcal7", label: "Avg calories (7d)", unit: "kcal" },
    { id: "avgKcal30", label: "Avg calories (30d)", unit: "kcal" },
    { id: "adherence", label: "On-target days", unit: "%", higherIsBetter: true },
    { id: "avgProtein", label: "Avg protein", unit: "g", higherIsBetter: true },
    { id: "weightChange", label: "Weight change", unit: "kg" },
    { id: "weeklyRate", label: "Weekly rate", unit: "kg/wk" },
  ],

  compute(input: NutritionAnalyticsInput): NutritionAnalyticsOutput {
    const logged = input.days
      .map((d) => ({ dateIso: d.dateIso, totals: dayTotals(d) }))
      .filter((x) => x.totals.kcal > 0)
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    const cutoff = (days: number) =>
      new Date(input.now - days * DAY_MS).toISOString().slice(0, 10);
    const in7 = logged.filter((x) => x.dateIso >= cutoff(7));
    const in30 = logged.filter((x) => x.dateIso >= cutoff(30));

    const avgKcal7 = Math.round(mean(in7.map((x) => x.totals.kcal)));
    const avgKcal30 = Math.round(mean(in30.map((x) => x.totals.kcal)));
    const avgProtein = Math.round(mean(in30.map((x) => x.totals.proteinG)));

    const targetKcal = input.targets?.kcal ?? 0;
    const adherence =
      calorieAdherenceScore(
        in30.map((x) => ({ consumedKcal: x.totals.kcal, targetKcal })),
      ) ?? null;

    const trend = smoothWeightSeries(input.weightEntries);
    const inRange = trend.points.filter(
      (p) => p.dateIso >= input.range.startIso && p.dateIso <= input.range.endIso,
    );
    const weightChange =
      inRange.length >= 2
        ? Math.round((inRange[inRange.length - 1]!.smoothedKg - inRange[0]!.smoothedKg) * 10) / 10
        : 0;

    const metrics = [
      { id: "avgKcal7", value: avgKcal7, formatted: `${avgKcal7} kcal` },
      { id: "avgKcal30", value: avgKcal30, formatted: `${avgKcal30} kcal` },
      {
        id: "adherence",
        value: adherence ?? 0,
        formatted: adherence == null ? "—" : `${adherence}%`,
      },
      { id: "avgProtein", value: avgProtein, formatted: `${avgProtein} g` },
      {
        id: "weightChange",
        value: weightChange,
        formatted: `${weightChange > 0 ? "+" : ""}${weightChange} kg`,
      },
      {
        id: "weeklyRate",
        value: Math.round(trend.weeklyRateKg * 100) / 100,
        formatted: `${trend.weeklyRateKg > 0 ? "+" : ""}${trend.weeklyRateKg.toFixed(2)} kg/wk`,
      },
    ];

    const series = [
      {
        metricId: "kcal",
        label: "Calories",
        points: logged.map((x) => ({ date: isoToMs(x.dateIso), value: Math.round(x.totals.kcal) })),
      },
      {
        metricId: "weight",
        label: "Weight (smoothed)",
        points: inRange.map((p) => ({
          date: isoToMs(p.dateIso),
          value: Math.round(p.smoothedKg * 100) / 100,
        })),
      },
    ];

    const insights: string[] = [];
    if (adherence != null && adherence >= 85) {
      insights.push("You're hitting your calorie target on most days — that consistency is the biggest lever.");
    } else if (adherence != null && adherence < 60) {
      insights.push("Calorie intake is swinging a lot day to day. Steadier days make the trend easier to read.");
    }
    const goalType = input.goal?.goalType;
    if (goalType && goalType !== "maintain" && Math.abs(trend.weeklyRateKg) < 0.1 && logged.length >= 10) {
      insights.push("Weight's been essentially flat this window — the target may need a bigger adjustment.");
    } else if (
      goalType === "lose" && trend.weeklyRateKg < -0.1 ||
      goalType === "gain" && trend.weeklyRateKg > 0.1
    ) {
      insights.push(`On track — ${Math.abs(trend.weeklyRateKg).toFixed(2)} kg/week in the right direction.`);
    }

    return { metrics, series, insights, label: "Basic insights" };
  },
};
