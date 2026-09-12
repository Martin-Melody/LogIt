import { describe, expect, it } from "vitest";
import { linearProgression } from "./linearProgression";
import type { ProgressionInput, ExerciseHistoryEntry, PrecedingExercise } from "@logit/core/domain/progression";
import type { SetEntry } from "@logit/core/domain/workout";

let nextSetId = 0;
function set(overrides: Partial<SetEntry> = {}): SetEntry {
  nextSetId += 1;
  return {
    id: `set-${nextSetId}`,
    setType: "normal",
    reps: 8,
    weight: 100,
    orderIndex: 0,
    ...overrides,
  };
}

function historyEntry(overrides: Partial<ExerciseHistoryEntry> = {}): ExerciseHistoryEntry {
  return {
    sessionId: "s1",
    performedAtMs: Date.now(),
    sets: [set(), set(), set()],
    ...overrides,
  };
}

function baseInput(overrides: Partial<ProgressionInput> = {}): ProgressionInput {
  return {
    exercise: { name: "Bench", primaryMuscles: ["chest"] },
    history: [],
    state: null,
    userPreferences: null,
    ...overrides,
  };
}

describe("linearProgression", () => {
  it("seeds from planned targets when there's no history", async () => {
    const out = await linearProgression.suggest(baseInput({ plannedTargets: { weight: 60, reps: 5 } }));
    expect(out.sets[0]!.weight).toBe(60);
    expect(out.reasoning?.confidence).toBe("low");
    expect(out.reasoning?.verdict).toMatch(/seeded/);
  });

  it("adds the increment when all working sets hit the rep ceiling", async () => {
    const input = baseInput({
      state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
      history: [historyEntry()], // all sets at 8 reps = ceiling
    });
    const out = await linearProgression.suggest(input);
    expect(out.label).toMatch(/Next: 102\.5kg/);
    expect(out.reasoning?.verdict).toMatch(/Next: 102\.5kg/);
    expect(out.reasoning?.inputs.allSetsHitCeiling).toBe(true);
  });

  it("deloads after two consecutive failed attempts, not the first", async () => {
    const failing = historyEntry({ sets: [set({ reps: 3 })] });

    const firstMiss = await linearProgression.suggest(
      baseInput({
        state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
        history: [failing],
      }),
    );
    // First miss is recorded but doesn't deload or label anything yet.
    expect(firstMiss.label).toBeUndefined();
    expect((firstMiss.nextState as { workingWeight: number }).workingWeight).toBe(100);
    expect((firstMiss.nextState as { failedAttempts: number }).failedAttempts).toBe(1);

    const secondMiss = await linearProgression.suggest(
      baseInput({
        state: { workingWeight: 100, failedAttempts: 1, increment: 2.5, repRange: [5, 8] },
        history: [failing],
      }),
    );
    expect((secondMiss.nextState as { workingWeight: number }).workingWeight).toBeCloseTo(90, 5);
    expect((secondMiss.nextState as { failedAttempts: number }).failedAttempts).toBe(0);
  });

  describe("reasoning", () => {
    const preceding: PrecedingExercise[] = [
      { name: "Incline press", primaryMuscles: ["chest"], secondaryMuscles: [], completedSets: 3, effortFactor: 1 },
    ];

    it("is low confidence when there isn't enough history to calibrate fatigue sensitivity", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history: [historyEntry()],
          sessionContext: { precedingExercises: preceding },
        }),
      );
      expect(out.reasoning?.confidence).toBe("low");
      expect(out.reasoning?.inputs.fatigueCalibrated).toBe(false);
      // Uncalibrated still applies the generic 15% baseline discount, not zero.
      expect(out.reasoning?.computed.fatigueSensitivityMultiplier).toBe(1);
    });

    it("reaches medium/high confidence once enough fresh vs. fatigued sessions exist", async () => {
      // 6 sessions at position 0 (fresh), 6 at position 1+ (fatigued), with a real
      // rep drop in the fatigued group, so calibration has something to find.
      const fresh = Array.from({ length: 6 }, () => historyEntry({ sessionPosition: 0 }));
      const fatigued = Array.from({ length: 6 }, () =>
        historyEntry({ sessionPosition: 1, sets: [set({ reps: 6 })] }),
      );

      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history: [...fatigued, ...fresh], // order doesn't matter to calibration
          sessionContext: { precedingExercises: preceding },
        }),
      );
      expect(out.reasoning?.inputs.fatigueCalibrated).toBe(true);
      expect(out.reasoning?.confidence).toBe("high");
      expect(out.reasoning?.computed.fatigueSensitivityMultiplier).not.toBe(1);
    });

    it("computed.suggestedWeight always matches the actual first suggested set's weight", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history: [historyEntry()],
          sessionContext: { precedingExercises: preceding },
        }),
      );
      expect(out.reasoning?.computed.suggestedWeight).toBe(out.sets[0]!.weight);
    });
  });

  describe("order-variety nudge", () => {
    it("doesn't ask with too little history, even though it's uncalibrated", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history: [historyEntry(), historyEntry(), historyEntry()], // 3 < the 6-session minimum
        }),
      );
      expect(out.reasoning?.inputs.fatigueCalibrated).toBe(false);
      expect(out.nudge).toBeUndefined();
    });

    it("asks once there's enough history but still no position variety to calibrate from", async () => {
      const history = Array.from({ length: 8 }, () => historyEntry()); // all sessionPosition undefined/0
      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history,
        }),
      );
      expect(out.reasoning?.inputs.fatigueCalibrated).toBe(false);
      expect(out.nudge?.id).toBe("linear-progression:order-variety");
      expect(out.nudge?.message).toMatch(/different point in your session/);
    });

    it("stops asking once calibrated, regardless of how much history exists", async () => {
      const fresh = Array.from({ length: 6 }, () => historyEntry({ sessionPosition: 0 }));
      const fatigued = Array.from({ length: 6 }, () =>
        historyEntry({ sessionPosition: 1, sets: [set({ reps: 6 })] }),
      );
      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history: [...fatigued, ...fresh],
        }),
      );
      expect(out.reasoning?.inputs.fatigueCalibrated).toBe(true);
      expect(out.nudge).toBeUndefined();
    });
  });

  describe("rep-range experimentation", () => {
    const OFFER_ID = "linear-progression:rep-range-trial-offer";
    const RESULT_ID = "linear-progression:rep-range-trial-result";

    // Calibrated on fatigue (6 fresh / 6 fatigued) so the order-variety nudge never
    // fires here — isolates these assertions to the rep-range nudge specifically.
    const calibratedHistory = [
      ...Array.from({ length: 6 }, () => historyEntry({ sessionPosition: 0 })),
      ...Array.from({ length: 6 }, () => historyEntry({ sessionPosition: 1, sets: [set({ reps: 6 })] })),
    ];

    it("offers a trial once enabled with enough history and none already run", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history: calibratedHistory,
          userPreferences: { repRangeExperimentsEnabled: true },
        }),
      );
      expect(out.nudge?.id).toBe(OFFER_ID);
      expect(out.nudge?.actionLabel).toBe("Try it");
      expect(out.nudge?.exclusive).toBe(true);
      expect(out.nudge?.actionData).toEqual({ trialRepRange: [8, 15], baselineRepRange: [5, 8] });
    });

    it("doesn't offer when the feature is disabled", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history: calibratedHistory,
          userPreferences: { repRangeExperimentsEnabled: false },
        }),
      );
      expect(out.nudge).toBeUndefined();
    });

    it("uses a muscle-group warm-start value when provided, instead of the default heuristic", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: { workingWeight: 100, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
          history: calibratedHistory,
          userPreferences: { repRangeExperimentsEnabled: true },
          suggestedTrialRepRange: [10, 15],
        }),
      );
      expect(out.nudge?.actionData).toEqual({ trialRepRange: [10, 15], baselineRepRange: [5, 8] });
    });

    it("doesn't offer a second trial once one has already run, regardless of its result", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeTrial: {
              trialRepRange: [10, 15],
              baselineRepRange: [5, 8],
              startedAtMs: 0,
              status: "concluded",
              result: { trialSlopePctPerSession: 0, baselineSlopePctPerSession: 0, switched: false, concludedAtMs: 0 },
            },
          },
          history: calibratedHistory,
          userPreferences: { repRangeExperimentsEnabled: true },
        }),
      );
      expect(out.nudge?.id).not.toBe(OFFER_ID);
    });

    it("prescribes the trial range while a trial is active but not yet concluded", async () => {
      const now = Date.now();
      const trialStart = now - 2 * 86_400_000;
      const history = [
        historyEntry({ performedAtMs: trialStart + 1000 }), // 1 trial session so far — below the block size
        ...Array.from({ length: 4 }, (_, i) => historyEntry({ performedAtMs: trialStart - (i + 1) * 86_400_000 })),
      ];
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeTrial: { trialRepRange: [10, 15], baselineRepRange: [5, 8], startedAtMs: trialStart, status: "active" },
          },
          history,
        }),
      );
      expect(out.sets[0]!.reps).toEqual([10, 15]);
      expect(out.nudge).toBeUndefined(); // mid-trial — nothing to report yet
      expect((out.nextState as { repRangeTrial: { status: string } }).repRangeTrial.status).toBe("active");
    });

    it("concludes a trial once enough sessions are logged and proposes switching when it clearly wins", async () => {
      const now = Date.now();
      const trialStart = now - 10 * 86_400_000;
      // Rising e1RM across the trial block; flat across the baseline block.
      const trialEntries = Array.from({ length: 4 }, (_, i) =>
        historyEntry({
          performedAtMs: trialStart + (i + 1) * 86_400_000,
          sets: [set({ weight: 100 + i * 10, reps: 10 })],
        }),
      );
      const baselineEntries = Array.from({ length: 4 }, (_, i) =>
        historyEntry({
          performedAtMs: trialStart - (i + 1) * 86_400_000,
          sets: [set({ weight: 100, reps: 6 })],
        }),
      );
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeTrial: { trialRepRange: [10, 15], baselineRepRange: [5, 8], startedAtMs: trialStart, status: "active" },
          },
          history: [...trialEntries, ...baselineEntries],
        }),
      );
      const nextTrial = (out.nextState as { repRangeTrial: { status: string; result: { switched: boolean } } })
        .repRangeTrial;
      expect(nextTrial.status).toBe("concluded");
      expect(nextTrial.result.switched).toBe(true);
      expect(out.nudge?.id).toBe(RESULT_ID);
      expect(out.nudge?.actionLabel).toBe("Switch");
      expect(out.nudge?.actionData).toEqual({ repRange: [10, 15] });
      // Reverts to the baseline range for this suggestion, pending the user's decision.
      expect(out.sets[0]!.reps).toEqual([5, 8]);
    });

    it("reports no meaningful difference (and offers no action) when the trial doesn't clearly beat baseline", async () => {
      const now = Date.now();
      const trialStart = now - 10 * 86_400_000;
      const trialEntries = Array.from({ length: 4 }, (_, i) =>
        historyEntry({ performedAtMs: trialStart + (i + 1) * 86_400_000, sets: [set({ weight: 100, reps: 10 })] }),
      );
      const baselineEntries = Array.from({ length: 4 }, (_, i) =>
        historyEntry({ performedAtMs: trialStart - (i + 1) * 86_400_000, sets: [set({ weight: 100, reps: 6 })] }),
      );
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeTrial: { trialRepRange: [10, 15], baselineRepRange: [5, 8], startedAtMs: trialStart, status: "active" },
          },
          history: [...trialEntries, ...baselineEntries],
        }),
      );
      const nextTrial = (out.nextState as { repRangeTrial: { result: { switched: boolean } } }).repRangeTrial;
      expect(nextTrial.result.switched).toBe(false);
      expect(out.nudge?.actionLabel).toBeUndefined();
    });

    // Regression coverage: a concluded trial used to only get a nudge in the
    // exact call where it transitioned from active — viewing it again later
    // (with no session logged in between, so nothing new persisted) showed
    // nothing at all, silently losing the "want to switch?" decision.
    it("keeps proposing a winning trial's result on later views, not just the moment it concluded", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8], // baseline — not yet switched
            repRangeTrial: {
              trialRepRange: [10, 15],
              baselineRepRange: [5, 8],
              startedAtMs: 0,
              status: "concluded",
              result: { trialSlopePctPerSession: 2, baselineSlopePctPerSession: 0.3, switched: true, concludedAtMs: 0 },
            },
          },
          history: calibratedHistory,
        }),
      );
      expect(out.nudge?.id).toBe(RESULT_ID);
      expect(out.nudge?.actionLabel).toBe("Switch");
    });

    it("stops proposing a switch once state.repRange already matches the trial range (i.e. already switched)", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [10, 15], // already matches trialRepRange — the switch already happened
            repRangeTrial: {
              trialRepRange: [10, 15],
              baselineRepRange: [5, 8],
              startedAtMs: 0,
              status: "concluded",
              result: { trialSlopePctPerSession: 2, baselineSlopePctPerSession: 0.3, switched: true, concludedAtMs: 0 },
            },
          },
          history: calibratedHistory,
        }),
      );
      expect(out.nudge?.id).not.toBe(RESULT_ID);
    });

    it("keeps proposing a 'no difference' result too, until dismissed", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeTrial: {
              trialRepRange: [10, 15],
              baselineRepRange: [5, 8],
              startedAtMs: 0,
              status: "concluded",
              result: { trialSlopePctPerSession: 0.3, baselineSlopePctPerSession: 0.3, switched: false, concludedAtMs: 0 },
            },
          },
          history: calibratedHistory,
        }),
      );
      expect(out.nudge?.id).toBe(RESULT_ID);
      expect(out.nudge?.actionLabel).toBeUndefined();
    });
  });
});
