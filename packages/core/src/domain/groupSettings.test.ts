import { describe, expect, it } from "vitest";
import {
  addExercise,
  addMobilityBlock,
  addSupersetRound,
  blockGroup,
  canRemoveSupersetRound,
  createSession,
  groupIntoSuperset,
  groupProgress,
  groupRounds,
  removeSupersetRound,
  setGroupSettings,
  supersetMembers,
  supersetRoundCount,
  updateMobilitySet,
  updateSet,
  type MobilityBlockData,
  type StrengthBlockData,
  type WorkoutSession,
} from "./workout";

/** Bench (strength, 1 set), Pigeon (mobility, per side, 2 pairs), grouped: 2 rounds. */
function seed(): { s: WorkoutSession; group: string } {
  let s = createSession(1_000);
  s = addExercise(s, { exerciseName: "Bench press" });
  s = addMobilityBlock(s, { drillName: "Pigeon stretch", perSide: true });
  const [bench, pigeon] = s.blocks.map((b) => b.id);
  s = groupIntoSuperset(s, [bench!, pigeon!]);
  const group = blockGroup(s.blocks[0]!)!.id;
  s = addSupersetRound(s, group);
  return { s, group };
}

const rounds = (s: WorkoutSession, group: string) => supersetRoundCount(supersetMembers(s, group));

describe("setGroupSettings", () => {
  it("sets the name and timings on every member; null and an empty name clear them", () => {
    const { s: s0, group } = seed();
    let s = setGroupSettings(s0, group, { label: "  Hip warm-up ", memberRestMs: 0, leadInMs: 5_000 });
    for (const b of s.blocks) {
      expect(blockGroup(b)).toMatchObject({ label: "Hip warm-up", memberRestMs: 0, leadInMs: 5_000 });
    }
    s = setGroupSettings(s, group, { label: "", memberRestMs: null });
    const info = blockGroup(s.blocks[0]!)!;
    expect(info.label).toBeUndefined();
    expect("memberRestMs" in info).toBe(false);
    expect(info.leadInMs).toBe(5_000);
  });

  it("keeps a group's settings when more exercises are merged in", () => {
    const { s: s0, group } = seed();
    let s = setGroupSettings(s0, group, { memberRestMs: 0, leadInMs: 10_000, roundRestMs: 0 });
    s = addMobilityBlock(s, { drillName: "Middle split" });
    const split = s.blocks.find((b) => b.type === "mobility" && (b.data as MobilityBlockData).drillName === "Middle split")!;
    s = groupIntoSuperset(s, [s.blocks[0]!.id, split.id]);
    expect(blockGroup(s.blocks.find((b) => b.id === split.id)!)).toMatchObject({
      id: group,
      memberRestMs: 0,
      leadInMs: 10_000,
      roundRestMs: 0,
    });
  });
});

describe("removeSupersetRound", () => {
  it("removes the last round when nothing in it is logged, but keeps one round", () => {
    const { s: s0, group } = seed();
    expect(rounds(s0, group)).toBe(2);
    expect(canRemoveSupersetRound(s0, group)).toBe(true);
    const s = removeSupersetRound(s0, group);
    expect(rounds(s, group)).toBe(1);
    const pigeon = s.blocks.find((b) => b.type === "mobility")!.data as MobilityBlockData;
    expect(pigeon.sets).toHaveLength(2); // one L/R pair
    expect(canRemoveSupersetRound(s, group)).toBe(false);
    expect(removeSupersetRound(s, group)).toBe(s);
  });

  it("never removes a logged set", () => {
    const { s: s0, group } = seed();
    const bench = s0.blocks.find((b) => b.type === "strength")!;
    const lastBench = (bench.data as StrengthBlockData).sets.at(-1)!;
    let s = updateSet(s0, bench.id, lastBench.id, { reps: 8, weight: 60, completed: true });
    // The pigeon's last round is still removable, the bench's isn't.
    s = removeSupersetRound(s, group);
    expect((s.blocks.find((b) => b.id === bench.id)!.data as StrengthBlockData).sets.at(-1)!.id).toBe(lastBench.id);
    expect((s.blocks.find((b) => b.type === "mobility")!.data as MobilityBlockData).sets).toHaveLength(2);

    // A logged side of a pair keeps the whole pair.
    const { s: t0 } = seed();
    const pigeon = t0.blocks.find((b) => b.type === "mobility")!;
    const lastSide = (pigeon.data as MobilityBlockData).sets.at(-1)!;
    const t = updateMobilitySet(t0, pigeon.id, lastSide.id, { completed: true, durationSec: 30 });
    const after = removeSupersetRound(t, group);
    expect((after.blocks.find((b) => b.id === pigeon.id)!.data as MobilityBlockData).sets).toHaveLength(4);
  });
});

describe("groupProgress", () => {
  it("counts sets logged (a pair once) and finds the round being worked on", () => {
    const { s: s0, group } = seed();
    expect(groupProgress(supersetMembers(s0, group))).toEqual({ done: 0, total: 3, currentRound: 1, roundCount: 2 });

    const bench = s0.blocks.find((b) => b.type === "strength")!;
    const pigeon = s0.blocks.find((b) => b.type === "mobility")!;
    const [b1] = (bench.data as StrengthBlockData).sets;
    const [l1, r1] = (pigeon.data as MobilityBlockData).sets;
    let s = updateSet(s0, bench.id, b1!.id, { reps: 8, weight: 60, completed: true });
    s = updateMobilitySet(s, pigeon.id, l1!.id, { completed: true });
    // One side of the pair isn't the whole round.
    expect(groupProgress(supersetMembers(s, group))).toMatchObject({ done: 1, currentRound: 1 });
    s = updateMobilitySet(s, pigeon.id, r1!.id, { completed: true, restStartedAtMs: 5 });
    expect(groupProgress(supersetMembers(s, group))).toMatchObject({ done: 2, currentRound: 2 });
    expect(groupRounds(supersetMembers(s, group))).toEqual([
      { total: 2, done: 2, resting: true },
      { total: 1, done: 0, resting: false },
    ]);
  });
});
