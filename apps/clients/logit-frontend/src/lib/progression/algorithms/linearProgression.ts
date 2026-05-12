import type { ProgressionAlgorithm, ProgressionInput, ProgressionOutput, PrecedingExercise, SuggestedSet } from "$lib/domain/progression";
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
// Max weight reduction from fatigue: 15%. One preceding exercise that fully
// targets the same primary muscles will apply roughly half of this.
const MAX_FATIGUE_DISCOUNT = 0.15;
const REFERENCE_SETS = 3;

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
// Each preceding exercise's contribution is scaled by its completed sets
// relative to a reference set count (3), so a warm-up with 1 set doesn't
// penalise the same as a full working block.
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
    const setsFactor = Math.min(prev.completedSets, REFERENCE_SETS * 2) / REFERENCE_SETS;

    total += overlapScore * setsFactor;
  }

  return Math.min(total, 1);
}

function suggest(input: ProgressionInput): ProgressionOutput {
  const state: LinearState =
    (input.state as LinearState | null) ??
    seedFromHistory(input.history) ?? {
      ...DEFAULT_STATE,
      workingWeight: input.plannedTargets?.weight ?? DEFAULT_STATE.workingWeight,
    };

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

  let nextWeight = state.workingWeight;
  let failedAttempts = state.failedAttempts;

  if (allHitCeiling) {
    nextWeight = state.workingWeight + state.increment;
    failedAttempts = 0;
  } else if (anyMissedFloor) {
    failedAttempts += 1;
    if (failedAttempts >= DELOAD_THRESHOLD) {
      nextWeight = Math.max(state.workingWeight * DELOAD_FACTOR, DEFAULT_STATE.workingWeight);
      failedAttempts = 0;
    }
  }

  const nextState: LinearState = { ...state, workingWeight: nextWeight, failedAttempts };

  // Apply fatigue discount based on what's been done earlier in this session
  const targetPrimary = (input.exercise.primaryMuscles ?? []) as MuscleGroup[];
  const preceding = input.sessionContext?.precedingExercises ?? [];
  const fatigueScore = computeFatigueScore(targetPrimary, preceding);
  const suggestedWeight = fatigueScore > 0
    ? Math.round((nextWeight * (1 - fatigueScore * MAX_FATIGUE_DISCOUNT)) * 4) / 4  // round to nearest 0.25kg
    : nextWeight;

  const progressionLabel = allHitCeiling
    ? `Weight up — ${nextWeight}kg`
    : anyMissedFloor && failedAttempts === 0
      ? `Deload — ${nextWeight}kg`
      : undefined;

  const fatigueLabel = fatigueScore > 0.1
    ? `Adjusted for fatigue (${Math.round(fatigueScore * MAX_FATIGUE_DISCOUNT * 100)}% reduction)`
    : undefined;

  const label = [progressionLabel, fatigueLabel].filter(Boolean).join(" · ") || undefined;

  return {
    sets: makeWorkingSets(suggestedWeight, state.repRange),
    nextState,
    label,
  };
}

export const linearProgression: ProgressionAlgorithm = {
  id: "linear-progression",
  name: "Linear Progression",
  description:
    "Add weight each session when you hit the top of your rep range. Deload after two consecutive failures. Adjusts for muscle fatigue within a session.",
  author: "logit",
  defaultState: DEFAULT_STATE,
  suggest,
};
