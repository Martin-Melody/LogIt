import type { SetEntry, SetType } from "./workout";
import type { PlannedTargets } from "./WorkoutSplit";
import type { MuscleGroup, Machine, ExerciseType } from "./exercise";
import type { Reasoning, ReasoningConfidence } from "./reasoning";

export type AlgorithmPreferencesField = {
  key: string;
  label: string;
  description?: string;
  type: "number" | "boolean" | "select" | "range";
  default: unknown;
  // number / range
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // select
  options?: { value: string | number; label: string }[];
};

export type ExerciseHistoryEntry = {
  sessionId: string;
  performedAtMs: number;
  planned?: PlannedTargets;
  sets: SetEntry[];
  // 0-based position of this exercise in its session; undefined if unknown
  sessionPosition?: number;
};

export type PrecedingExercise = {
  name: string;
  id?: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  completedSets: number;
  // 0-1: intensity-weighted effort load. 1.0 ≈ a full 3-set working block at max effort.
  // Warmups count ~0.25×, failure/AMRAP sets count ~1.5×. Falls back to set-count ratio if absent.
  effortFactor?: number;
};

export type ProgressionInput = {
  exercise: { id?: string; name: string; primaryMuscles?: MuscleGroup[]; secondaryMuscles?: MuscleGroup[]; exerciseType?: ExerciseType };
  history: ExerciseHistoryEntry[]; // most recent first
  state: unknown; // algorithm-owned, opaque to the app
  userPreferences: unknown; // user-configured per-algorithm prefs, schema defined by the algorithm
  plannedTargets?: PlannedTargets;
  incrementOverride?: number;
  sessionContext?: {
    precedingExercises: PrecedingExercise[];
    timeBudgetMs?: number;
    avgExerciseDurationMs?: Record<string, number>;
  };
};

export type SuggestedSet = {
  reps: number | [min: number, max: number];
  weight: number;
  setType?: SetType;
  note?: string;
};

export type ProgressionOutput = {
  sets: SuggestedSet[];
  nextState: unknown;
  label?: string;
  notes?: string;
  // "summary": render sets collapsed as e.g. "3×5-8 @ 20kg". "block": show each set as its own row.
  // Algorithms that return uniform sets should omit this or use "summary"; varied prescriptions use "block".
  displayMode?: "summary" | "block";
  // Optional structured "show your work" — see domain/reasoning.ts. Not required so
  // existing/third-party algorithms keep working unchanged; the built-in ones populate it.
  reasoning?: Reasoning;
};

export type ProgressionAlgorithmMeta = {
  id: string;
  name: string;
  description: string;
  author?: string;
};

export type ProgressionAlgorithm = ProgressionAlgorithmMeta & {
  defaultState: unknown;
  defaultPreferences?: unknown; // used as initial values when no stored prefs exist
  preferencesSchema?: AlgorithmPreferencesField[]; // if present, app renders a settings screen for this algorithm
  // Built-in algorithms are synchronous; community algorithms run in the
  // interpreter sandbox and resolve asynchronously. Callers must await.
  suggest(input: ProgressionInput): ProgressionOutput | Promise<ProgressionOutput>;
};

export type ExerciseProgressionState = {
  key: string; // exerciseId if available, else exerciseName lowercased
  exerciseId?: string;
  exerciseName: string;
  algorithmId: string;
  state: unknown;
  updatedAtMs: number;
};

export type UserProgressionConfig = {
  algorithmId: string;
};

export function exerciseKey(exercise: { id?: string; name: string }): string {
  return exercise.id ?? exercise.name.toLowerCase().trim();
}

// historyNewestFirst must be sorted newest-first (matches getSuggestion.ts's ordering,
// which differs from getExerciseHistory.ts's oldest-first — don't mix the two).

/**
 * The machine most relevant to this exercise right now: the one used in the most
 * recent logged set, else the exercise's default machine.
 */
export function resolveExerciseMachine(
  exercise: { machines?: Machine[]; defaultMachineId?: string },
  historyNewestFirst: ExerciseHistoryEntry[],
): Machine | undefined {
  const machines = exercise.machines ?? [];
  if (machines.length === 0) return undefined;

  for (const entry of historyNewestFirst) {
    for (const set of entry.sets) {
      if (!set.machineId) continue;
      const m = machines.find((mm) => mm.id === set.machineId);
      if (m) return m;
    }
  }

  return machines.find((m) => m.id === exercise.defaultMachineId);
}

export function resolveExerciseIncrement(
  exercise: { machines?: Machine[]; defaultMachineId?: string },
  historyNewestFirst: ExerciseHistoryEntry[],
): number | undefined {
  return resolveExerciseMachine(exercise, historyNewestFirst)?.incrementKg;
}

// ── Trend classification ─────────────────────────────────────────────────────

export type ProgressStatus =
  | "new"
  | "progressing"
  | "plateaued"
  | "regressing"
  | "detraining";

const DETRAINING_MS = 21 * 24 * 60 * 60 * 1000;
const TREND_WINDOW = 8;

const PROGRESSING_SLOPE_THRESHOLD = 0.4;
const REGRESSING_SLOPE_THRESHOLD = -1;
const MIN_SESSIONS = 3;

// Confidence for the slope-based verdicts (progressing/plateaued/regressing) scales
// with how many points the least-squares fit actually had to work with — a 3-point
// slope and an 8-point slope shouldn't be presented with equal certainty. "new" and
// "detraining" are simple facts (session count, days since last trained), not
// statistical inference from noisy data, so they're always "high".
function trendConfidence(pointsConsidered: number): ReasoningConfidence {
  if (pointsConsidered >= 6) return "high";
  if (pointsConsidered >= 4) return "medium";
  return "low";
}

/**
 * Classify how an exercise is trending from its primary metric series
 * (e1RM or max weight), oldest→newest. Deliberately simple and explainable —
 * least-squares slope over a recent window, plus a "sessions since PR" count.
 *
 * Does NOT yet account for session-position/fatigue confounds (e.g. a lift done
 * last in a session reads lower than one done first) — that's the next piece of
 * work, see docs/architecture/adaptive-progression-engine.md §4. The per-user
 * fatigue calibration this will build on already exists in the built-in
 * progression algorithm (`calibrateSensitivity` in linearProgression.ts); it just
 * isn't wired into this classifier yet.
 */
export function classifyTrend(params: {
  values: number[];
  lastTrainedMs: number;
  nowMs: number;
}): {
  status: ProgressStatus;
  slopePctPerSession: number;
  sessionsSincePr: number;
  reasoning: Reasoning;
} {
  const { values, lastTrainedMs, nowMs } = params;

  // Sessions since the last all-time best in the series.
  let runningMax = -Infinity;
  let lastPrIdx = -1;
  values.forEach((v, i) => {
    if (v > runningMax) {
      runningMax = v;
      lastPrIdx = i;
    }
  });
  const sessionsSincePr = lastPrIdx === -1 ? values.length : values.length - 1 - lastPrIdx;

  if (values.length < MIN_SESSIONS) {
    return {
      status: "new",
      slopePctPerSession: 0,
      sessionsSincePr,
      reasoning: {
        inputs: { sessionsAvailable: values.length, minSessionsRequired: MIN_SESSIONS },
        computed: {},
        confidence: "high",
        verdict: "new",
      },
    };
  }

  const daysSinceLastTrained = Math.round((nowMs - lastTrainedMs) / 86_400_000);
  if (nowMs - lastTrainedMs > DETRAINING_MS) {
    return {
      status: "detraining",
      slopePctPerSession: 0,
      sessionsSincePr,
      reasoning: {
        inputs: {
          daysSinceLastTrained,
          detrainingThresholdDays: Math.round(DETRAINING_MS / 86_400_000),
        },
        computed: {},
        confidence: "high",
        verdict: "detraining",
      },
    };
  }

  const window = values.slice(-TREND_WINDOW);
  const n = window.length;
  const meanX = (n - 1) / 2;
  const meanY = window.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  window.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const slopePctPerSession = meanY === 0 ? 0 : (slope / meanY) * 100;

  const prRecently = sessionsSincePr <= 1;
  const status: ProgressStatus =
    prRecently || slopePctPerSession > PROGRESSING_SLOPE_THRESHOLD
      ? "progressing"
      : slopePctPerSession < REGRESSING_SLOPE_THRESHOLD
        ? "regressing"
        : "plateaued";

  return {
    status,
    slopePctPerSession,
    sessionsSincePr,
    reasoning: {
      inputs: {
        pointsConsidered: n,
        sessionsAvailable: values.length,
        sessionsSincePr,
        prInLastSession: prRecently,
        progressingAboveSlopePct: PROGRESSING_SLOPE_THRESHOLD,
        regressingBelowSlopePct: REGRESSING_SLOPE_THRESHOLD,
      },
      computed: {
        slopePctPerSession: Math.round(slopePctPerSession * 100) / 100,
        windowMeanValue: Math.round(meanY * 100) / 100,
      },
      confidence: trendConfidence(n),
      verdict: status,
    },
  };
}
