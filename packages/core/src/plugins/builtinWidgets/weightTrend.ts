import type { WidgetInput, WidgetPlugin, WidgetView } from "../widgetView.js";

export const weightTrendWidget: WidgetPlugin = {
  id: "weight-trend",
  name: "Weight Trend",
  description: "Smoothed bodyweight trend and weekly rate.",
  needs: ["bodyweight"],

  compute(input: WidgetInput): WidgetView {
    const bw = input.bodyweight;
    const unit = input.prefs.weightUnit;
    const toDisplay = (kg: number) => (unit === "lbs" ? kg * 2.2046226 : kg);
    const fmt = (kg: number) => `${toDisplay(kg).toFixed(1)} ${unit}`;

    if (!bw || bw.trendPoints.length < 2) {
      return {
        title: "Weight Trend",
        body: [],
        empty: {
          text: "Log your weight a few times to track the trend.",
          action: { navigate: "/nutrition/weight" },
        },
      };
    }

    const rateKg = bw.weeklyRateKg ?? 0;
    const rate =
      Math.abs(rateKg) < 0.05
        ? "steady"
        : `${rateKg > 0 ? "+" : ""}${toDisplay(rateKg).toFixed(2)} ${unit}/wk`;

    const points = bw.trendPoints.map((p, i) => ({ x: i, y: p.kg }));

    return {
      title: "Weight Trend",
      body: [
        {
          kind: "stat-grid",
          stats: [
            { label: "Current", value: bw.currentKg != null ? fmt(bw.currentKg) : "—" },
            { label: "Rate", value: rate },
          ],
        },
        {
          kind: "line",
          points,
          reference: bw.targetKg,
        },
      ],
      headerAction: { label: "Log weight", action: { navigate: "/nutrition/weight" } },
      action: { navigate: "/nutrition/weight" },
    };
  },
};
