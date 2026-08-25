import type { AnalyticsPlugin, AnalyticsInput, AnalyticsOutput } from "../../domain/analytics";

// Epley formula: estimated 1RM = weight × (1 + reps / 30)
function epley1RM(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

function computeNormal(input: AnalyticsInput): AnalyticsOutput {
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
  const trendLabel = trend > 0 ? `+${trend}kg` : trend < 0 ? `${trend}kg` : "steady";

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

// For assisted exercises, lower assistance weight = more strength.
// Track minimum assistance (best session), total reps, and the reduction trend.
function computeAssisted(input: AnalyticsInput): AnalyticsOutput {
  const assistPoints = [];
  const repsPoints = [];

  let lowestAssist = Infinity;
  let allTimeReps = 0;

  for (const entry of input.history) {
    const workingSets = entry.sets.filter(
      (s) => (s.setType === "normal" || !s.setType) && s.completed !== false,
    );
    if (workingSets.length === 0) continue;

    const minAssist = Math.min(...workingSets.map((s) => s.weight));
    const totalReps = workingSets.reduce((sum, s) => sum + s.reps, 0);

    if (minAssist < lowestAssist) lowestAssist = minAssist;
    allTimeReps += totalReps;

    assistPoints.push({ date: entry.performedAtMs, value: minAssist });
    repsPoints.push({ date: entry.performedAtMs, value: totalReps });
  }

  const sessionCount = assistPoints.length;
  if (sessionCount === 0) {
    return { metrics: [], series: [], label: undefined };
  }

  const recentAssist = assistPoints.at(-1)!.value;
  const prevAssist = assistPoints.at(-2)?.value ?? recentAssist;
  const trend = recentAssist - prevAssist; // negative = progress (less assistance)
  const trendLabel =
    trend < 0 ? `−${Math.abs(trend)}kg assist` : trend > 0 ? `+${trend}kg assist` : "steady";

  return {
    metrics: [
      { id: "min_assist", value: lowestAssist === Infinity ? 0 : lowestAssist, formatted: `${lowestAssist === Infinity ? 0 : lowestAssist}kg` },
      { id: "total_sessions", value: sessionCount, formatted: String(sessionCount) },
      { id: "total_reps", value: allTimeReps, formatted: String(allTimeReps) },
    ],
    series: [
      { metricId: "min_assist", label: "Assistance weight", points: assistPoints },
      { metricId: "total_reps", label: "Session reps", points: repsPoints },
    ],
    label: sessionCount > 0 ? `${lowestAssist === Infinity ? 0 : lowestAssist}kg assist best · ${trendLabel} last session` : undefined,
    insights:
      trend < 0
        ? [`Reduced assistance by ${Math.abs(trend)}kg last session`]
        : trend > 0
          ? [`Assistance increased by ${trend}kg last session`]
          : undefined,
  };
}

// For bodyweight exercises, weight may be 0 (pure BW) or extra load on top.
// Track reps (always meaningful) and extra load where available.
function computeBodyweight(input: AnalyticsInput): AnalyticsOutput {
  const maxRepsPoints = [];
  const extraLoadPoints = [];
  const totalRepsPoints = [];

  let allTimeMaxReps = 0;
  let allTimeReps = 0;
  let hasExtraLoad = false;

  for (const entry of input.history) {
    const workingSets = entry.sets.filter(
      (s) => (s.setType === "normal" || !s.setType) && s.completed !== false,
    );
    if (workingSets.length === 0) continue;

    const maxReps = Math.max(...workingSets.map((s) => s.reps));
    const totalReps = workingSets.reduce((sum, s) => sum + s.reps, 0);
    const maxExtraLoad = Math.max(...workingSets.map((s) => s.weight));

    if (maxReps > allTimeMaxReps) allTimeMaxReps = maxReps;
    allTimeReps += totalReps;
    if (maxExtraLoad > 0) hasExtraLoad = true;

    maxRepsPoints.push({ date: entry.performedAtMs, value: maxReps });
    totalRepsPoints.push({ date: entry.performedAtMs, value: totalReps });
    if (maxExtraLoad > 0) {
      extraLoadPoints.push({ date: entry.performedAtMs, value: maxExtraLoad });
    }
  }

  const sessionCount = maxRepsPoints.length;
  if (sessionCount === 0) {
    return { metrics: [], series: [], label: undefined };
  }

  const recentReps = maxRepsPoints.at(-1)!.value;
  const prevReps = maxRepsPoints.at(-2)?.value ?? recentReps;
  const repTrend = recentReps - prevReps;
  const trendLabel = repTrend > 0 ? `+${repTrend} reps` : repTrend < 0 ? `${repTrend} reps` : "steady";

  const metrics = [
    { id: "max_reps", value: allTimeMaxReps, formatted: `${allTimeMaxReps} reps` },
    { id: "total_sessions", value: sessionCount, formatted: String(sessionCount) },
    { id: "total_reps", value: allTimeReps, formatted: String(allTimeReps) },
  ];

  if (hasExtraLoad) {
    const bestLoad = Math.max(...extraLoadPoints.map((p) => p.value));
    metrics.push({ id: "max_extra_load", value: bestLoad, formatted: `+${bestLoad}kg` });
  }

  const series = [
    { metricId: "max_reps", label: "Max reps (set)", points: maxRepsPoints },
    { metricId: "total_reps", label: "Session reps", points: totalRepsPoints },
  ];

  if (hasExtraLoad) {
    series.push({ metricId: "max_extra_load", label: "Extra load", points: extraLoadPoints });
  }

  return {
    metrics,
    series,
    label: sessionCount > 0 ? `${allTimeMaxReps} rep best · ${trendLabel} last session` : undefined,
    insights:
      repTrend > 0
        ? [`Up ${repTrend} reps from last session`]
        : repTrend < 0
          ? [`Down ${Math.abs(repTrend)} reps from last session`]
          : undefined,
  };
}

function compute(input: AnalyticsInput): AnalyticsOutput {
  switch (input.exercise.exerciseType) {
    case "assisted":   return computeAssisted(input);
    case "bodyweight": return computeBodyweight(input);
    default:           return computeNormal(input);
  }
}

export const basicAnalytics: AnalyticsPlugin = {
  id: "basic-analytics",
  name: "Basic Analytics",
  description: "Max weight, session volume, and estimated 1RM trends over time.",
  author: "logit",
  metricDefinitions: [
    { id: "max_weight",     label: "Max weight",    unit: "kg",   higherIsBetter: true  },
    { id: "estimated_1rm",  label: "Est. 1RM",      unit: "kg",   higherIsBetter: true  },
    { id: "min_assist",     label: "Min assistance", unit: "kg",   higherIsBetter: false },
    { id: "max_reps",       label: "Max reps",                     higherIsBetter: true  },
    { id: "max_extra_load", label: "Extra load",    unit: "kg",   higherIsBetter: true  },
    { id: "total_sessions", label: "Sessions",                     higherIsBetter: true  },
    { id: "total_volume",   label: "Total volume",  unit: "t",    higherIsBetter: true  },
    { id: "total_reps",     label: "Total reps",                   higherIsBetter: true  },
  ],
  compute,
};
