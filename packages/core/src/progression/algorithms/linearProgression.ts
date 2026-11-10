import type { ProgressionAlgorithm, ProgressionInput, ProgressionOutput, PrecedingExercise, SuggestedSet, ExerciseHistoryEntry, AlgorithmPreferencesField } from "../../domain/progression";
import { classifyTrend } from "../../domain/progression";
import type { MuscleGroup } from "../../domain/exercise";
import type { Reasoning, ReasoningConfidence } from "../../domain/reasoning";
import { estimated1RM } from "../../domain/oneRepMax";
import { nowMs } from "../../domain/time";

// A single-variable-at-a-time experiment on this exercise's rep range — see
// docs/architecture/adaptive-progression-engine.md §10. One rung of a bounded,
// upward-only ladder (§10.3.1): v1 tried exactly one alternative range and
// stopped forever; the ladder now climbs up to MAX_LADDER_RUNGS total attempts
// before giving up, each rung comparing against the SAME persisted usual range
// (state.repRange, untouched here — only an explicit "switch" decision after a
// win changes it, via acceptRepRangeExperiment.ts). A *successful* rung is read
// by other exercises sharing this muscle as a warm-start for their own ladder
// (see getSuggestion.ts); a *rejected* rung is likewise avoided as a next-rung
// candidate for a sibling exercise, so the ladder doesn't re-litigate a range
// cross-exercise data already says isn't worth it.
type RepRangeRung = {
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
  // Oldest → newest. A win (result.switched) is always the last entry — no
  // further rungs are ever added once one wins, ladder or not.
  repRangeLadder?: RepRangeRung[];
  // The session whose result is already folded into workingWeight/failedAttempts.
  // suggest() runs for previews (the session screen) as well as on finish/edit, so
  // without this the same session got applied again on every call: "Next: 65kg"
  // shown before lifting, and one missed session counted twice into a deload.
  lastAppliedSessionId?: string;
  lastOutcome?: Outcome;
};

type Outcome = "increase" | "hold" | "miss" | "deload";

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

// Rep-range experimentation (§10) — a bounded, upward-only ladder (§10.3.1).
// Nudge ids are suffixed per rung index (0-based) so dismissing one rung's ask
// or result never suppresses a later, genuinely different rung's — see
// dismissProgressionNudge.ts, which keys purely off nudge id.
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
// Up to two more rungs after the first (three attempts total) before
// permanently giving up and falling back to the usual range — §10.3.1's
// decision. Upward only; v1 doesn't explore below the original baseline.
const MAX_LADDER_RUNGS = 3;
// Arbitrary step size for climbing to the next rung when no muscle-group warm
// start applies — same "arbitrary first guess, not a principled one" status as
// v1's original +7 fallback, just applied at every rung rather than only the
// first.
const LADDER_STEP = 7;

function makeWorkingSets(weight: number, reps: SuggestedSet["reps"][] | [number, number], count: number): SuggestedSet[] {
  // A bare [min, max] tuple is one range for every set; an array of per-set
  // targets is indexed (the last one repeats if there are fewer than `count`).
  const perSet = isRange(reps) ? null : (reps as SuggestedSet["reps"][]);
  return Array.from({ length: count }, (_, i) => ({
    reps: perSet ? (perSet[i] ?? perSet[perSet.length - 1] ?? 0) : (reps as [number, number]),
    weight,
    setType: "normal" as const,
  }));
}

function isRange(x: unknown): x is [number, number] {
  return Array.isArray(x) && x.length === 2 && typeof x[0] === "number" && typeof x[1] === "number";
}

function workingSetsOf(entry: ExerciseHistoryEntry) {
  return entry.sets
    .filter((s) => s.setType === "normal" || !s.setType)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

// Exact rep targets for each set, so "5–8" becomes "7 / 6 / 6". At the same
// weight as last time a set aims for one more rep than it got (within the range);
// at a new weight it starts from the bottom of the range.
function perSetRepTargets(
  lastWorking: { reps: number; weight: number }[],
  todayWeight: number,
  [floor, ceiling]: [number, number],
  count: number,
): number[] {
  return Array.from({ length: count }, (_, i) => {
    const last = lastWorking[i] ?? lastWorking[lastWorking.length - 1];
    if (!last || Math.abs(last.weight - todayWeight) > 0.01) return floor;
    return Math.min(ceiling, Math.max(floor, last.reps + 1));
  });
}

function roundDownTo(weight: number, increment: number): number {
  if (!(increment > 0)) return Math.round(weight * 4) / 4;
  return Math.max(0, Math.floor(weight / increment + 1e-9) * increment);
}

function deloadWeight(weight: number, increment: number): number {
  return roundDownTo(weight * DELOAD_FACTOR, increment);
}

function fmtKg(kg: number): string {
  return `${Math.round(kg * 100) / 100}kg`;
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

// Deterministically rebuilds the "switch permanently?" nudge from a rung that
// won its trial — used both at the moment of conclusion and on every later call
// while it's still awaiting a decision, so the two never drift into describing
// the same result two different ways. Only ever called for a winning rung —
// "no real difference" is handled by nextRungNudge/giveUpNudge below instead,
// since that case needs to decide whether to also offer the next rung.
function resultNudge(rung: RepRangeRung, rungIndex: number): NonNullable<ProgressionOutput["nudge"]> {
  const result = rung.result!;
  return {
    id: `${REP_RANGE_TRIAL_RESULT_NUDGE_ID}:rung${rungIndex}`,
    message: `Trial finished — you progressed faster at ${rung.trialRepRange[0]}-${rung.trialRepRange[1]} reps (${fmtSlope(result.trialSlopePctPerSession)}/session) than your usual ${rung.baselineRepRange[0]}-${rung.baselineRepRange[1]} (${fmtSlope(result.baselineSlopePctPerSession)}/session). Switch permanently?`,
    actionLabel: "Switch",
    actionData: { repRange: rung.trialRepRange },
  };
}

// The ladder gave up after MAX_LADDER_RUNGS attempts found no real difference —
// terminal, re-derived deterministically on every later view the same way
// resultNudge is, until dismissed.
function giveUpNudge(lastRung: RepRangeRung, rungIndex: number): NonNullable<ProgressionOutput["nudge"]> {
  return {
    id: `${REP_RANGE_TRIAL_RESULT_NUDGE_ID}:rung${rungIndex}`,
    message: `No meaningful difference found across ${MAX_LADDER_RUNGS} rep-range trials — keeping your usual ${lastRung.baselineRepRange[0]}-${lastRung.baselineRepRange[1]}.`,
  };
}

// Picks the next rung to offer: a sibling's warm-start value if this exercise
// hasn't already tried it and no sibling has already ruled it out, else the
// next step up from wherever this exercise's own ladder last reached — climbing
// past any range a sibling's ladder has already ruled out along the way.
function nextCandidateRange(
  ladder: RepRangeRung[],
  usualRange: [number, number],
  suggestedTrialRepRange: [number, number] | undefined,
  siblingRuledOut: [number, number][],
): [number, number] {
  const rangesEqual = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  const alreadyTried = (r: [number, number]) => ladder.some((rung) => rangesEqual(rung.trialRepRange, r));
  const ruledOutBySibling = (r: [number, number]) => siblingRuledOut.some((s) => rangesEqual(s, r));

  if (
    suggestedTrialRepRange &&
    !alreadyTried(suggestedTrialRepRange) &&
    !ruledOutBySibling(suggestedTrialRepRange)
  ) {
    return suggestedTrialRepRange;
  }

  const lastCeiling = ladder.length > 0 ? ladder[ladder.length - 1]!.trialRepRange[1] : usualRange[1];
  let candidate: [number, number] = [lastCeiling, lastCeiling + LADDER_STEP];
  while (ruledOutBySibling(candidate) || alreadyTried(candidate)) {
    candidate = [candidate[1], candidate[1] + LADDER_STEP];
  }
  return candidate;
}

// Offers the next rung, either as a fresh first ask (previous undefined) or
// following a rejected rung (previous set — the message reports that result
// too, so "no difference" and "want to try the next one" read as one nudge
// rather than two the user has to dismiss in sequence).
function nextRungNudge(
  previous: RepRangeRung | undefined,
  ladder: RepRangeRung[],
  usualRange: [number, number],
  suggestedTrialRepRange: [number, number] | undefined,
  siblingRuledOut: [number, number][],
): NonNullable<ProgressionOutput["nudge"]> {
  const rungIndex = ladder.length;
  const nextRange = nextCandidateRange(ladder, usualRange, suggestedTrialRepRange, siblingRuledOut);
  const message = previous
    ? `No meaningful difference at ${previous.trialRepRange[0]}-${previous.trialRepRange[1]} reps (${fmtSlope(previous.result!.trialSlopePctPerSession)}/session vs. usual ${fmtSlope(previous.result!.baselineSlopePctPerSession)}/session). Want to try ${nextRange[0]}-${nextRange[1]} reps instead?`
    : `Try ${nextRange[0]}-${nextRange[1]} reps instead of your usual ${usualRange[0]}-${usualRange[1]} for ${TRIAL_BLOCK_SESSIONS} sessions to see how you respond?`;
  return {
    id: `${REP_RANGE_TRIAL_OFFER_NUDGE_ID}:rung${rungIndex}`,
    message,
    actionLabel: "Try it",
    actionData: { trialRepRange: nextRange, baselineRepRange: usualRange },
    exclusive: true,
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

  const isAssisted = input.exercise.exerciseType === "assisted";
  const newest = input.history[0];
  // A split day's planned set count wins over the general preference.
  const setCount = input.plannedTargets?.sets && input.plannedTargets.sets > 0
    ? input.plannedTargets.sets
    : prefs.workingSets;

  // Is the newest session already folded into `state`? Either recorded directly,
  // or (for a state saved before lastAppliedSessionId existed) inferred from the
  // state having been saved after that session was performed.
  const alreadyApplied =
    newest !== undefined &&
    (state.lastAppliedSessionId !== undefined
      ? state.lastAppliedSessionId === newest.sessionId
      : input.state != null &&
        input.stateSavedAtMs !== undefined &&
        newest.performedAtMs <= input.stateSavedAtMs);

  // If the newest, not-yet-applied session was done heavier than the state says,
  // start from what was actually lifted. Never for a session this state has
  // recorded applying — that used to undo every deload on the very next
  // suggestion. A state from before that was recorded keeps the old recovery for
  // stale states (e.g. left at a default because history lookup once failed on a
  // mismatched exerciseId); its next save records the session and ends that.
  // For assisted exercises a higher number means more help, so only an unseeded
  // state (nothing applied yet, still at 0) takes its starting point from history.
  const historyWeight = seedFromHistory(input.history)?.workingWeight;
  const mayReseed = !alreadyApplied || state.lastAppliedSessionId === undefined;
  const unseeded = state.lastAppliedSessionId === undefined && state.workingWeight === 0 && state.failedAttempts === 0;
  if (mayReseed && (!isAssisted || unseeded) && historyWeight !== undefined && historyWeight > state.workingWeight) {
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
    const [lo, hi] = seeded.repRange;
    return {
      sets: makeWorkingSets(seeded.workingWeight, seeded.repRange, setCount),
      nextState: seeded,
      displayMode: prefs.suggestionDetail,
      change: {
        kind: "first",
        text: "First time",
        detail:
          lo === hi
            ? `Pick a weight you can do ${lo} reps with.`
            : `Pick a weight you can do ${lo}–${hi} reps with.`,
      },
      reasoning: {
        inputs: { historySessions: 0, plannedTargetWeight: input.plannedTargets?.weight ?? "none" },
        computed: { seedWeight: seeded.workingWeight },
        confidence: "low",
        verdict: "seeded — no logged history for this exercise yet",
      },
    };
  }

  const lastSession = input.history[0]!;
  const workingSets = workingSetsOf(lastSession);

  if (workingSets.length === 0) {
    return {
      sets: makeWorkingSets(state.workingWeight, state.repRange, setCount),
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

  // ── Rep-range experimentation (§10, ladder §10.3.1) ────────────────────────
  // Resolves which rep range is actually in force this session — the active
  // rung's range while one's running, else the persisted usual range
  // (state.repRange) — and steps the ladder's state machine forward. state.
  // repRange itself is never touched here; it only changes via an explicit
  // "switch" decision after a rung wins (see acceptRepRangeExperiment.ts).
  //
  // Known v1 simplification: doesn't correct for a rep-range trial's fatigue
  // calibration confound (calibrateSensitivity below scores every history entry
  // against *today's* rep ceiling, which is only strictly right for entries
  // logged under that same ceiling) — acceptable for now since both features
  // running on the same exercise at the same time is expected to be rare.
  let ladder: RepRangeRung[] = state.repRangeLadder ?? [];
  let activeRepRange = state.repRange;
  let trialNudge: ProgressionOutput["nudge"];

  const activeIdx = ladder.findIndex((r) => r.status === "active");
  const lastRung = ladder[ladder.length - 1];

  if (activeIdx !== -1) {
    const active = ladder[activeIdx]!;
    activeRepRange = active.trialRepRange;
    const trialEntries = input.history.filter((h) => h.performedAtMs >= active.startedAtMs);

    if (trialEntries.length >= TRIAL_BLOCK_SESSIONS) {
      // history is most-recent-first, so this slice is the N most recent
      // pre-trial sessions — the baseline block to compare against. Since the
      // active range reverts to `state.repRange` between rungs, these sessions
      // are genuinely baseline-range sessions even for a later rung, not the
      // previous (rejected) rung's own trial sessions.
      const baselineEntries = input.history
        .filter((h) => h.performedAtMs < active.startedAtMs)
        .slice(0, TRIAL_BLOCK_SESSIONS);
      const trial = blockTrend(trialEntries.slice(0, TRIAL_BLOCK_SESSIONS));
      const baseline = blockTrend(baselineEntries);
      const switched = trial.slopePctPerSession - baseline.slopePctPerSession > TRIAL_SWITCH_SLOPE_MARGIN;

      const concluded: RepRangeRung = {
        ...active,
        status: "concluded",
        result: {
          trialSlopePctPerSession: Math.round(trial.slopePctPerSession * 100) / 100,
          baselineSlopePctPerSession: Math.round(baseline.slopePctPerSession * 100) / 100,
          switched,
          concludedAtMs: nowMs(),
        },
      };
      ladder = [...ladder.slice(0, activeIdx), concluded, ...ladder.slice(activeIdx + 1)];
      // The just-concluded rung no longer sets today's target — back to the
      // usual range until/unless the user accepts the switch below.
      activeRepRange = state.repRange;

      trialNudge = switched
        ? resultNudge(concluded, ladder.length - 1)
        : ladder.length < MAX_LADDER_RUNGS
          ? nextRungNudge(concluded, ladder, state.repRange, input.suggestedTrialRepRange, input.siblingRuledOutRepRanges ?? [])
          : giveUpNudge(concluded, ladder.length - 1);
    }
  } else if (lastRung?.status === "concluded" && lastRung.result) {
    // Re-propose the SAME message every call — not just at the moment of
    // conclusion — otherwise a user who doesn't act on it immediately would
    // never see it again (viewing/re-suggesting doesn't persist anything;
    // only a completed session does, via applySessionProgression). Whether an
    // offer/give-up nudge has already been dismissed is handled generically,
    // same as any other nudge. "Switch" is different: accepting it actually
    // changes state.repRange, so re-checking that here (rather than a second
    // dismissal-style flag) is what stops it nagging forever after the fact.
    if (lastRung.result.switched) {
      const alreadySwitched =
        state.repRange[0] === lastRung.trialRepRange[0] && state.repRange[1] === lastRung.trialRepRange[1];
      if (!alreadySwitched) trialNudge = resultNudge(lastRung, ladder.length - 1);
    } else if (ladder.length < MAX_LADDER_RUNGS) {
      trialNudge = nextRungNudge(lastRung, ladder, state.repRange, input.suggestedTrialRepRange, input.siblingRuledOutRepRanges ?? []);
    } else {
      trialNudge = giveUpNudge(lastRung, ladder.length - 1);
    }
  } else if (
    ladder.length === 0 &&
    prefs.repRangeExperimentsEnabled &&
    input.history.length >= MIN_HISTORY_BEFORE_TRIAL_OFFER
  ) {
    trialNudge = nextRungNudge(undefined, ladder, state.repRange, input.suggestedTrialRepRange, input.siblingRuledOutRepRanges ?? []);
  }

  const [repFloor, repCeiling] = activeRepRange;
  const allHitCeiling = workingSets.every((s) => s.reps >= repCeiling);
  const anyMissedFloor = workingSets.some((s) => s.reps < repFloor);

  let nextWeight = state.workingWeight;
  let failedAttempts = state.failedAttempts;
  let outcome: Outcome;

  if (alreadyApplied) {
    // Last session's result is already in `state` — just read it back.
    outcome =
      state.lastOutcome ??
      (allHitCeiling ? "increase" : anyMissedFloor ? (failedAttempts === 0 ? "deload" : "miss") : "hold");
  } else if (allHitCeiling) {
    // Assisted: success means reduce the assistance (weight goes down toward 0)
    nextWeight = isAssisted
      ? Math.max(0, state.workingWeight - state.increment)
      : state.workingWeight + state.increment;
    failedAttempts = 0;
    outcome = "increase";
  } else if (anyMissedFloor) {
    failedAttempts += 1;
    outcome = "miss";
    if (failedAttempts >= DELOAD_THRESHOLD) {
      // Assisted: deload means adding more assistance (weight goes back up).
      // Otherwise drop ~10%, rounded down to something loadable.
      nextWeight = isAssisted
        ? state.workingWeight + state.increment
        : deloadWeight(state.workingWeight, state.increment);
      failedAttempts = 0;
      outcome = "deload";
    }
  } else {
    outcome = "hold";
  }

  const nextState: LinearState = {
    ...state,
    workingWeight: nextWeight,
    failedAttempts,
    repRangeLadder: ladder.length > 0 ? ladder : undefined,
    lastAppliedSessionId: lastSession.sessionId,
    lastOutcome: outcome,
  };

  // Fatigue discount doesn't apply to assisted exercises (assistance is machine-controlled)
  const targetPrimary = (input.exercise.primaryMuscles ?? []) as MuscleGroup[];
  const preceding = input.sessionContext?.precedingExercises ?? [];
  const fatigueScore = isAssisted ? 0 : computeFatigueScore(targetPrimary, preceding);

  // Personal sensitivity: how much do *this user's* reps actually drop when fatigued?
  // Calibrated from their history; defaults to 1.0 until enough data exists.
  const calibration = calibrateSensitivity(input.history, repCeiling);
  const effectiveDiscount = MAX_FATIGUE_DISCOUNT * calibration.sensitivity;

  // Today's prescription is the state *after* last session's result.
  // Rounded down to the increment so the plan is a weight you can actually load.
  const suggestedWeight =
    fatigueScore > 0 ? roundDownTo(nextWeight * (1 - fatigueScore * effectiveDiscount), state.increment) : nextWeight;

  const repTargets = perSetRepTargets(workingSets, nextWeight, activeRepRange, setCount);
  const lastReps = workingSets.map((s) => s.reps).join(" / ");
  const goalWeight = isAssisted ? Math.max(0, nextWeight - state.increment) : nextWeight + state.increment;

  const change: NonNullable<ProgressionOutput["change"]> =
    outcome === "increase"
      ? {
          kind: "increase",
          text: isAssisted ? `−${fmtKg(state.increment)} assist` : `+${fmtKg(state.increment)}`,
          detail: `You hit ${repCeiling} on every set last time.`,
        }
      : outcome === "deload"
        ? {
            kind: "deload",
            text: "Deload",
            detail: isAssisted
              ? `Under ${repFloor} reps two sessions running, so a bit more assistance.`
              : `Under ${repFloor} reps two sessions running, so the weight drops to rebuild.`,
          }
        : outcome === "miss"
          ? {
              kind: "repeat",
              text: "Repeat",
              detail: `Some sets were under ${repFloor} last time. Same weight; under ${repFloor} again means a deload.`,
            }
          : { kind: "reps", text: "+1 rep", detail: `Last time: ${lastReps}. Beat each set by a rep.` };

  const progressionLabel =
    outcome === "increase"
      ? isAssisted ? `Assist down to ${fmtKg(nextWeight)}` : `Up to ${fmtKg(nextWeight)}`
      : outcome === "deload"
        ? isAssisted ? `More assist: ${fmtKg(nextWeight)}` : `Deload to ${fmtKg(nextWeight)}`
        : outcome === "miss"
          ? `Under ${repFloor} again → deload`
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
      lastSessionAlreadyApplied: alreadyApplied,
      todayRepTargets: repTargets.join(" / "),
      precedingExercisesThisSession: preceding.length,
      fatigueCalibrationSamples: `${calibration.freshSamples} fresh / ${calibration.fatiguedSamples} fatigued`,
      fatigueCalibrated: calibration.calibrated,
      ...(ladder.length > 0
        ? {
            repRangeLadderRungs: ladder.length,
            repRangeTrialStatus: ladder[ladder.length - 1]!.status,
            repRangeTrialRange: `${ladder[ladder.length - 1]!.trialRepRange[0]}-${ladder[ladder.length - 1]!.trialRepRange[1]}`,
          }
        : {}),
    },
    computed: {
      workingWeightBeforeFatigueDiscount: nextWeight,
      fatigueScore: Math.round(fatigueScore * 100) / 100,
      fatigueSensitivityMultiplier: Math.round(calibration.sensitivity * 100) / 100,
      fatigueDiscountPct: discountPct,
      suggestedWeight,
    },
    confidence: fatigueConfidence,
    verdict: progressionLabel ?? "hold — still within rep range, aim for one more rep a set",
  };

  return {
    sets: makeWorkingSets(suggestedWeight, repTargets, setCount),
    nextState,
    label,
    displayMode: prefs.suggestionDetail,
    reasoning,
    nudge,
    change,
    progressGoal: { reps: repCeiling, weight: goalWeight },
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
