export const pluginBundle = {
  formatVersion: 1,
  pluginId: "com.example.linear-plus",
  family: "progression-algorithm",
  entryExport: "algorithm",
};

const DEFAULT_STATE = {
  workingWeight: 20,
  currentReps: 8,
  failedAttempts: 0,
  increment: 2.5,
  repFloor: 8,
  repCeiling: 12,
};

const WORKING_SETS = 3;
const DELOAD_THRESHOLD = 2;
const DELOAD_FACTOR = 0.9;

function warmupWeight(weight) {
  return Math.round((weight * 0.6) / 2.5) * 2.5;
}

function makeWarmupSet(weight) {
  return { reps: 5, weight: warmupWeight(weight), setType: "warmup" };
}

function makeWorkingSets(weight, reps) {
  return Array.from({ length: WORKING_SETS }, () => ({
    reps: [reps, reps],
    weight,
    setType: "normal",
  }));
}

function actualReps(set) {
  if (Array.isArray(set.reps)) return set.reps[0];
  return set.reps;
}

export const algorithm = {
  id: "com.example.linear-plus",
  name: "Linear Plus",
  description:
    "Double progression: fill your rep range before adding weight. Includes a warmup set suggestion.",
  author: "Community sample",
  defaultState: DEFAULT_STATE,

  suggest(input) {
    const state =
      input.state && typeof input.state === "object"
        ? { ...DEFAULT_STATE, ...input.state }
        : { ...DEFAULT_STATE };

    const { workingWeight, currentReps, failedAttempts, increment, repFloor, repCeiling } = state;
    const warmup = makeWarmupSet(workingWeight);

    if (input.history.length === 0) {
      return {
        sets: [warmup, ...makeWorkingSets(workingWeight, repFloor)],
        nextState: state,
      };
    }

    const lastSession = input.history[0];
    const workingSets = lastSession.sets.filter(
      (s) => s.setType === "normal" || !s.setType,
    );

    if (workingSets.length === 0) {
      return {
        sets: [warmup, ...makeWorkingSets(workingWeight, currentReps)],
        nextState: state,
      };
    }

    const allHitCeiling = workingSets.every((s) => actualReps(s) >= repCeiling);
    const allHitTarget = workingSets.every((s) => actualReps(s) >= currentReps);
    const anyMissedFloor = workingSets.some((s) => actualReps(s) < repFloor);

    let nextWeight = workingWeight;
    let nextReps = currentReps;
    let nextFailed = failedAttempts;
    let label;

    if (allHitCeiling) {
      nextWeight = workingWeight + increment;
      nextReps = repFloor;
      nextFailed = 0;
      label = `Weight up — ${nextWeight}kg`;
    } else if (anyMissedFloor) {
      nextFailed = failedAttempts + 1;
      if (nextFailed >= DELOAD_THRESHOLD) {
        nextWeight = Math.max(workingWeight * DELOAD_FACTOR, DEFAULT_STATE.workingWeight);
        nextReps = repFloor;
        nextFailed = 0;
        label = `Deload — ${nextWeight}kg`;
      }
    } else if (allHitTarget) {
      nextReps = Math.min(currentReps + 1, repCeiling);
      if (nextReps !== currentReps) {
        label = `Rep up — ${nextReps} reps`;
      }
    }

    return {
      sets: [warmup, ...makeWorkingSets(nextWeight, nextReps)],
      nextState: { ...state, workingWeight: nextWeight, currentReps: nextReps, failedAttempts: nextFailed },
      label,
    };
  },
};
