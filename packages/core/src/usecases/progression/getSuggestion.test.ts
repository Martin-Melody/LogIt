import { describe, expect, it } from "vitest";
import { getSuggestion } from "./getSuggestion";
import type { ProgressionAlgorithm } from "../../domain/progression";
import type { ProgressionDeps } from "./deps";

const NUDGE_ID = "test-algorithm:some-nudge";

const testAlgorithm: ProgressionAlgorithm = {
  id: "test-algorithm",
  name: "Test",
  description: "Always asks the same nudge, for testing the generic dismissal filter.",
  defaultState: null,
  suggest: () => ({
    sets: [{ reps: 5, weight: 100 }],
    nextState: null,
    nudge: { id: NUDGE_ID, message: "Please help me learn." },
  }),
};

function deps(dismissedNudges: string[] | undefined): ProgressionDeps {
  return {
    workoutRepo: { listRecentSessions: async () => [] },
    exerciseRepo: { getById: async () => null, getByName: async () => null },
    progressionRepo: {
      getConfig: async () => ({ algorithmId: "test-algorithm" }),
      getExerciseState: async () =>
        dismissedNudges
          ? {
              key: "bench",
              exerciseName: "Bench",
              algorithmId: "test-algorithm",
              state: null,
              updatedAtMs: 0,
              dismissedNudges,
            }
          : null,
      getAlgorithmPreferences: async () => null,
    },
    algorithmRegistry: { get: async (id: string) => (id === "test-algorithm" ? testAlgorithm : null) },
  } as unknown as ProgressionDeps;
}

describe("getSuggestion — nudge dismissal filtering", () => {
  it("passes the nudge through when it hasn't been dismissed", async () => {
    const output = await getSuggestion({ name: "Bench" }, deps(undefined));
    expect(output?.nudge?.id).toBe(NUDGE_ID);
  });

  it("passes the nudge through when a different nudge was dismissed", async () => {
    const output = await getSuggestion({ name: "Bench" }, deps(["some-other-nudge"]));
    expect(output?.nudge?.id).toBe(NUDGE_ID);
  });

  it("suppresses the nudge once its id has been dismissed", async () => {
    const output = await getSuggestion({ name: "Bench" }, deps([NUDGE_ID]));
    expect(output?.nudge).toBeUndefined();
    // Everything else from the algorithm still comes through untouched.
    expect(output?.sets[0]!.weight).toBe(100);
  });
});
