import type { ProgressionAlgorithm, ProgressionInput, ProgressionOutput, PrecedingExercise, SuggestedSet, ExerciseHistoryEntry, AlgorithmPreferencesField } from "@logit/core/domain/progression";
import { classifyTrend } from "@logit/core/domain/progression";
import type { MuscleGroup } from "@logit/core/domain/exercise";
import type { Reasoning, ReasoningConfidence } from "@logit/core/domain/reasoning";
import { estimated1RM } from "@logit/core/domain/oneRepMax";
import { nowMs } from "@logit/core/domain/time";

// A single-variable-at-a-time experiment on this exercise's rep range — see
// docs/architecture/adaptive-progression-engine.md §10. Once concluded, this
// record is kept (not cleared) even if the trial value was rejected — its
// presence is what stops a second trial ever being offered on the same exercise
// (a v1 scope boundary, not a permanent design decision), and a *successful*
// one is read by other exercises sharing this muscle as a warm-start (see
// getSuggestion.ts).
type RepRangeTrial = {
  trialRepRange: [number, number];
  baselineRepRange: [number, number];
  startedAtMs: number;
  status: "active" | "concluded";
  result?: {
    trialSlopePctPerSession: number;
    baselineSlopePctPerSession: number;
    switched: boolean;
    concludedAtMs: number;
  };
};

type LinearState = {
  workingWeight: number;
  failedAttempts: number;
  increment: number;
  repRange: [number, number];
  repRangeTrial?: RepRangeTrial;
};

type LinearPreferences = {
  repRangeMin: number;
  repRangeMax: number;
  workingSets: number;
  increment: number;
  suggestionDetail: "summary" | "block";
  repRangeExperimentsEnabled: boolean;
};

const DEFAULT_PREFERENCES: LinearPreferences = {
  repRangeMin: 5,
  repRangeMax: 8,
  workingSets: 3,
  increment: 2.5,
  suggestionDetail: "summary",
  repRangeExperimentsEnabled: false,
};

const PREFERENCES_SCHEMA: AlgorithmPreferencesField[] = [
  {
    key: "repRangeMin",
    label: "Rep range — lower bound",
    description: "Minimum reps to aim for each working set.",
    type: "number",
    default: 5,
    min: 1,
    max: 30,
    step: 1,
    unit: "reps",
  },
  {
    key: "repRangeMax",
    label: "Rep range — upper bound",
    description: "Hit this many reps on all sets to trigger a weight increase.",
    type: "number",
    default: 8,
    min: 1,
    max: 40,
    step: 1,
    unit: "reps",
  },
  {
    key: "workingSets",
    label: "Working sets",
    description: "Number of working sets to suggest per exercise.",
    type: "number",
    default: 3,
    min: 1,
    max: 10,
    step: 1,
    unit: "sets",
  },
  {
    key: "increment",
    label: "Weight increment",
    description: "How much weight to add when you hit the top of your rep range.",
    type: "number",
    default: 2.5,
    min: 0.25,
    max: 20,
    step: 0.25,
    unit: "kg",
  },
  {
    key: "suggestionDetail",
    label: "Suggestion display",
    description: "How suggestions are shown in your workout. Simple collapses identical sets into a single line; full block shows each set as its own row.",
    type: "select",
    default: "summary",
    options: [
      { value: "summary", label: "Simple (e.g. 3×5-8 @ 20kg)" },
      { value: "block", label: "Full block (each set as its own row)" },
    ],
  },
  {
    key: "repRangeExperimentsEnabled",
    label: "Rep range experiments",
    description:
      "Let LogIt occasionally try a different rep range on an exercise, for a few sessions, to see if you respond better — and tell you the result either way. Off by default; you'll still be asked before any specific exercise is changed.",
    type: "boolean",
    default: false,
  },
];

const DEFAULT_STATE: LinearState = {
  workingWeight: 0,
  failedAttempts: 0,
  increment: 2.5,
  repRange: [5, 8],
};
const DELOAD_THRESHOLD = 2;
const DELOAD_FACTOR = 0.9;
// Max weight reduction from fatigue at default sensitivity: 15%.
const MAX_FATIGUE_DISCOUNT = 0.15;
const REFERENCE_SETS = 3;
// Minimum sessions in each group (fresh / fatigued) before calibration kicks in.
const MIN_CALIBRATION_SAMPLES = 3;
// Don't ask for help calibrating until there's been enough history to make the
// ask meaningful — no point nagging on session #2.
const MIN_SESSIONS_BEFORE_ASKING = 6;
const ORDER_VARIETY_NUDGE_ID = "linear-progression:order-variety";

// Rep-range experimentation (§10) — a single-variable, one-at-a-time trial.
const REP_RANGE_TRIAL_OFFER_NUDGE_ID = "linear-progression:rep-range-trial-offer";
const REP_RANGE_TRIAL_RESULT_NUDGE_ID = "linear-progression:rep-range-trial-result";
// Need enough of an exercise's own history before even offering a trial — twice
// the block size, so a full baseline block is available for comparison.
const TRIAL_BLOCK_SESSIONS = 4;
const MIN_HISTORY_BEFORE_TRIAL_OFFER = TRIAL_BLOCK_SESSIONS * 2;
// How much higher the trial block's slope needs to be than the baseline block's
// to call it a real difference worth switching for, not noise. Same order of
// magnitude as PROGRESSING_SLOPE_THRESHOLD in domain/progression.ts, chosen
// independently since this compares two blocks against each other rather than a
// single series against zero.
const TRIAL_SWITCH_SLOPE_MARGIN = 0.5;

function makeWorkingSets(weight: number, repRange: [number, number], count: number): SuggestedSet[] {
  return Array.from({ length: count }, () => ({
    reps: repRange,
    weight,
    setType: "normal" as const,
  }));
}

function seedFromHistory(history: ProgressionInput["history"]): LinearState | null {
  const lastSession = history[0];
  if (!lastSession) return null;
  const workingSets = lastSession.sets.filter((s) => s.setType === "normal" || !s.setType);
  if (workingSets.length === 0) return null;
  const maxWeight = Math.max(...workingSets.map((s) => s.weight));
  return { ...DEFAULT_STATE, workingWeight: maxWeight };
}

// Computes a fatigue score [0, 1] based on how much the preceding exercises
// have loaded the muscles the current exercise primarily uses.
//
// Primary-on-primary overlap counts fully; secondary-on-primary overlap
// counts at 40% since those muscles are working assistively, not maximally.
// Each preceding exercise's contribution is scaled by its effortFactor when
// available (intensity-weighted set load), otherwise by completed set count
// relative to a reference block of 3 sets.
function computeFatigueScore(
  targetPrimary: MuscleGroup[],
  preceding: PrecedingExercise[],
): number {
  if (targetPrimary.length === 0 || preceding.length === 0) return 0;

  let total = 0;

  for (const prev of preceding) {
    const primaryHitByPrimary =
      prev.primaryMuscles.filter((m) => targetPrimary.includes(m)).length /
      targetPrimary.length;

    const primaryHitBySecondary =
      prev.secondaryMuscles.filter((m) => targetPrimary.includes(m)).length /
      targetPrimary.length;

    const overlapScore = primaryHitByPrimary + primaryHitBySecondary * 0.4;

    // effortFactor already normalises for set count and intensity type.
    // Fall back to raw set count ratio if unavailable (e.g. from a third-party caller).
    const intensityFactor =
      prev.effortFactor ?? Math.min(prev.completedSets, REFERENCE_SETS * 2) / REFERENCE_SETS;

    total += overlapScore * intensityFactor;
  }

  return Math.min(total, 1);
}

// Returns avg reps across working sets as a fraction of the rep ceiling.
function performanceScore(entry: ExerciseHistoryEntry, repCeiling: number): number {
  const working = entry.sets.filter((s) => s.setType === "normal" || !s.setType);
  if (working.length === 0) return 0;
  const avgReps = working.reduce((sum, s) => sum + s.reps, 0) / working.length;
  return avgReps / repCeiling;
}

// Best estimated 1RM across a session's working sets — the same per-session value
// classifyTrend/getMuscleGroupInsights use, so block comparisons here read the
// same way as everything else built on it.
function sessionValue(entry: ExerciseHistoryEntry): number {
  const working = entry.sets.filter((s) => s.setType === "normal" || !s.setType);
  if (working.length === 0) return 0;
  return Math.max(...working.map((s) => estimated1RM(s.weight, s.reps)));
}

// How this exercise trended across a block of sessions (oldest→newest) — reuses
// classifyTrend's own slope fit rather than a bespoke calculator, so a trial's
// "did this help" reads on the exact same scale as every status chip elsewhere.
// lastTrainedMs/nowMs are both pinned to the block's own last session: this is a
// retrospective read of history that already happened, not "is this stale now".
function blockTrend(entries: ExerciseHistoryEntry[]): { slopePctPerSession: number } {
  const chronological = [...entries].sort((a, b) => a.performedAtMs - b.performedAtMs);
  const values = chronological.map(sessionValue);
  const asOf = chronological[chronological.length - 1]?.performedAtMs ?? 0;
  return classifyTrend({ values, lastTrainedMs: asOf, nowMs: asOf });
}

function fmtSlope(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

// Deterministically rebuilds the "trial finished" nudge from a concluded trial's
// stored result — used both at the moment of conclusion and on every later call
// while it's still awaiting a decision, so the two never drift into describing
// the same trial two different ways.
function resultNudge(trial: RepRangeTrial): NonNullable<ProgressionOutput["nudge"]> {
  const result = trial.result!;
  const switched = result.switched;
  return {
    id: REP_RANGE_TRIAL_RESULT_NUDGE_ID,
    message: switched
      ? `Trial finished — you progressed faster at ${trial.trialRepRange[0]}-${trial.trialRepRange[1]} reps (${fmtSlope(result.trialSlopePctPerSession)}/session) than your usual ${trial.baselineRepRange[0]}-${trial.baselineRepRange[1]} (${fmtSlope(result.baselineSlopePctPerSession)}/session). Switch permanently?`
      : `Trial finished — no meaningful difference at ${trial.trialRepRange[0]}-${trial.trialRepRange[1]} reps. Keeping your usual ${trial.baselineRepRange[0]}-${trial.baselineRepRange[1]}.`,
    actionLabel: switched ? "Switch" : undefined,
    actionData: switched ? { repRange: trial.trialRepRange } : undefined,
  };
}

type FatigueCalibration = {
  sensitivity: number;
  freshSamples: number;
  fatiguedSamples: number;
  calibrated: boolean;
};

// Derives a personal fatigue sensitivity multiplier from history by comparing
// performance when the exercise was done first vs. later in a session.
// Returns sensitivity 1.0 (no change to default discount), calibrated: false,
// until MIN_CALIBRATION_SAMPLES sessions exist in both groups — the sample
// counts are surfaced so callers can report confidence honestly rather than
// applying a personalized multiplier with the same authority as a guess.
//
// A user who shows no rep degradation when fatigued gets a lower multiplier
// (smaller discount); one who degrades more than the 10% baseline gets a
// higher multiplier. Clamped to [0.1, 2.0].
function calibrateSensitivity(
  history: ProgressionInput["history"],
  repCeiling: number,
): FatigueCalibration {
  const fresh = history.filter((h) => (h.sessionPosition ?? 0) === 0);
  const fatigued = history.filter((h) => (h.sessionPosition ?? 0) > 0);
  const freshSamples = fresh.length;
  const fatiguedSamples = fatigued.length;

  if (freshSamples < MIN_CALIBRATION_SAMPLES || fatiguedSamples < MIN_CALIBRATION_SAMPLES) {
    return { sensitivity: 1.0, freshSamples, fatiguedSamples, calibrated: false };
  }

  const freshAvg = fresh.reduce((s, h) => s + performanceScore(h, repCeiling), 0) / freshSamples;
  const fatiguedAvg = fatigued.reduce((s, h) => s + performanceScore(h, repCeiling), 0) / fatiguedSamples;

  if (freshAvg <= 0) {
    return { sensitivity: 1.0, freshSamples, fatiguedSamples, calibrated: true };
  }

  // How much do reps drop, relative to the fresh baseline?
  const degradation = Math.max(0, (freshAvg - fatiguedAvg) / freshAvg);
  // Normalise: 10% degradation maps to a sensitivity of 1.0 (the default).
  const sensitivity = Math.max(0.1, Math.min(2.0, degradation / 0.1));

  return { sensitivity, freshSamples, fatiguedSamples, calibrated: true };
}

function suggest(input: ProgressionInput): ProgressionOutput {
  const prefs: LinearPreferences = { ...DEFAULT_PREFERENCES, ...(input.userPreferences as Partial<LinearPreferences> ?? {}) };

  let state: LinearState =
    (input.state as LinearState | null) ??
    seedFromHistory(input.history) ?? {
      ...DEFAULT_STATE,
      workingWeight: input.plannedTargets?.weight ?? DEFAULT_STATE.workingWeight,
      increment: prefs.increment,
      repRange: [prefs.repRangeMin, prefs.repRangeMax],
    };

  if (input.incrementOverride !== undefined) {
    state = { ...state, increment: input.incrementOverride };
  }

  // If history shows a higher working weight than the saved state, reseed from history.
  // This recovers from a stale state (e.g. saved at the default 20kg because history
  // lookup previously failed due to a mismatched exerciseId).
  const historyWeight = seedFromHistory(input.history)?.workingWeight;
  if (historyWeight !== undefined && historyWeight > state.workingWeight) {
    state = { ...state, workingWeight: historyWeight };
  }

  if (input.history.length === 0) {
    // Seed from planned targets so the first suggestion matches the split's intent
    const seedWeight = input.plannedTargets?.weight ?? state.workingWeight;
    const seedReps = input.plannedTargets?.reps;
    const seeded: LinearState = {
      ...state,
      workingWeight: seedWeight,
      repRange: seedReps ? [seedReps, seedReps] : state.repRange,
    };
    return {
      sets: makeWorkingSets(seeded.workingWeight, seeded.repRange, prefs.workingSets),
      nextState: seeded,
      displayMode: prefs.suggestionDetail,
      reasoning: {
        inputs: { historySessions: 0, plannedTargetWeight: input.plannedTargets?.weight ?? "none" },
        computed: { seedWeight: seeded.workingWeight },
        confidence: "low",
        verdict: "seeded — no logged history for this exercise yet",
      },
    };
  }

  const lastSession = input.history[0];
  const workingSets = lastSession.sets.filter(
    (s) => s.setType === "normal" || !s.setType,
  );

  if (workingSets.length === 0) {
    return {
      sets: makeWorkingSets(state.workingWeight, state.repRange, prefs.workingSets),
      nextState: state,
      displayMode: prefs.suggestionDetail,
      reasoning: {
        inputs: { historySessions: input.history.length, lastSessionWorkingSets: 0 },
        computed: { repeatWeight: state.workingWeight },
        confidence: "low",
        verdict: "repeated last weight — last session had no working sets to read",
      },
    };
  }

  // ── Rep-range experimentation (§10) ────────────────────────────────────────
  // Resolves which rep range is actually in force this session — the trial range
  // while one's running, else the persisted baseline (state.repRange) — and steps
  // the trial's own state machine forward. state.repRange itself is never touched
  // here; it only changes via an explicit "switch" decision after a trial
  // concludes (see acceptRepRangeExperiment.ts).
  //
  // Known v1 simplification: doesn't correct for a rep-range trial's fatigue
  // calibration confound (calibrateSensitivity below scores every history entry
  // against *today's* rep ceiling, which is only strictly right for entries
  // logged under that same ceiling) — acceptable for now since both features
  // running on the same exercise at the same time is expected to be rare.
  let repRangeTrial = state.repRangeTrial;
  let activeRepRange = state.repRange;
  let trialNudge: ProgressionOutput["nudge"];

  if (repRangeTrial?.status === "active") {
    activeRepRange = repRangeTrial.trialRepRange;
    const trialEntries = input.history.filter((h) => h.performedAtMs >= repRangeTrial!.startedAtMs);

    if (trialEntries.length >= TRIAL_BLOCK_SESSIONS) {
      // history is most-recent-first, so this slice is the N most recent
      // pre-trial sessions — the baseline block to compare against.
      const baselineEntries = input.history
        .filter((h) => h.performedAtMs < repRangeTrial!.startedAtMs)
        .slice(0, TRIAL_BLOCK_SESSIONS);
      const trial = blockTrend(trialEntries.slice(0, TRIAL_BLOCK_SESSIONS));
      const baseline = blockTrend(baselineEntries);
      const switched = trial.slopePctPerSession - baseline.slopePctPerSession > TRIAL_SWITCH_SLOPE_MARGIN;

      repRangeTrial = {
        ...repRangeTrial,
        status: "concluded",
        result: {
          trialSlopePctPerSession: Math.round(trial.slopePctPerSession * 100) / 100,
          baselineSlopePctPerSession: Math.round(baseline.slopePctPerSession * 100) / 100,
          switched,
          concludedAtMs: nowMs(),
        },
      };
      trialNudge = resultNudge(repRangeTrial);
      // The just-concluded trial no longer sets today's target — back to
      // baseline until/unless the user accepts the switch above.
      activeRepRange = repRangeTrial.baselineRepRange;
    }
  } else if (repRangeTrial?.status === "concluded" && repRangeTrial.result) {
    // Re-propose the SAME result every call — not just at the moment of
    // conclusion — otherwise a user who doesn't act on it immediately would
    // never see it again (viewing/re-suggesting doesn't persist anything;
    // only a completed session does, via applySessionProgression). Whether
    // this has already been dismissed ("keep usual") is handled generically,
    // same as any other nudge. "Switch" is different: accepting it actually
    // changes state.repRange, so re-checking that here (rather than a second
    // dismissal-style flag) is what stops it nagging forever after the fact.
    const alreadySwitched =
      repRangeTrial.result.switched &&
      state.repRange[0] === repRangeTrial.trialRepRange[0] &&
      state.repRange[1] === repRangeTrial.trialRepRange[1];
    if (!alreadySwitched) trialNudge = resultNudge(repRangeTrial);
  } else if (
    !repRangeTrial &&
    prefs.repRangeExperimentsEnabled &&
    input.history.length >= MIN_HISTORY_BEFORE_TRIAL_OFFER
  ) {
    const trialRepRange = input.suggestedTrialRepRange ?? ([state.repRange[1], state.repRange[1] + 7] as [number, number]);
    trialNudge = {
      id: REP_RANGE_TRIAL_OFFER_NUDGE_ID,
      message: `Try ${trialRepRange[0]}-${trialRepRange[1]} reps instead of your usual ${state.repRange[0]}-${state.repRange[1]} for ${TRIAL_BLOCK_SESSIONS} sessions to see how you respond?`,
      actionLabel: "Try it",
      actionData: { trialRepRange, baselineRepRange: state.repRange },
      exclusive: true,
    };
  }

  const [repFloor, repCeiling] = activeRepRange;
  const allHitCeiling = workingSets.every((s) => s.reps >= repCeiling);
  const anyMissedFloor = workingSets.some((s) => s.reps < repFloor);

  const isAssisted = input.exercise.exerciseType === "assisted";

  let nextWeight = state.workingWeight;
  let failedAttempts = state.failedAttempts;

  if (allHitCeiling) {
    // Assisted: success means reduce the assistance (weight goes down toward 0)
    nextWeight = isAssisted
      ? Math.max(0, state.workingWeight - state.increment)
      : state.workingWeight + state.increment;
    failedAttempts = 0;
  } else if (anyMissedFloor) {
    failedAttempts += 1;
    if (failedAttempts >= DELOAD_THRESHOLD) {
      // Assisted: deload means adding more assistance (weight goes back up)
      nextWeight = isAssisted
        ? state.workingWeight + state.increment
        : state.workingWeight * DELOAD_FACTOR;
      failedAttempts = 0;
    }
  }

  const nextState: LinearState = { ...state, workingWeight: nextWeight, failedAttempts, repRangeTrial };

  // Fatigue discount doesn't apply to assisted exercises (assistance is machine-controlled)
  const targetPrimary = (input.exercise.primaryMuscles ?? []) as MuscleGroup[];
  const preceding = input.sessionContext?.precedingExercises ?? [];
  const fatigueScore = isAssisted ? 0 : computeFatigueScore(targetPrimary, preceding);

  // Personal sensitivity: how much do *this user's* reps actually drop when fatigued?
  // Calibrated from their history; defaults to 1.0 until enough data exists.
  const calibration = calibrateSensitivity(input.history, repCeiling);
  const effectiveDiscount = MAX_FATIGUE_DISCOUNT * calibration.sensitivity;

  const suggestedWeight =
    fatigueScore > 0
      ? Math.round((state.workingWeight * (1 - fatigueScore * effectiveDiscount)) * 4) / 4
      : state.workingWeight;

  const progressionLabel = allHitCeiling
    ? isAssisted ? `Next: ${nextWeight}kg assist` : `Next: ${nextWeight}kg`
    : anyMissedFloor && failedAttempts === 0
      ? isAssisted ? `More assist next: ${nextWeight}kg` : `Deload next: ${nextWeight}kg`
      : undefined;

  const discountPct = Math.round(fatigueScore * effectiveDiscount * 100);
  const fatigueLabel = fatigueScore > 0.1 ? `Fatigue −${discountPct}%` : undefined;

  const label = [progressionLabel, fatigueLabel].filter(Boolean).join(" · ") || undefined;

  // Ask for help calibrating — but only once there's enough history to make the ask
  // meaningful, and driven by the SAME calibrated flag the reasoning reports, not a
  // separate heuristic that could disagree with it (a previous version used an
  // independent ">85% same slot" check here, which could fall silent or keep
  // nagging out of step with what calibrateSensitivity actually needed).
  // Whether this has already been dismissed is handled generically, not here —
  // see getSuggestion.ts.
  const orderVarietyNudge =
    !calibration.calibrated && input.history.length >= MIN_SESSIONS_BEFORE_ASKING
      ? {
          id: ORDER_VARIETY_NUDGE_ID,
          message:
            "Still learning your fatigue pattern for this exercise — try training it at a different point in your session sometime soon.",
        }
      : undefined;

  // A rep-range trial starting, concluding, or offering to start takes priority
  // over the (passive, non-time-sensitive) order-variety nudge — only one nudge
  // is shown at a time.
  const nudge = trialNudge ?? orderVarietyNudge;

  // Not calibrated at all → low (the discount is the generic 15% baseline, not personal).
  // Calibrated but from a thin sample → medium. Calibrated from a solid sample → high.
  const fatigueConfidence: ReasoningConfidence = !calibration.calibrated
    ? "low"
    : calibration.freshSamples >= 6 && calibration.fatiguedSamples >= 6
      ? "high"
      : "medium";

  const reasoning: Reasoning = {
    inputs: {
      historySessions: input.history.length,
      allSetsHitCeiling: allHitCeiling,
      anySetMissedFloor: anyMissedFloor,
      consecutiveFailedAttemptsBefore: state.failedAttempts,
      precedingExercisesThisSession: preceding.length,
      fatigueCalibrationSamples: `${calibration.freshSamples} fresh / ${calibration.fatiguedSamples} fatigued`,
      fatigueCalibrated: calibration.calibrated,
      ...(repRangeTrial
        ? {
            repRangeTrialStatus: repRangeTrial.status,
            repRangeTrialRange: `${repRangeTrial.trialRepRange[0]}-${repRangeTrial.trialRepRange[1]}`,
          }
        : {}),
    },
    computed: {
      workingWeightBeforeFatigueDiscount: state.workingWeight,
      fatigueScore: Math.round(fatigueScore * 100) / 100,
      fatigueSensitivityMultiplier: Math.round(calibration.sensitivity * 100) / 100,
      fatigueDiscountPct: discountPct,
      suggestedWeight,
    },
    confidence: fatigueConfidence,
    verdict: progressionLabel ?? "hold — still within rep range",
  };

  return {
    sets: makeWorkingSets(suggestedWeight, activeRepRange, prefs.workingSets),
    nextState,
    label,
    displayMode: prefs.suggestionDetail,
    reasoning,
    nudge,
  };
}

export const linearProgression: ProgressionAlgorithm = {
  id: "linear-progression",
  name: "Linear Progression",
  description:
    "Add weight each session when you hit the top of your rep range. Deload after two consecutive failures. Adjusts for muscle fatigue within a session, calibrated to your personal fatigue response over time.",
  author: "logit",
  defaultState: DEFAULT_STATE,
  defaultPreferences: DEFAULT_PREFERENCES,
  preferencesSchema: PREFERENCES_SCHEMA,
  suggest,
};
