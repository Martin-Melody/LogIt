import { describe, expect, it } from "vitest";
import { acceptRepRangeExperiment } from "./acceptRepRangeExperiment";
import type { ExerciseProgressionState, ProgressionAlgorithm, ProgressionNudge } from "../../domain/progression";
import type { ProgressionDeps } from "./deps";

const OFFER_ID = "linear-progression:rep-range-trial-offer";
const RESULT_ID = "linear-progression:rep-range-trial-result";

function fakeAlgorithm(nudge: ProgressionNudge | undefined): ProgressionAlgorithm {
  return {
    id: "linear-progression",
    name: "Linear Progression",
    description: "test double",
    defaultState: null,
    suggest: () => ({ sets: [], nextState: null, nudge }),
  };
}

function deps(existing: ExerciseProgressionState, nudge: ProgressionNudge | undefined) {
  const saved: { state: ExerciseProgressionState } = { state: existing };
  return {
    workoutRepo: { listRecentSessions: async () => [] },
    exerciseRepo: { getById: async () => null, getByName: async () => null },
    progressionRepo: {
      getConfig: async () => ({ algorithmId: "linear-progression" }),
      getExerciseState: async () => saved.state,
      getAlgorithmPreferences: async () => null,
      saveExerciseState: async (s: ExerciseProgressionState) => {
        saved.state = s;
      },
      listExerciseStates: async () => [],
    },
    algorithmRegistry: { get: async () => fakeAlgorithm(nudge) },
    _saved: saved,
  } as unknown as Pick<ProgressionDeps, "workoutRepo" | "progressionRepo" | "algorithmRegistry" | "exerciseRepo"> & {
    _saved: { state: ExerciseProgressionState };
  };
}

describe("acceptRepRangeExperiment", () => {
  it("starts a trial from the offer nudge's actionData", async () => {
    const existing: ExerciseProgressionState = {
      key: "bench",
      exerciseName: "Bench",
      algorithmId: "linear-progression",
      state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
      updatedAtMs: 0,
    };
    const nudge: ProgressionNudge = {
      id: OFFER_ID,
      message: "Try it?",
      actionLabel: "Try it",
      actionData: { trialRepRange: [10, 15] },
      exclusive: true,
    };
    const d = deps(existing, nudge);

    await acceptRepRangeExperiment({ name: "Bench" }, OFFER_ID, d);

    const state = d._saved.state.state as { repRangeTrial: { status: string; trialRepRange: number[]; baselineRepRange: number[] } };
    expect(state.repRangeTrial.status).toBe("active");
    expect(state.repRangeTrial.trialRepRange).toEqual([10, 15]);
    expect(state.repRangeTrial.baselineRepRange).toEqual([5, 8]);
    expect(d._saved.state.activeExperiment?.id).toBe("rep-range-trial");
  });

  it("switches the baseline range from the result nudge's actionData", async () => {
    const existing: ExerciseProgressionState = {
      key: "bench",
      exerciseName: "Bench",
      algorithmId: "linear-progression",
      state: {
        workingWeight: 100,
        failedAttempts: 0,
        increment: 2.5,
        repRange: [5, 8],
        repRangeTrial: { trialRepRange: [10, 15], baselineRepRange: [5, 8], startedAtMs: 0, status: "concluded" },
      },
      updatedAtMs: 0,
    };
    const nudge: ProgressionNudge = {
      id: RESULT_ID,
      message: "Switch?",
      actionLabel: "Switch",
      actionData: { repRange: [10, 15] },
    };
    const d = deps(existing, nudge);

    await acceptRepRangeExperiment({ name: "Bench" }, RESULT_ID, d);

    const state = d._saved.state.state as { repRange: number[] };
    expect(state.repRange).toEqual([10, 15]);
    expect(d._saved.state.activeExperiment).toBeUndefined();
  });

  it("is a no-op if the fresh suggestion no longer carries this nudge", async () => {
    const existing: ExerciseProgressionState = {
      key: "bench",
      exerciseName: "Bench",
      algorithmId: "linear-progression",
      state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
      updatedAtMs: 0,
    };
    const d = deps(existing, undefined); // algorithm no longer proposes this nudge

    await acceptRepRangeExperiment({ name: "Bench" }, OFFER_ID, d);

    expect(d._saved.state).toEqual(existing);
  });
});
