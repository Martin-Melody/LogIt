import { describe, expect, it } from "vitest";
import {
  addExercise,
  addMobilityBlock,
  addSupersetRound,
  blockGroup,
  createSession,
  groupIntoSuperset,
  setGroupRoundRest,
  setGroupSettings,
  updateMobilitySet,
  type MobilityBlockData,
  type WorkoutSession,
} from "./workout";
import {
  applyCircuitSaves,
  canRunCircuit,
  circuitSteps,
  estimateCircuitMs,
  groupTiming,
  currentStep,
  extendCircuit,
  finishRepsCircuit,
  LEAD_IN_MS,
  pauseCircuit,
  phaseRemainingMs,
  resumeCircuit,
  skipCircuit,
  startCircuit,
  startNowCircuit,
  SWITCH_SIDES_MS,
  tickCircuit,
  upcomingSteps,
  type CircuitRun,
} from "./circuit";

const T0 = 1_000_000;

/**
 * Hamstring (hold, 30 s target), Pigeon (per side, 40 s), Push-ups (strength), 2 rounds.
 * No rest between exercises, so the timings below are lead-ins and holds only.
 */
function seed(): { s: WorkoutSession; group: string; ham: string; pigeon: string } {
  let s = createSession(1_000);
  s = addMobilityBlock(s, { drillName: "Hamstring stretch", metric: "hold" });
  s = addMobilityBlock(s, { drillName: "Pigeon stretch", metric: "hold", perSide: true });
  s = addExercise(s, { exerciseName: "Push-ups" });
  const [ham, pigeon, push] = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex).map((b) => b.id);
  const sets = (id: string) => (s.blocks.find((b) => b.id === id)!.data as MobilityBlockData).sets;
  s = updateMobilitySet(s, ham!, sets(ham!)[0]!.id, { targetSec: 30 });
  for (const set of sets(pigeon!)) s = updateMobilitySet(s, pigeon!, set.id, { targetSec: 40 });
  s = groupIntoSuperset(s, [ham!, pigeon!, push!]);
  const group = blockGroup(s.blocks[0]!)!.id;
  s = addSupersetRound(s, group);
  s = setGroupSettings(s, group, { memberRestMs: 0 });
  return { s, group, ham: ham!, pigeon: pigeon! };
}

/** Apply a step's saves and return the new session and run. */
function step(s: WorkoutSession, u: { run: CircuitRun; saves: Parameters<typeof applyCircuitSaves>[1] }) {
  return { s: applyCircuitSaves(s, u.saves), run: u.run };
}

describe("circuitSteps", () => {
  it("runs round by round, drills in order, both sides back to back, strength left out", () => {
    const { s, group } = seed();
    const steps = circuitSteps(s, group);
    expect(steps.map((x) => `${x.round + 1}:${x.drillName}${x.side ? ` ${x.side}` : ""}`)).toEqual([
      "1:Hamstring stretch",
      "1:Pigeon stretch left",
      "1:Pigeon stretch right",
      "2:Hamstring stretch",
      "2:Pigeon stretch left",
      "2:Pigeon stretch right",
    ]);
    expect(steps.map((x) => x.goalSec)).toEqual([30, 40, 40, 30, 40, 40]);
    expect(steps[0]).toMatchObject({ memberIndex: 0, memberCount: 2, roundCount: 2 });
  });

  it("falls back to the drill's last hold, then 30 s", () => {
    let s = createSession(1_000);
    s = addMobilityBlock(s, { drillName: "A" });
    s = addMobilityBlock(s, { drillName: "B" });
    const [a, b] = s.blocks.map((x) => x.id);
    s = groupIntoSuperset(s, [a!, b!]);
    const group = blockGroup(s.blocks[0]!)!.id;
    const aSet = (s.blocks.find((x) => x.id === a)!.data as MobilityBlockData).sets[0]!;
    s = updateMobilitySet(s, a!, aSet.id, { durationSec: 45, completed: true });
    s = addSupersetRound(s, group);
    const steps = circuitSteps(s, group);
    expect(steps.map((x) => x.goalSec)).toEqual([30, 30, 45, 30]);
  });
});

describe("running a circuit", () => {
  it("lead-in, hold that stops on its own, switch sides, and on to the next round", () => {
    const { s: s0, group } = seed();
    let s = s0;
    let run = startCircuit(s, group, T0)!;
    expect(run.phase).toMatchObject({ kind: "lead", switching: false });
    expect(currentStep(s, run)?.drillName).toBe("Hamstring stretch");
    expect(upcomingSteps(s, run).map((x) => x.side)).toEqual(["left", "right"]);

    // 3-2-1, then the 30 s hold.
    ({ s, run } = step(s, tickCircuit(s, run, T0 + LEAD_IN_MS)));
    expect(run.phase.kind).toBe("hold");
    expect(phaseRemainingMs(run, T0 + LEAD_IN_MS + 10_000)).toBe(20_000);

    // The hold ends by itself, is saved, and the pigeon's left side leads in.
    const holdEnd = T0 + LEAD_IN_MS + 30_000;
    ({ s, run } = step(s, tickCircuit(s, run, holdEnd)));
    const ham = circuitSteps(s, group)[0]!;
    expect(ham.completed).toBe(true);
    expect(currentStep(s, run)).toMatchObject({ drillName: "Pigeon stretch", side: "left" });
    expect(run.phase).toMatchObject({ kind: "lead", switching: false });

    // Left side done → a 5 s switch, not the 3-2-1.
    const leftEnd = holdEnd + LEAD_IN_MS + 40_000;
    ({ s, run } = step(s, tickCircuit(s, run, leftEnd)));
    expect(run.phase).toMatchObject({ kind: "lead", switching: true, durationMs: SWITCH_SIDES_MS });
    expect(currentStep(s, run)?.side).toBe("right");
  });

  it("catches up after time in the background, saving each hold at its goal", () => {
    const { s: s0, group } = seed();
    let s = s0;
    let run = startCircuit(s, group, T0)!;
    ({ s, run } = step(s, tickCircuit(s, run, T0 + 60 * 60_000)));
    expect(run.phase.kind).toBe("done");
    const held = s.blocks
      .filter((b) => b.type === "mobility")
      .flatMap((b) => (b.data as MobilityBlockData).sets.map((x) => [x.durationSec, x.completed]));
    expect(held).toEqual([
      [30, true],
      [30, true],
      [40, true],
      [40, true],
      [40, true],
      [40, true],
    ]);
  });

  it("rests between rounds when the circuit has a round rest", () => {
    const { s: s0, group } = seed();
    let s = setGroupRoundRest(s0, group, 60_000);
    let run = startCircuit(s, group, T0)!;
    // Round 1: hamstring 3+30, pigeon L 3+40, R 5+40.
    const roundEnd = T0 + 3_000 + 30_000 + 3_000 + 40_000 + 5_000 + 40_000;
    ({ s, run } = step(s, tickCircuit(s, run, roundEnd)));
    expect(run.phase).toMatchObject({ kind: "rest", durationMs: 60_000 });
    expect(currentStep(s, run)).toMatchObject({ drillName: "Hamstring stretch", round: 1 });

    run = extendCircuit(run, 10_000);
    expect(phaseRemainingMs(run, roundEnd)).toBe(70_000);
    run = startNowCircuit(s, run, roundEnd + 5_000);
    expect(run.phase).toMatchObject({ kind: "lead", endsAtMs: roundEnd + 5_000 + LEAD_IN_MS });
  });

  it("pause freezes the clock; +10 s lengthens the hold and is saved", () => {
    const { s: s0, group } = seed();
    let s = s0;
    let run = startCircuit(s, group, T0)!;
    ({ s, run } = step(s, tickCircuit(s, run, T0 + LEAD_IN_MS)));
    const t = T0 + LEAD_IN_MS + 10_000;
    run = pauseCircuit(run, t);
    // Paused for a minute: nothing moves.
    ({ s, run } = step(s, tickCircuit(s, run, t + 60_000)));
    expect(phaseRemainingMs(run, t + 60_000)).toBe(20_000);
    run = resumeCircuit(run, t + 60_000);
    run = extendCircuit(run, 10_000);
    ({ s, run } = step(s, tickCircuit(s, run, t + 60_000 + 30_000)));
    expect(circuitSteps(s, group)[0]).toMatchObject({ completed: true });
    const hamSet = (s.blocks.find((b) => b.type === "mobility")!.data as MobilityBlockData).sets[0]!;
    expect(hamSet.durationSec).toBe(40);
  });

  it("skip: a hold stopped early keeps its time; a skipped lead-in leaves the set alone", () => {
    const { s: s0, group } = seed();
    let s = s0;
    let run = startCircuit(s, group, T0)!;
    ({ s, run } = step(s, tickCircuit(s, run, T0 + LEAD_IN_MS)));
    ({ s, run } = step(s, skipCircuit(s, run, T0 + LEAD_IN_MS + 12_400)));
    expect(circuitSteps(s, group)[0]).toMatchObject({ completed: true });
    expect((s.blocks.find((b) => b.type === "mobility")!.data as MobilityBlockData).sets[0]!.durationSec).toBe(12);

    // Now in the pigeon's lead-in: skipping it leaves the set unlogged and not offered again.
    const skippedId = currentStep(s, run)!.setId;
    ({ s, run } = step(s, skipCircuit(s, run, T0 + 20_000)));
    expect(circuitSteps(s, group).find((x) => x.setId === skippedId)?.completed).toBe(false);
    expect(currentStep(s, run)?.side).toBe("right");
    expect(run.skipped).toEqual([skippedId]);
  });

  it("rep drills wait for Done and save the reps", () => {
    let s = createSession(1_000);
    s = addMobilityBlock(s, { drillName: "Cat-cow", metric: "reps" });
    s = addMobilityBlock(s, { drillName: "Hamstring stretch" });
    const [a, b] = s.blocks.map((x) => x.id);
    s = groupIntoSuperset(s, [a!, b!]);
    const group = blockGroup(s.blocks[0]!)!.id;
    let run = startCircuit(s, group, T0)!;
    ({ s, run } = step(s, tickCircuit(s, run, T0 + 10 * 60_000)));
    expect(run.phase.kind).toBe("reps"); // no time limit
    expect(currentStep(s, run)?.reps).toBe(10);
    ({ s, run } = step(s, finishRepsCircuit(s, run, 12, T0 + 10 * 60_000)));
    const set = (s.blocks.find((x) => x.id === a)!.data as MobilityBlockData).sets[0]!;
    expect(set).toMatchObject({ reps: 12, completed: true });
    expect(currentStep(s, run)?.drillName).toBe("Hamstring stretch");
  });

  it("starts at the first set not done, and has nothing to run once all are done", () => {
    const { s: s0, group } = seed();
    let s = s0;
    const first = circuitSteps(s, group)[0]!;
    s = updateMobilitySet(s, first.blockId, first.setId, { completed: true, durationSec: 30 });
    expect(currentStep(s, startCircuit(s, group, T0)!)?.side).toBe("left");
    for (const x of circuitSteps(s, group)) s = updateMobilitySet(s, x.blockId, x.setId, { completed: true });
    expect(canRunCircuit(s, group)).toBe(false);
    expect(startCircuit(s, group, T0)).toBeNull();
  });

  it("the round rest survives merging more exercises into the group", () => {
    const { s: s0, group } = seed();
    let s = setGroupRoundRest(s0, group, 45_000);
    s = addMobilityBlock(s, { drillName: "Middle split" });
    const split = s.blocks.find((b) => (b.data as MobilityBlockData).drillName === "Middle split")!.id;
    s = groupIntoSuperset(s, [s.blocks[0]!.id, split]);
    expect(s.blocks.every((b) => blockGroup(b)?.roundRestMs === 45_000)).toBe(true);
    s = setGroupRoundRest(s, group, undefined);
    expect(s.blocks.some((b) => blockGroup(b)?.roundRestMs)).toBe(false);
  });
});

describe("rest between exercises and the get-ready", () => {
  /** Two hold drills (30 s each), 1 round, grouped as `kind` (unset = by count). */
  function pair(kind?: "superset" | "circuit") {
    let s = createSession(1_000);
    s = addMobilityBlock(s, { drillName: "A" });
    s = addMobilityBlock(s, { drillName: "B" });
    const [a, b] = s.blocks.map((x) => x.id);
    s = groupIntoSuperset(s, [a!, b!], undefined, kind);
    return { s, group: blockGroup(s.blocks[0]!)!.id };
  }

  it("a circuit rests between exercises by default (15 s), then leads in", () => {
    const { s: s0, group } = pair("circuit");
    let s = s0;
    let run = startCircuit(s, group, T0)!;
    const aEnd = T0 + LEAD_IN_MS + 30_000;
    ({ s, run } = step(s, tickCircuit(s, run, aEnd)));
    expect(run.phase).toMatchObject({ kind: "rest", between: true, durationMs: 15_000 });
    expect(currentStep(s, run)?.drillName).toBe("B");
    ({ s, run } = step(s, tickCircuit(s, run, aEnd + 15_000)));
    expect(run.phase).toMatchObject({ kind: "lead", endsAtMs: aEnd + 15_000 + LEAD_IN_MS });
  });

  it("a superset doesn't rest between exercises unless it's set", () => {
    const { s: s0, group } = pair();
    let s = s0;
    let run = startCircuit(s, group, T0)!;
    ({ s, run } = step(s, tickCircuit(s, run, T0 + LEAD_IN_MS + 30_000)));
    expect(run.phase.kind).toBe("lead");

    s = setGroupSettings(s0, group, { memberRestMs: 20_000 });
    run = startCircuit(s, group, T0)!;
    ({ s, run } = step(s, tickCircuit(s, run, T0 + LEAD_IN_MS + 30_000)));
    expect(run.phase).toMatchObject({ kind: "rest", durationMs: 20_000 });
  });

  it("switching sides never rests between exercises", () => {
    const { s: s0, group } = seed();
    const s = setGroupSettings(s0, group, { memberRestMs: 20_000 });
    let run = startCircuit(s, group, T0)!;
    let s1 = s;
    // Hamstring, then a rest before the pigeon, then the pigeon's left side.
    ({ s: s1, run } = step(s1, tickCircuit(s1, run, T0 + 3_000 + 30_000)));
    expect(run.phase).toMatchObject({ kind: "rest", between: true });
    ({ s: s1, run } = step(s1, tickCircuit(s1, run, T0 + 3_000 + 30_000 + 20_000 + 3_000 + 40_000)));
    expect(run.phase).toMatchObject({ kind: "lead", switching: true });
  });

  it("the get-ready comes from the group, else the app default, and +10 s lengthens it", () => {
    const { s: s0, group } = pair("circuit");
    let run = startCircuit(s0, group, T0, { leadInMs: 5_000, memberRestMs: 0 })!;
    expect(run.phase).toMatchObject({ kind: "lead", durationMs: 5_000 });
    const s = setGroupSettings(s0, group, { leadInMs: 10_000 });
    run = startCircuit(s, group, T0, { leadInMs: 5_000, memberRestMs: 0 })!;
    expect(run.phase).toMatchObject({ kind: "lead", durationMs: 10_000 });
    run = extendCircuit(run, 10_000);
    expect(run.phase).toMatchObject({ kind: "lead", durationMs: 20_000, endsAtMs: T0 + 20_000 });
    expect(groupTiming(s, group, { leadInMs: 5_000, memberRestMs: 0 })).toEqual({
      leadInMs: 10_000,
      memberRestMs: 0,
      roundRestMs: 0,
    });
  });

  it("estimates one round and the whole group", () => {
    const { s: s0, group } = seed();
    const s = setGroupSettings(s0, group, { memberRestMs: 10_000, roundRestMs: 60_000 });
    // Round: ham 3+30, rest 10, pigeon L 3+40, switch 5, R 40 = 131 s.
    const round = 3_000 + 30_000 + 10_000 + 3_000 + 40_000 + 5_000 + 40_000;
    expect(estimateCircuitMs(s, group)).toEqual({ roundMs: round, totalMs: round * 2 + 60_000 });
  });
});
