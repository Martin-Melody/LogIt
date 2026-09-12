import type {
  MuscleGroupInsightAlgorithm,
  MuscleGroupInsightInput,
  MuscleGroupInsightOutput,
  MuscleGroupVolumeInsight,
} from "@logit/core/domain/muscleGroupInsight";
import type { ReasoningConfidence } from "@logit/core/domain/reasoning";
import { weekBucket } from "@logit/core/domain/time";

// The v1 (option A) muscle-group insight logic, shipped in PR #66 as inline
// code in getMuscleGroupInsights.ts — extracted unchanged into the built-in
// implementation of the §5 option B pluggable contract. Explicitly NOT a
// fixed formula (§5.1): the opinion here is the learning process itself —
// start from a conservative prior (silence, below MIN_WEEKS_FOR_CORRELATION),
// converge from the user's own outcomes. A plugin can swap in a static
// RP-style table behind the same contract instead.
const MIN_WEEKS_FOR_CORRELATION = 8;
const MIN_SAMPLES_PER_BUCKET = 4;
const HIGH_CONFIDENCE_SAMPLES_PER_BUCKET = 8;
const IMPROVE_RATE_DIFF_THRESHOLD = 0.15; // 15 percentage points

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function analyze(input: MuscleGroupInsightInput): MuscleGroupInsightOutput {
  const { weeks, contributingExercises } = input;
  const weeksWithData = weeks.length;

  let volumeInsight: MuscleGroupVolumeInsight | undefined;
  let confidence: ReasoningConfidence = "low";
  let verdict = "not enough weeks of varied training yet to tell what volume works best";
  let samplesAbove = 0;
  let samplesBelow = 0;
  let improvedAbove = 0;
  let improvedBelow = 0;

  if (weeksWithData >= MIN_WEEKS_FOR_CORRELATION) {
    const thresholdSets = median(weeks.map((w) => w.weightedSets));
    const weekMap = new Map(weeks.map((w) => [w.weekBucket, w.weightedSets]));

    for (const ex of contributingExercises) {
      const points = ex.seriesPoints;
      for (let i = 1; i < points.length; i++) {
        const improved = points[i]!.value > points[i - 1]!.value;
        const weekOfPoint = weekBucket(points[i]!.date);
        const setsThatWeek = weekMap.get(weekOfPoint) ?? 0;
        if (setsThatWeek >= thresholdSets) {
          samplesAbove++;
          if (improved) improvedAbove++;
        } else {
          samplesBelow++;
          if (improved) improvedBelow++;
        }
      }
    }

    if (samplesAbove >= MIN_SAMPLES_PER_BUCKET && samplesBelow >= MIN_SAMPLES_PER_BUCKET) {
      const rateAbove = improvedAbove / samplesAbove;
      const rateBelow = improvedBelow / samplesBelow;
      const diff = rateAbove - rateBelow;

      if (Math.abs(diff) >= IMPROVE_RATE_DIFF_THRESHOLD) {
        volumeInsight = {
          direction: diff > 0 ? "higher" : "lower",
          thresholdSets: Math.round(thresholdSets * 10) / 10,
          improveRateAbove: Math.round(rateAbove * 100) / 100,
          improveRateBelow: Math.round(rateBelow * 100) / 100,
        };
        confidence =
          samplesAbove >= HIGH_CONFIDENCE_SAMPLES_PER_BUCKET && samplesBelow >= HIGH_CONFIDENCE_SAMPLES_PER_BUCKET
            ? "high"
            : "medium";
        verdict = `sessions tend to improve more in weeks with ${diff > 0 ? "≥" : "<"}${volumeInsight.thresholdSets} sets`;
      } else {
        verdict = "enough data, but no clear volume pattern found yet";
      }
    } else {
      verdict = "not enough varied-volume weeks yet to compare";
    }
  }

  return {
    volumeInsight,
    nextState: input.state,
    reasoning: {
      inputs: {
        weeksWithData,
        contributingExerciseCount: contributingExercises.length,
        volumeCorrelationSamplesAbove: samplesAbove,
        volumeCorrelationSamplesBelow: samplesBelow,
        minWeeksRequired: MIN_WEEKS_FOR_CORRELATION,
      },
      computed: {
        ...(volumeInsight
          ? {
              thresholdSets: volumeInsight.thresholdSets,
              improveRateAbovePct: Math.round(volumeInsight.improveRateAbove * 100),
              improveRateBelowPct: Math.round(volumeInsight.improveRateBelow * 100),
            }
          : {}),
      },
      confidence,
      verdict,
    },
  };
}

export const learnedMuscleGroupInsight: MuscleGroupInsightAlgorithm = {
  id: "learned-muscle-group-insight",
  name: "Learned (personalized)",
  description:
    "Learns your personal sweet spot per muscle group from your own training history — a median-split correlation between weekly volume and session-over-session improvement, silent until there's real support for a claim.",
  author: "Logit",
  defaultState: null,
  analyze,
};
