import { describe, expect, it } from "vitest";
import { linearProgression } from "./linearProgression";
import type { ProgressionInput, ExerciseHistoryEntry, PrecedingExercise } from "../../domain/progression";
import type { SetEntry } from "../../domain/workout";

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
    expect(out.label).toMatch(/Up to 102\.5kg/);
    expect(out.reasoning?.verdict).toMatch(/Up to 102\.5kg/);
    expect(out.sets[0]!.weight).toBe(102.5);
    expect(out.sets.map((s) => s.reps)).toEqual([5, 5, 5]); // new weight → bottom of the range
    expect(out.change?.kind).toBe("increase");
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
    // First miss is recorded but doesn't deload yet — it only warns.
    expect(firstMiss.label).toMatch(/again → deload/);
    expect(firstMiss.change?.kind).toBe("repeat");
    expect((firstMiss.nextState as { workingWeight: number }).workingWeight).toBe(100);
    expect((firstMiss.nextState as { failedAttempts: number }).failedAttempts).toBe(1);

    const secondMiss = await linearProgression.suggest(
      baseInput({
        state: { workingWeight: 100, failedAttempts: 1, increment: 2.5, repRange: [5, 8] },
        history: [failing],
      }),
    );
    expect((secondMiss.nextState as { workingWeight: number }).workingWeight).toBeCloseTo(90, 5);
    expect(secondMiss.change?.kind).toBe("deload");
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
      expect(out.nudge?.id).toBe(`${OFFER_ID}:rung0`);
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

    it("offers the next rung once the first concludes without a real difference (§10.3.1 ladder)", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeLadder: [
              {
                trialRepRange: [10, 15],
                baselineRepRange: [5, 8],
                startedAtMs: 0,
                status: "concluded",
                result: { trialSlopePctPerSession: 0, baselineSlopePctPerSession: 0, switched: false, concludedAtMs: 0 },
              },
            ],
          },
          history: calibratedHistory,
          userPreferences: { repRangeExperimentsEnabled: true },
        }),
      );
      expect(out.nudge?.id).toBe(`${OFFER_ID}:rung1`);
      expect(out.nudge?.actionLabel).toBe("Try it");
      // Climbs from the previous rung's own ceiling (15), not back to the original baseline.
      expect(out.nudge?.actionData).toEqual({ trialRepRange: [15, 22], baselineRepRange: [5, 8] });
    });

    it("gives up after MAX_LADDER_RUNGS attempts with no real difference, and stops offering more", async () => {
      const rejected = (trialRepRange: [number, number]) => ({
        trialRepRange,
        baselineRepRange: [5, 8] as [number, number],
        startedAtMs: 0,
        status: "concluded" as const,
        result: { trialSlopePctPerSession: 0, baselineSlopePctPerSession: 0, switched: false, concludedAtMs: 0 },
      });
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeLadder: [rejected([8, 15]), rejected([15, 22]), rejected([22, 29])],
          },
          history: calibratedHistory,
          userPreferences: { repRangeExperimentsEnabled: true },
        }),
      );
      expect(out.nudge?.id).toBe(`${RESULT_ID}:rung2`);
      expect(out.nudge?.actionLabel).toBeUndefined();
      expect(out.nudge?.message).toContain("keeping your usual 5-8");
    });

    it("climbs past a sibling's already-ruled-out range instead of re-litigating it", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeLadder: [
              {
                trialRepRange: [10, 15],
                baselineRepRange: [5, 8],
                startedAtMs: 0,
                status: "concluded",
                result: { trialSlopePctPerSession: 0, baselineSlopePctPerSession: 0, switched: false, concludedAtMs: 0 },
              },
            ],
          },
          history: calibratedHistory,
          userPreferences: { repRangeExperimentsEnabled: true },
          siblingRuledOutRepRanges: [[15, 22]],
        }),
      );
      expect(out.nudge?.actionData).toEqual({ trialRepRange: [22, 29], baselineRepRange: [5, 8] });
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
            repRangeLadder: [{ trialRepRange: [10, 15], baselineRepRange: [5, 8], startedAtMs: trialStart, status: "active" }],
          },
          history,
        }),
      );
      // Last session's 8s at 100kg sit below the trial range, so every set aims for its floor.
      expect(out.sets[0]!.reps).toBe(10);
      expect(out.progressGoal?.reps).toBe(15);
      expect(out.nudge).toBeUndefined(); // mid-trial — nothing to report yet
      const ladder = (out.nextState as { repRangeLadder: { status: string }[] }).repRangeLadder;
      expect(ladder[ladder.length - 1]!.status).toBe("active");
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
            repRangeLadder: [{ trialRepRange: [10, 15], baselineRepRange: [5, 8], startedAtMs: trialStart, status: "active" }],
          },
          history: [...trialEntries, ...baselineEntries],
        }),
      );
      const ladder = (out.nextState as { repRangeLadder: { status: string; result: { switched: boolean } }[] })
        .repRangeLadder;
      const nextTrial = ladder[ladder.length - 1]!;
      expect(nextTrial.status).toBe("concluded");
      expect(nextTrial.result.switched).toBe(true);
      expect(out.nudge?.id).toBe(`${RESULT_ID}:rung0`);
      expect(out.nudge?.actionLabel).toBe("Switch");
      expect(out.nudge?.actionData).toEqual({ repRange: [10, 15] });
      // Reverts to the baseline range for this suggestion, pending the user's decision.
      expect(out.progressGoal?.reps).toBe(8);
      const reps = out.sets[0]!.reps as number;
      expect(reps).toBeGreaterThanOrEqual(5);
      expect(reps).toBeLessThanOrEqual(8);
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
            repRangeLadder: [{ trialRepRange: [10, 15], baselineRepRange: [5, 8], startedAtMs: trialStart, status: "active" }],
          },
          history: [...trialEntries, ...baselineEntries],
        }),
      );
      const ladder = (out.nextState as { repRangeLadder: { result: { switched: boolean } }[] }).repRangeLadder;
      expect(ladder[ladder.length - 1]!.result.switched).toBe(false);
      // No real difference, but the ladder isn't at its cap yet — offers the
      // next rung rather than a dead-end FYI.
      expect(out.nudge?.actionLabel).toBe("Try it");
      expect(out.nudge?.id).toBe(`${OFFER_ID}:rung1`);
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
            repRangeLadder: [
              {
                trialRepRange: [10, 15],
                baselineRepRange: [5, 8],
                startedAtMs: 0,
                status: "concluded",
                result: { trialSlopePctPerSession: 2, baselineSlopePctPerSession: 0.3, switched: true, concludedAtMs: 0 },
              },
            ],
          },
          history: calibratedHistory,
        }),
      );
      expect(out.nudge?.id).toBe(`${RESULT_ID}:rung0`);
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
            repRangeLadder: [
              {
                trialRepRange: [10, 15],
                baselineRepRange: [5, 8],
                startedAtMs: 0,
                status: "concluded",
                result: { trialSlopePctPerSession: 2, baselineSlopePctPerSession: 0.3, switched: true, concludedAtMs: 0 },
              },
            ],
          },
          history: calibratedHistory,
        }),
      );
      expect(out.nudge?.id).not.toBe(`${RESULT_ID}:rung0`);
      expect(out.nudge).toBeUndefined();
    });

    it("keeps proposing the next-rung offer too, until dismissed or accepted", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          state: {
            workingWeight: 100,
            failedAttempts: 0,
            increment: 2.5,
            repRange: [5, 8],
            repRangeLadder: [
              {
                trialRepRange: [10, 15],
                baselineRepRange: [5, 8],
                startedAtMs: 0,
                status: "concluded",
                result: { trialSlopePctPerSession: 0.3, baselineSlopePctPerSession: 0.3, switched: false, concludedAtMs: 0 },
              },
            ],
          },
          history: calibratedHistory,
        }),
      );
      expect(out.nudge?.id).toBe(`${OFFER_ID}:rung1`);
      expect(out.nudge?.actionLabel).toBe("Try it");
      expect(out.nudge?.message).toContain("No meaningful difference at 10-15 reps");
    });
  });

  describe("exact per-set targets", () => {
    const state = { workingWeight: 62.5, failedAttempts: 0, increment: 2.5, repRange: [5, 8] as [number, number] };
    const last = historyEntry({
      sessionId: "last",
      sets: [
        set({ weight: 62.5, reps: 6, orderIndex: 0 }),
        set({ weight: 62.5, reps: 5, orderIndex: 1 }),
        set({ weight: 62.5, reps: 5, orderIndex: 2 }),
      ],
    });

    it("aims one rep higher per set at the same weight", async () => {
      const out = await linearProgression.suggest(baseInput({ state, history: [last] }));
      expect(out.sets.map((s) => s.reps)).toEqual([7, 6, 6]);
      expect(out.sets.every((s) => s.weight === 62.5)).toBe(true);
      expect(out.change).toMatchObject({ kind: "reps", text: "+1 rep" });
      expect(out.progressGoal).toEqual({ reps: 8, weight: 65 });
    });

    it("never aims past the top of the range", async () => {
      const nearTop = historyEntry({ sets: [set({ weight: 62.5, reps: 8 }), set({ weight: 62.5, reps: 7 })] });
      const out = await linearProgression.suggest(baseInput({ state, history: [nearTop] }));
      expect(out.sets.map((s) => s.reps)).toEqual([8, 8, 8]);
    });

    it("uses a split day's planned set count", async () => {
      const out = await linearProgression.suggest(baseInput({ state, history: [last], plannedTargets: { sets: 4 } }));
      expect(out.sets.map((s) => s.reps)).toEqual([7, 6, 6, 6]);
    });
  });

  describe("applying a session exactly once", () => {
    const start = { workingWeight: 60, failedAttempts: 0, increment: 2.5, repRange: [5, 8] as [number, number] };
    const hitTop = historyEntry({ sessionId: "s1", sets: [set({ weight: 60, reps: 8 }), set({ weight: 60, reps: 8 }), set({ weight: 60, reps: 8 })] });

    it("previews today's weight without stepping it again", async () => {
      const finished = await linearProgression.suggest(baseInput({ state: start, history: [hitTop] }));
      expect((finished.nextState as { workingWeight: number }).workingWeight).toBe(62.5);

      // Next visit to the session screen: same history, state already includes s1.
      const preview = await linearProgression.suggest(baseInput({ state: finished.nextState, history: [hitTop] }));
      expect(preview.sets[0]!.weight).toBe(62.5);
      expect(preview.label).toBe("Up to 62.5kg");
      expect(preview.nextState).toEqual(finished.nextState);
    });

    it("doesn't count one missed session twice", async () => {
      const miss = historyEntry({ sessionId: "s2", sets: [set({ weight: 62.5, reps: 4 }), set({ weight: 62.5, reps: 3 })] });
      const s = { ...start, workingWeight: 62.5 };
      const once = await linearProgression.suggest(baseInput({ state: s, history: [miss] }));
      const again = await linearProgression.suggest(baseInput({ state: once.nextState, history: [miss] }));
      expect((again.nextState as { failedAttempts: number }).failedAttempts).toBe(1);
      expect((again.nextState as { workingWeight: number }).workingWeight).toBe(62.5);
      expect(again.change?.kind).toBe("repeat");
    });

    it("keeps a deload instead of jumping back to the heavier history weight", async () => {
      const miss = historyEntry({ sessionId: "s3", sets: [set({ weight: 62.5, reps: 4 })] });
      const deloaded = await linearProgression.suggest(
        baseInput({ state: { ...start, workingWeight: 62.5, failedAttempts: 1 }, history: [miss] }),
      );
      expect((deloaded.nextState as { workingWeight: number }).workingWeight).toBe(55); // 56.25 rounded down to 2.5s
      const preview = await linearProgression.suggest(baseInput({ state: deloaded.nextState, history: [miss] }));
      expect(preview.sets[0]!.weight).toBe(55);
      expect(preview.change?.kind).toBe("deload");
      expect(preview.sets.map((x) => x.reps)).toEqual([5, 5, 5]);
    });

    it("treats a state saved after the newest session (from before this was tracked) as already applied", async () => {
      const legacy = { ...start, workingWeight: 62.5 }; // saved on finishing hitTop, no lastAppliedSessionId
      const preview = await linearProgression.suggest(
        baseInput({ state: legacy, history: [hitTop], stateSavedAtMs: hitTop.performedAtMs + 1000 }),
      );
      expect(preview.sets[0]!.weight).toBe(62.5);
      expect((preview.nextState as { lastAppliedSessionId: string }).lastAppliedSessionId).toBe("s1");
    });

    it("still applies a newer session to a state saved before it", async () => {
      const legacy = { ...start, workingWeight: 60 };
      const out = await linearProgression.suggest(
        baseInput({ state: legacy, history: [hitTop], stateSavedAtMs: hitTop.performedAtMs - 1000 }),
      );
      expect(out.sets[0]!.weight).toBe(62.5);
    });
  });

  describe("assisted exercises", () => {
    const assisted = { name: "Assisted Dips", exerciseType: "assisted" as const };
    const at30 = historyEntry({ sessionId: "a1", sets: [set({ weight: 30, reps: 8 }), set({ weight: 30, reps: 8 })] });

    it("takes a fresh state's starting assistance from history", async () => {
      const out = await linearProgression.suggest(
        baseInput({ exercise: assisted, history: [at30], state: { workingWeight: 0, failedAttempts: 0, increment: 2.5, repRange: [5, 8] } }),
      );
      expect(out.sets[0]!.weight).toBe(27.5);
    });

    it("doesn't pull reduced assistance back up to an older, higher number", async () => {
      const out = await linearProgression.suggest(
        baseInput({
          exercise: assisted,
          history: [historyEntry({ sessionId: "a2", sets: [set({ weight: 30, reps: 6 })] })],
          state: { workingWeight: 25, failedAttempts: 0, increment: 2.5, repRange: [5, 8] },
        }),
      );
      expect(out.sets[0]!.weight).toBe(25);
    });
  });
});
