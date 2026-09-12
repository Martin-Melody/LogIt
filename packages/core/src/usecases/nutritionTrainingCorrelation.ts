import { getExercises, getSessionVolumeKg, type WorkoutSession } from "../domain/workout";
import { dayTotals, localDateIso, type DiaryDay } from "../domain/nutrition";
import type { Reasoning, ReasoningConfidence } from "../domain/reasoning";
import type { WorkoutRepo } from "../data/workoutRepo";
import type { NutritionRepo } from "../data/nutritionRepo";

/**
 * §9 (adaptive-progression-engine.md) — nutrition x training correlation.
 * Martin's idea: nutrition logging and workout logging already live in the
 * same app, so there could be real signal correlating what someone ate
 * around a session against how that session went. Architecturally the same
 * "learn from the user's own history, show your work, be honest about
 * confidence" machinery as §3-5, applied to a second data source.
 *
 * Deliberately NOISIER than §4/§5 (logging compliance varies session to
 * session; sleep/stress/training-load confounds exist nutrition data alone
 * can't separate out) — both correlations below are framed as a *hypothesis
 * being tested*, never a flat claim, and gated on more samples than §5's
 * volume correlation for exactly that reason.
 *
 * Deliberately simple session-outcome measure: total session volume
 * (Σ reps × weight) vs. the immediately preceding session's — not a
 * per-exercise e1RM trend like §4/§5, since AnalyticsDataPoint doesn't carry
 * a session's actual *start* time (only performedAtMs, endedAtMs-biased),
 * and meal-timing precision needs the real start. Coarser, but self-
 * contained and honest about what it's measuring.
 */
const MIN_SESSIONS_FOR_CORRELATION = 20;
const MIN_SAMPLES_PER_BUCKET = 6;
const HIGH_CONFIDENCE_SAMPLES_PER_BUCKET = 12;
const IMPROVE_RATE_DIFF_THRESHOLD = 0.2; // 20 percentage points — stricter than §5's 15
const MEAL_TIMING_WINDOW_MS: [number, number] = [30 * 60_000, 60 * 60_000]; // 30-60 min before
const CARB_THRESHOLD_G = 20; // a meaningful carb-containing item, not a garnish

export type NutritionCorrelationBucket = {
  sampleCount: number;
  improveRate: number; // 0-1
};

export type DayLevelProteinCorrelation = {
  direction: "higher" | "lower"; // which side of thresholdProteinG correlates with more improved sessions
  thresholdProteinG: number;
  above: NutritionCorrelationBucket;
  below: NutritionCorrelationBucket;
};

export type MealTimingCarbCorrelation = {
  windowMinutesBefore: [number, number];
  withCarbs: NutritionCorrelationBucket;
  withoutCarbs: NutritionCorrelationBucket;
};

export type NutritionTrainingCorrelationResult = {
  dayLevelProtein?: DayLevelProteinCorrelation;
  mealTimingCarbs?: MealTimingCarbCorrelation;
  dayLevelReasoning: Reasoning;
  mealTimingReasoning: Reasoning;
};

type SessionSample = {
  session: WorkoutSession;
  improved: boolean;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function buildSessionSamples(sessions: WorkoutSession[]): SessionSample[] {
  const trainable = sessions
    .filter((s) => !s.excludeFromProgression && getExercises(s).length > 0)
    .sort((a, b) => (a.startedAtMs ?? 0) - (b.startedAtMs ?? 0));

  const samples: SessionSample[] = [];
  for (let i = 1; i < trainable.length; i++) {
    const prevVol = getSessionVolumeKg(trainable[i - 1]!);
    const vol = getSessionVolumeKg(trainable[i]!);
    if (prevVol <= 0 || vol <= 0) continue;
    samples.push({ session: trainable[i]!, improved: vol > prevVol });
  }
  return samples;
}

function bucketRate(samples: SessionSample[]): NutritionCorrelationBucket {
  const improved = samples.filter((s) => s.improved).length;
  return { sampleCount: samples.length, improveRate: samples.length > 0 ? improved / samples.length : 0 };
}

export async function getNutritionTrainingCorrelation(
  deps: { workoutRepo: WorkoutRepo; nutritionRepo: NutritionRepo },
): Promise<NutritionTrainingCorrelationResult> {
  const sessions = await deps.workoutRepo.listAllSessions();
  const samples = buildSessionSamples(sessions);

  if (samples.length < MIN_SESSIONS_FOR_CORRELATION) {
    const notEnough: Reasoning = {
      inputs: { sessionsWithASample: samples.length, minSessionsRequired: MIN_SESSIONS_FOR_CORRELATION },
      computed: {},
      confidence: "low",
      verdict: "not enough sessions yet to test a nutrition correlation",
    };
    return { dayLevelReasoning: notEnough, mealTimingReasoning: notEnough };
  }

  const oldestMs = Math.min(...samples.map((s) => s.session.startedAtMs));
  const newestMs = Math.max(...samples.map((s) => s.session.startedAtMs));
  const days = await deps.nutritionRepo.listDaysInRange(
    localDateIso(new Date(oldestMs)),
    localDateIso(new Date(newestMs)),
  );
  const dayByIso = new Map<string, DiaryDay>(days.filter((d) => !d.deletedAtMs).map((d) => [d.dateIso, d]));

  // ── Day-level: median-split on that day's total protein ──────────────────
  const proteinBySample = samples.map((s) => {
    const day = dayByIso.get(localDateIso(new Date(s.session.startedAtMs)));
    return day ? dayTotals(day).proteinG : undefined;
  });
  const withProtein = samples.filter((_, i) => proteinBySample[i] !== undefined);

  let dayLevelProtein: DayLevelProteinCorrelation | undefined;
  let dayLevelConfidence: ReasoningConfidence = "low";
  let dayLevelVerdict = "not enough logged-nutrition days yet to test a correlation";
  let dayAbove: SessionSample[] = [];
  let dayBelow: SessionSample[] = [];

  if (withProtein.length >= MIN_SESSIONS_FOR_CORRELATION) {
    const proteinValues = proteinBySample.filter((v): v is number => v !== undefined);
    const thresholdProteinG = median(proteinValues);
    dayAbove = [];
    dayBelow = [];
    samples.forEach((s, i) => {
      const p = proteinBySample[i];
      if (p === undefined) return;
      (p >= thresholdProteinG ? dayAbove : dayBelow).push(s);
    });

    if (dayAbove.length >= MIN_SAMPLES_PER_BUCKET && dayBelow.length >= MIN_SAMPLES_PER_BUCKET) {
      const above = bucketRate(dayAbove);
      const below = bucketRate(dayBelow);
      const diff = above.improveRate - below.improveRate;
      if (Math.abs(diff) >= IMPROVE_RATE_DIFF_THRESHOLD) {
        dayLevelProtein = {
          direction: diff > 0 ? "higher" : "lower",
          thresholdProteinG: Math.round(thresholdProteinG),
          above,
          below,
        };
        dayLevelConfidence =
          above.sampleCount >= HIGH_CONFIDENCE_SAMPLES_PER_BUCKET &&
          below.sampleCount >= HIGH_CONFIDENCE_SAMPLES_PER_BUCKET
            ? "medium" // never "high" -- see §9's extra-caution rule, always one step down from §5
            : "low";
        dayLevelVerdict = `hypothesis: sessions tend to improve more on days with ${diff > 0 ? "≥" : "<"}${dayLevelProtein.thresholdProteinG}g protein`;
      } else {
        dayLevelVerdict = "enough data, but no clear protein-day pattern found yet";
      }
    } else {
      dayLevelVerdict = "not enough varied-protein days yet to compare";
    }
  }

  // ── Meal-timing: a qualifying carb item logged 30-60min before the session ──
  const withCarbsSamples: SessionSample[] = [];
  const withoutCarbsSamples: SessionSample[] = [];
  let sessionsWithTimingData = 0;

  for (const s of samples) {
    const day = dayByIso.get(localDateIso(new Date(s.session.startedAtMs)));
    const timedItems = day?.items.filter((it) => it.loggedAtMs !== undefined) ?? [];
    if (timedItems.length === 0) continue;
    sessionsWithTimingData++;

    const hasQualifyingCarbs = timedItems.some((it) => {
      const deltaMs = s.session.startedAtMs - it.loggedAtMs!;
      return (
        deltaMs >= MEAL_TIMING_WINDOW_MS[0] &&
        deltaMs <= MEAL_TIMING_WINDOW_MS[1] &&
        it.computed.carbsG >= CARB_THRESHOLD_G
      );
    });
    (hasQualifyingCarbs ? withCarbsSamples : withoutCarbsSamples).push(s);
  }

  let mealTimingCarbs: MealTimingCarbCorrelation | undefined;
  let mealTimingConfidence: ReasoningConfidence = "low";
  let mealTimingVerdict = "not enough precisely-timed logging yet to test meal timing";

  if (sessionsWithTimingData >= MIN_SESSIONS_FOR_CORRELATION) {
    if (
      withCarbsSamples.length >= MIN_SAMPLES_PER_BUCKET &&
      withoutCarbsSamples.length >= MIN_SAMPLES_PER_BUCKET
    ) {
      const withCarbs = bucketRate(withCarbsSamples);
      const withoutCarbs = bucketRate(withoutCarbsSamples);
      const diff = withCarbs.improveRate - withoutCarbs.improveRate;
      if (Math.abs(diff) >= IMPROVE_RATE_DIFF_THRESHOLD) {
        mealTimingCarbs = { windowMinutesBefore: [30, 60], withCarbs, withoutCarbs };
        mealTimingConfidence =
          withCarbs.sampleCount >= HIGH_CONFIDENCE_SAMPLES_PER_BUCKET &&
          withoutCarbs.sampleCount >= HIGH_CONFIDENCE_SAMPLES_PER_BUCKET
            ? "medium"
            : "low";
        mealTimingVerdict =
          diff > 0
            ? "hypothesis: sessions tend to improve more when you ate carbs 30-60min before training"
            : "hypothesis: sessions tend to improve less when you ate carbs 30-60min before training";
      } else {
        mealTimingVerdict = "enough data, but no clear meal-timing pattern found yet";
      }
    } else {
      mealTimingVerdict = "not enough varied meal-timing sessions yet to compare";
    }
  }

  return {
    dayLevelProtein,
    mealTimingCarbs,
    dayLevelReasoning: {
      inputs: {
        totalSessionSamples: samples.length,
        sessionsWithLoggedProtein: withProtein.length,
        daySamplesAbove: dayAbove.length,
        daySamplesBelow: dayBelow.length,
      },
      computed: dayLevelProtein
        ? {
            thresholdProteinG: dayLevelProtein.thresholdProteinG,
            improveRateAbovePct: Math.round(dayLevelProtein.above.improveRate * 100),
            improveRateBelowPct: Math.round(dayLevelProtein.below.improveRate * 100),
          }
        : {},
      confidence: dayLevelConfidence,
      verdict: dayLevelVerdict,
    },
    mealTimingReasoning: {
      inputs: {
        totalSessionSamples: samples.length,
        sessionsWithPreciseTiming: sessionsWithTimingData,
        withCarbsSamples: withCarbsSamples.length,
        withoutCarbsSamples: withoutCarbsSamples.length,
      },
      computed: mealTimingCarbs
        ? {
            improveRateWithCarbsPct: Math.round(mealTimingCarbs.withCarbs.improveRate * 100),
            improveRateWithoutCarbsPct: Math.round(mealTimingCarbs.withoutCarbs.improveRate * 100),
          }
        : {},
      confidence: mealTimingConfidence,
      verdict: mealTimingVerdict,
    },
  };
}
