import type { ProgressionAlgorithm, ProgressionInput, ProgressionOutput, SuggestedSet } from "$lib/domain/progression";

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

  const label = allHitCeiling
    ? `Weight up — ${nextWeight}kg`
    : anyMissedFloor && failedAttempts === 0
      ? `Deload — ${nextWeight}kg`
      : undefined;

  return {
    sets: makeWorkingSets(nextWeight, state.repRange),
    nextState,
    label,
  };
}

export const linearProgression: ProgressionAlgorithm = {
  id: "linear-progression",
  name: "Linear Progression",
  description:
    "Add weight each session when you hit the top of your rep range. Deload after two consecutive failures.",
  author: "logit",
  defaultState: DEFAULT_STATE,
  suggest,
};
