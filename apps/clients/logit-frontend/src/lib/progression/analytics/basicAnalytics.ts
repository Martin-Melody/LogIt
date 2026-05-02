import type { AnalyticsPlugin, AnalyticsInput, AnalyticsOutput } from "$lib/domain/analytics";

// Epley formula: estimated 1RM = weight × (1 + reps / 30)
function epley1RM(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

function compute(input: AnalyticsInput): AnalyticsOutput {
  const maxWeightPoints = [];
  const volumePoints = [];
  const estimated1RMPoints = [];

  let allTimeMax = 0;
  let allTimeBest1RM = 0;
  let allTimeVolume = 0;

  for (const entry of input.history) {
    const workingSets = entry.sets.filter(
      (s) => (s.setType === "normal" || !s.setType) && s.completed !== false,
    );
    if (workingSets.length === 0) continue;

    const maxWeight = Math.max(...workingSets.map((s) => s.weight));
    const totalVolume = workingSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const best1RM = Math.max(...workingSets.map((s) => epley1RM(s.weight, s.reps)));

    if (maxWeight > allTimeMax) allTimeMax = maxWeight;
    if (best1RM > allTimeBest1RM) allTimeBest1RM = best1RM;
    allTimeVolume += totalVolume;

    maxWeightPoints.push({ date: entry.performedAtMs, value: maxWeight });
    volumePoints.push({ date: entry.performedAtMs, value: totalVolume });
    estimated1RMPoints.push({ date: entry.performedAtMs, value: Math.round(best1RM * 10) / 10 });
  }

  const sessionCount = maxWeightPoints.length;

  const recentMax = maxWeightPoints.at(-1)?.value ?? 0;
  const prevMax = maxWeightPoints.at(-2)?.value ?? recentMax;
  const trend = recentMax - prevMax;
  const trendLabel =
    trend > 0 ? `+${trend}kg` : trend < 0 ? `${trend}kg` : "steady";

  return {
    metrics: [
      { id: "max_weight", value: allTimeMax, formatted: `${allTimeMax}kg` },
      { id: "estimated_1rm", value: Math.round(allTimeBest1RM * 10) / 10, formatted: `${Math.round(allTimeBest1RM * 10) / 10}kg` },
      { id: "total_sessions", value: sessionCount, formatted: String(sessionCount) },
      { id: "total_volume", value: allTimeVolume, formatted: `${(allTimeVolume / 1000).toFixed(1)}t` },
    ],
    series: [
      { metricId: "max_weight", label: "Max weight", points: maxWeightPoints },
      { metricId: "total_volume", label: "Session volume", points: volumePoints },
      { metricId: "estimated_1rm", label: "Est. 1RM", points: estimated1RMPoints },
    ],
    label: sessionCount > 0 ? `${allTimeMax}kg best · ${trendLabel} last session` : undefined,
    insights:
      trend > 0
        ? [`Up ${trend}kg from last session`]
        : trend < 0
          ? [`Down ${Math.abs(trend)}kg from last session`]
          : undefined,
  };
}

export const basicAnalytics: AnalyticsPlugin = {
  id: "basic-analytics",
  name: "Basic Analytics",
  description: "Max weight, session volume, and estimated 1RM trends over time.",
  author: "logit",
  metricDefinitions: [
    { id: "max_weight", label: "Max weight", unit: "kg", higherIsBetter: true },
    { id: "estimated_1rm", label: "Est. 1RM", unit: "kg", higherIsBetter: true },
    { id: "total_sessions", label: "Sessions", higherIsBetter: true },
    { id: "total_volume", label: "Total volume", unit: "t", higherIsBetter: true },
  ],
  compute,
};
