import { describe, expect, it } from "vitest";
import { getSuggestion, applySessionProgression } from "./getSuggestion";
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
    workoutRepo: { listRecentSessions: async () => [], listAllSessions: async () => [] },
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

const exclusiveAlgorithm: ProgressionAlgorithm = {
  ...testAlgorithm,
  suggest: () => ({
    sets: [{ reps: 5, weight: 100 }],
    nextState: null,
    nudge: { id: NUDGE_ID, message: "Start an experiment?", exclusive: true },
  }),
};

describe("getSuggestion — exclusive nudge suppression", () => {
  function depsWithStates(states: { key: string; activeExperiment?: { id: string; startedAtMs: number } }[]) {
    return {
      workoutRepo: { listRecentSessions: async () => [], listAllSessions: async () => [] },
      exerciseRepo: { getById: async () => null, getByName: async () => null },
      progressionRepo: {
        getConfig: async () => ({ algorithmId: "test-algorithm" }),
        getExerciseState: async () => null,
        getAlgorithmPreferences: async () => null,
        listExerciseStates: async () => states,
      },
      algorithmRegistry: { get: async () => exclusiveAlgorithm },
    } as unknown as ProgressionDeps;
  }

  it("suppresses an exclusive nudge when a different exercise already has one running", async () => {
    const output = await getSuggestion(
      { name: "Bench" },
      depsWithStates([{ key: "squat", activeExperiment: { id: "rep-range-trial", startedAtMs: 0 } }]),
    );
    expect(output?.nudge).toBeUndefined();
  });

  it("still offers an exclusive nudge when no other exercise has one running", async () => {
    const output = await getSuggestion({ name: "Bench" }, depsWithStates([{ key: "squat" }]));
    expect(output?.nudge?.id).toBe(NUDGE_ID);
  });

  it("doesn't suppress based on this same exercise's own (about-to-be-superseded) state", async () => {
    const output = await getSuggestion(
      { name: "Bench" },
      depsWithStates([{ key: "bench", activeExperiment: { id: "rep-range-trial", startedAtMs: 0 } }]),
    );
    expect(output?.nudge?.id).toBe(NUDGE_ID);
  });
});

describe("getSuggestion — rep-range trial muscle-group warm start", () => {
  function deps(siblingTrial: { switched: boolean } | null) {
    const linearAlgorithm: ProgressionAlgorithm = {
      id: "linear-progression",
      name: "Linear Progression",
      description: "test double",
      defaultState: null,
      suggest: (input) => ({
        sets: [],
        nextState: null,
        // Echo the computed warm-start value back so the test can assert on it.
        label: input.suggestedTrialRepRange ? `warm:${input.suggestedTrialRepRange.join("-")}` : undefined,
      }),
    };

    return {
      workoutRepo: { listRecentSessions: async () => [], listAllSessions: async () => [] },
      exerciseRepo: {
        getById: async (id: string) => {
          if (id === "bench") return { id, name: "Bench", primaryMuscles: ["chest"], secondaryMuscles: [] };
          if (id === "incline") return { id, name: "Incline Press", primaryMuscles: ["chest"], secondaryMuscles: [] };
          if (id === "squat") return { id, name: "Squat", primaryMuscles: ["quads"], secondaryMuscles: [] };
          return null;
        },
        getByName: async (name: string) => {
          if (name === "Bench") return { id: "bench", name, primaryMuscles: ["chest"], secondaryMuscles: [] };
          if (name === "Incline Press") return { id: "incline", name, primaryMuscles: ["chest"], secondaryMuscles: [] };
          if (name === "Squat") return { id: "squat", name, primaryMuscles: ["quads"], secondaryMuscles: [] };
          return null;
        },
      },
      progressionRepo: {
        getConfig: async () => ({ algorithmId: "linear-progression" }),
        getExerciseState: async () => null,
        getAlgorithmPreferences: async () => null,
        listExerciseStates: async () =>
          siblingTrial
            ? [
                {
                  key: "incline",
                  exerciseId: "incline",
                  exerciseName: "Incline Press",
                  algorithmId: "linear-progression",
                  state: {
                    repRangeTrial: {
                      trialRepRange: [10, 15],
                      result: { switched: siblingTrial.switched },
                    },
                  },
                  updatedAtMs: 0,
                },
              ]
            : [],
      },
      algorithmRegistry: { get: async () => linearAlgorithm },
    } as unknown as ProgressionDeps;
  }

  it("passes a sibling exercise's winning trial range as the warm start for a same-muscle exercise", async () => {
    const output = await getSuggestion({ name: "Bench" }, deps({ switched: true }));
    expect(output?.label).toBe("warm:10-15");
  });

  it("doesn't warm-start from a sibling trial that didn't win", async () => {
    const output = await getSuggestion({ name: "Bench" }, deps({ switched: false }));
    expect(output?.label).toBeUndefined();
  });

  it("doesn't warm-start from a different muscle group's trial", async () => {
    const output = await getSuggestion({ name: "Squat" }, deps({ switched: true }));
    expect(output?.label).toBeUndefined();
  });

  it("doesn't warm-start when there's no sibling trial at all", async () => {
    const output = await getSuggestion({ name: "Bench" }, deps(null));
    expect(output?.label).toBeUndefined();
  });
});

describe("applySessionProgression", () => {
  function deps(existing: { dismissedNudges?: string[] } | null) {
    const saved: { state: unknown } = { state: existing };
    return {
      progressionRepo: {
        getConfig: async () => ({ algorithmId: "linear-progression" }),
        getExerciseState: async () => saved.state,
        saveExerciseState: async (s: unknown) => {
          saved.state = s;
        },
      },
      _saved: saved,
    } as unknown as Pick<import("./deps").ProgressionDeps, "progressionRepo"> & { _saved: { state: unknown } };
  }

  it("carries forward dismissedNudges from the existing row instead of wiping it", async () => {
    const d = deps({ dismissedNudges: ["linear-progression:order-variety"] });
    await applySessionProgression({ name: "Bench" }, { sets: [], nextState: { repRange: [5, 8] } }, d);
    expect((d._saved.state as { dismissedNudges: string[] }).dismissedNudges).toEqual([
      "linear-progression:order-variety",
    ]);
  });

  it("derives activeExperiment from an active rep-range trial in nextState", async () => {
    const d = deps(null);
    await applySessionProgression(
      { name: "Bench" },
      { sets: [], nextState: { repRange: [5, 8], repRangeTrial: { status: "active", startedAtMs: 123 } } },
      d,
    );
    expect((d._saved.state as { activeExperiment: { id: string; startedAtMs: number } }).activeExperiment).toEqual({
      id: "rep-range-trial",
      startedAtMs: 123,
    });
  });

  it("clears activeExperiment once the trial is no longer active (e.g. concluded)", async () => {
    const d = deps(null);
    await applySessionProgression(
      { name: "Bench" },
      { sets: [], nextState: { repRange: [5, 8], repRangeTrial: { status: "concluded", startedAtMs: 123 } } },
      d,
    );
    expect((d._saved.state as { activeExperiment?: unknown }).activeExperiment).toBeUndefined();
  });
});

// Regression test for a real bug found on-device: history used to be fetched as
// "the most recent HISTORY_WINDOW sessions overall, then filtered to this
// exercise" — so a user training several exercises regularly could see a single
// exercise's own history diluted down to almost nothing, well below what
// calibration/trial thresholds need, even though that exercise itself had plenty
// of history. Fixed by fetching per-exercise (via getExerciseHistory) and capping
// *that*, not the shared cross-exercise session list.
describe("getSuggestion — history isn't diluted by other exercises' more recent sessions", () => {
  it("still sees an exercise's own full history even when many other exercises trained more recently", async () => {
    const echoAlgorithm: ProgressionAlgorithm = {
      id: "test-algorithm",
      name: "Test",
      description: "Echoes history.length back so the test can assert on it.",
      defaultState: null,
      suggest: (input) => ({ sets: [], nextState: null, label: `history:${input.history.length}` }),
    };

    const { createSession, addExercise, addSet, finishSession } = await import("../../domain/workout");
    const now = Date.now();
    const DAY = 86_400_000;

    // Bench: 10 real sessions, all a few months back — nothing unusual.
    const benchSessions = Array.from({ length: 10 }, (_, i) => {
      let s = createSession(now - (200 - i * 5) * DAY);
      s = addExercise(s, { exerciseName: "Bench" });
      s = addSet(s, s.blocks[0]!.id, { weight: 100, reps: 5, setType: "normal" });
      return finishSession(s, now - (200 - i * 5) * DAY + 3_600_000);
    });

    // 25 OTHER exercises' sessions, all more recent than every Bench session —
    // enough to fill (and overflow) the old global HISTORY_WINDOW cap on their own.
    const otherSessions = Array.from({ length: 25 }, (_, i) => {
      const at = now - (24 - i) * DAY;
      let s = createSession(at);
      s = addExercise(s, { exerciseName: `Other ${i}` });
      s = addSet(s, s.blocks[0]!.id, { weight: 50, reps: 8, setType: "normal" });
      return finishSession(s, at + 3_600_000);
    });

    const allSessions = [...benchSessions, ...otherSessions];
    const d = {
      workoutRepo: {
        listRecentSessions: async () => allSessions,
        listAllSessions: async () => allSessions,
      },
      exerciseRepo: { getById: async () => null, getByName: async () => null },
      progressionRepo: {
        getConfig: async () => ({ algorithmId: "test-algorithm" }),
        getExerciseState: async () => null,
        getAlgorithmPreferences: async () => null,
      },
      algorithmRegistry: { get: async () => echoAlgorithm },
    } as unknown as ProgressionDeps;

    const output = await getSuggestion({ name: "Bench" }, d);
    // All 10 of Bench's own sessions should be visible, not just whatever
    // fraction survived a global "most recent 20 overall" cut.
    expect(output?.label).toBe("history:10");
  });
});

describe("getSuggestion — liveInput passthrough (§7 autoregulation accommodation)", () => {
  const echoLiveInputAlgorithm: ProgressionAlgorithm = {
    id: "test-algorithm",
    name: "Test",
    description: "Echoes liveInput back so the passthrough can be asserted on.",
    defaultState: null,
    suggest: (input) => ({
      sets: [],
      nextState: null,
      label: input.liveInput ? `live:${input.liveInput.rpe ?? "-"}:${input.liveInput.readiness ?? "-"}` : undefined,
    }),
  };

  function deps(): ProgressionDeps {
    return {
      workoutRepo: { listRecentSessions: async () => [], listAllSessions: async () => [] },
      exerciseRepo: { getById: async () => null, getByName: async () => null },
      progressionRepo: {
        getConfig: async () => ({ algorithmId: "test-algorithm" }),
        getExerciseState: async () => null,
        getAlgorithmPreferences: async () => null,
      },
      algorithmRegistry: { get: async () => echoLiveInputAlgorithm },
    } as unknown as ProgressionDeps;
  }

  it("is undefined by default — a built-in/plugin algorithm that ignores it sees nothing", async () => {
    const output = await getSuggestion({ name: "Bench" }, deps());
    expect(output?.label).toBeUndefined();
  });

  it("passes rpe/readiness straight through to the algorithm untouched", async () => {
    const output = await getSuggestion({ name: "Bench" }, deps(), undefined, undefined, { rpe: 8, readiness: 6 });
    expect(output?.label).toBe("live:8:6");
  });
});
