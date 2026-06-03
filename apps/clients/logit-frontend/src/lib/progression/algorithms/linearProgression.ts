import type { ProgressionAlgorithm, ProgressionInput, ProgressionOutput, PrecedingExercise, SuggestedSet, ExerciseHistoryEntry } from "$lib/domain/progression";
import type { MuscleGroup } from "$lib/domain/exercise";

type LinearState = {
  workingWeight: number;
  failedAttempts: number;
  increment: number;
  repRange: [number, number];
};

const DEFAULT_STATE: LinearState = {
  workingWeight: 20,
  failedAttempts: 0,
  increment: 2.5,
  repRange: [5, 8],
};

const WORKING_SETS = 3;
const DELOAD_THRESHOLD = 2;
const DELOAD_FACTOR = 0.9;
// Max weight reduction from fatigue at default sensitivity: 15%.
const MAX_FATIGUE_DISCOUNT = 0.15;
const REFERENCE_SETS = 3;
// Minimum sessions in each group (fresh / fatigued) before calibration kicks in.
const MIN_CALIBRATION_SAMPLES = 3;
// If >85% of sessions placed this exercise in the same slot, suggest mixing order.
const VARIETY_THRESHOLD = 0.85;
const VARIETY_MIN_SESSIONS = 10;

function makeWorkingSets(weight: number, repRange: [number, number]): SuggestedSet[] {
  return Array.from({ length: WORKING_SETS }, () => ({
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

// Derives a personal fatigue sensitivity multiplier from history by comparing
// performance when the exercise was done first vs. later in a session.
// Returns 1.0 (no change to default discount) until MIN_CALIBRATION_SAMPLES
// sessions exist in both groups.
//
// A user who shows no rep degradation when fatigued gets a lower multiplier
// (smaller discount); one who degrades more than the 10% baseline gets a
// higher multiplier. Clamped to [0.1, 2.0].
function calibrateSensitivity(
  history: ProgressionInput["history"],
  repCeiling: number,
): number {
  const fresh = history.filter((h) => (h.sessionPosition ?? 0) === 0);
  const fatigued = history.filter((h) => (h.sessionPosition ?? 0) > 0);

  if (fresh.length < MIN_CALIBRATION_SAMPLES || fatigued.length < MIN_CALIBRATION_SAMPLES) {
    return 1.0;
  }

  const freshAvg = fresh.reduce((s, h) => s + performanceScore(h, repCeiling), 0) / fresh.length;
  const fatiguedAvg = fatigued.reduce((s, h) => s + performanceScore(h, repCeiling), 0) / fatigued.length;

  if (freshAvg <= 0) return 1.0;

  // How much do reps drop, relative to the fresh baseline?
  const degradation = Math.max(0, (freshAvg - fatiguedAvg) / freshAvg);
  // Normalise: 10% degradation maps to a sensitivity of 1.0 (the default).
  const sensitivity = degradation / 0.1;

  return Math.max(0.1, Math.min(2.0, sensitivity));
}

// Returns true when the exercise has been performed in the same session slot
// for >VARIETY_THRESHOLD of the last VARIETY_MIN_SESSIONS sessions.
// Consistent ordering means calibration data is sparse: without variance in
// position, fresh vs. fatigued comparisons can't converge.
function shouldSuggestVariety(history: ProgressionInput["history"]): boolean {
  if (history.length < VARIETY_MIN_SESSIONS) return false;
  const counts: Record<number, number> = {};
  for (const h of history) {
    const pos = h.sessionPosition ?? 0;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  const maxCount = Math.max(...Object.values(counts));
  return maxCount / history.length > VARIETY_THRESHOLD;
}

function suggest(input: ProgressionInput): ProgressionOutput {
  let state: LinearState =
    (input.state as LinearState | null) ??
    seedFromHistory(input.history) ?? {
      ...DEFAULT_STATE,
      workingWeight: input.plannedTargets?.weight ?? DEFAULT_STATE.workingWeight,
    };

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
      sets: makeWorkingSets(seeded.workingWeight, seeded.repRange),
      nextState: seeded,
    };
  }

  const lastSession = input.history[0];
  const workingSets = lastSession.sets.filter(
    (s) => s.setType === "normal" || !s.setType,
  );

  if (workingSets.length === 0) {
    return {
      sets: makeWorkingSets(state.workingWeight, state.repRange),
      nextState: state,
    };
  }

  const [repFloor, repCeiling] = state.repRange;
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

  const nextState: LinearState = { ...state, workingWeight: nextWeight, failedAttempts };

  // Fatigue discount doesn't apply to assisted exercises (assistance is machine-controlled)
  const targetPrimary = (input.exercise.primaryMuscles ?? []) as MuscleGroup[];
  const preceding = input.sessionContext?.precedingExercises ?? [];
  const fatigueScore = isAssisted ? 0 : computeFatigueScore(targetPrimary, preceding);

  // Personal sensitivity: how much do *this user's* reps actually drop when fatigued?
  // Calibrated from their history; defaults to 1.0 until enough data exists.
  const sensitivity = calibrateSensitivity(input.history, repCeiling);
  const effectiveDiscount = MAX_FATIGUE_DISCOUNT * sensitivity;

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

  const notes = shouldSuggestVariety(input.history)
    ? "Try varying where this exercise falls in your session to improve fatigue estimates."
    : undefined;

  return {
    sets: makeWorkingSets(suggestedWeight, state.repRange),
    nextState,
    label,
    notes,
  };
}

export const linearProgression: ProgressionAlgorithm = {
  id: "linear-progression",
  name: "Linear Progression",
  description:
    "Add weight each session when you hit the top of your rep range. Deload after two consecutive failures. Adjusts for muscle fatigue within a session, calibrated to your personal fatigue response over time.",
  author: "logit",
  defaultState: DEFAULT_STATE,
  suggest,
};
