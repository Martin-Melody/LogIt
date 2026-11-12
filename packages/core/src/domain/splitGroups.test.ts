import { describe, expect, it } from "vitest";
import {
  addDay,
  addPlannedCardio,
  addPlannedMobility,
  addPlannedStrength,
  createSplit,
  DEFAULT_PLANNED_ROUNDS,
  groupPlannedBlocks,
  normalizePlannedGroups,
  orderPlannedBlocks,
  plannedBlockName,
  plannedGroupMembers,
  plannedSetCount,
  removePlannedBlock,
  removePlannedGroup,
  setPlannedGroupKind,
  setPlannedGroupRounds,
  setPlannedGroupSettings,
  setPlannedTargets,
  sortPlannedBlocks,
  ungroupPlanned,
  type PlannedMobility,
  type PlannedStrength,
  type SplitDay,
} from "./WorkoutSplit";
import { padGroupRounds, splitDaySession } from "./splitDaySession";
import {
  blockGroup,
  mobilitySetGroups,
  supersetMembers,
  type MobilityBlockData,
  type StrengthBlockData,
} from "./workout";
import { estimateCircuitMs, groupTiming } from "./circuit";

/** Bench, Row, Bike, Dead hang (hold 30 s), Couch stretch (per side, hold). */
function seedDay(): SplitDay {
  let s = createSplit("Test");
  s = addDay(s, "Day");
  const dayId = s.days[0]!.id;
  s = addPlannedStrength(s, dayId, { exerciseName: "Bench", targets: { sets: 4, reps: 8, weight: 60 } });
  s = addPlannedStrength(s, dayId, { exerciseName: "Row", targets: { sets: 2, reps: 10 } });
  s = addPlannedCardio(s, dayId, "Bike");
  s = addPlannedMobility(s, dayId, { drillName: "Dead hang", metric: "hold", perSide: false, targets: { sets: 2, holdSec: 30 } });
  s = addPlannedMobility(s, dayId, { drillName: "Couch stretch", metric: "hold", perSide: true, targets: { holdSec: 45 } });
  return s.days[0]!;
}

function ids(day: SplitDay, ...names: string[]): string[] {
  return names.map((n) => day.blocks.find((b) => plannedBlockName(b) === n)!.id);
}

function names(day: SplitDay): string[] {
  return sortPlannedBlocks(day.blocks).map(plannedBlockName);
}

describe("split day groups", () => {
  it("groups blocks next to each other, at the first one's place, with the most sets as rounds", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Bench", "Dead hang"), { kind: "superset" });
    expect(names(day)).toEqual(["Bench", "Dead hang", "Row", "Bike", "Couch stretch"]);
    const group = day.groups![0]!;
    expect(group).toMatchObject({ kind: "superset", rounds: 4 });
    expect(plannedGroupMembers(day, group.id).map(plannedBlockName)).toEqual(["Bench", "Dead hang"]);
    expect(day.blocks.map((b) => b.orderIndex).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("gives a new group the default rounds when no member has a set count", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Bike", "Couch stretch"));
    expect(day.groups![0]!.rounds).toBe(DEFAULT_PLANNED_ROUNDS);
  });

  it("needs two blocks for a superset but makes a one-drill circuit", () => {
    const day = seedDay();
    expect(groupPlannedBlocks(day, ids(day, "Dead hang"), { kind: "superset" })).toBe(day);
    expect(groupPlannedBlocks(day, ids(day, "Dead hang"))).toBe(day);
    const circuit = groupPlannedBlocks(day, ids(day, "Dead hang"), { kind: "circuit" });
    expect(circuit.groups).toHaveLength(1);
    expect(circuit.groups![0]!.rounds).toBe(2);
  });

  it("adds to an existing group and merges two groups, keeping the first one's settings", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Bench", "Row"), { label: "Push pull" });
    const first = day.groups![0]!.id;
    day = setPlannedGroupRounds(day, first, 5);
    day = groupPlannedBlocks(day, ids(day, "Dead hang", "Couch stretch"), { kind: "circuit" });
    day = groupPlannedBlocks(day, ids(day, "Row", "Couch stretch"));
    expect(day.groups).toHaveLength(1);
    expect(day.groups![0]).toMatchObject({ id: first, label: "Push pull", rounds: 5 });
    expect(names(day)).toEqual(["Bench", "Row", "Dead hang", "Couch stretch", "Bike"]);
    expect(plannedGroupMembers(day, first)).toHaveLength(4);
  });

  it("ungrouping leaves the blocks in place with the group's rounds as their sets", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Row", "Bike", "Couch stretch"));
    const id = day.groups![0]!.id;
    day = setPlannedGroupRounds(day, id, 3);
    day = ungroupPlanned(day, id);
    expect(day.groups).toEqual([]);
    expect(day.blocks.every((b) => !b.groupId)).toBe(true);
    const row = day.blocks.find((b) => plannedBlockName(b) === "Row") as PlannedStrength;
    expect(row.targets).toEqual({ sets: 3, reps: 10 });
    const couch = day.blocks.find((b) => plannedBlockName(b) === "Couch stretch") as PlannedMobility;
    expect(couch.targets).toEqual({ holdSec: 45, sets: 3 });
  });

  it("removes a group with its blocks", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Row", "Bike"));
    day = removePlannedGroup(day, day.groups![0]!.id);
    expect(names(day)).toEqual(["Bench", "Dead hang", "Couch stretch"]);
    expect(day.blocks.map((b) => b.orderIndex)).toEqual([0, 1, 2]);
  });

  it("removing a block breaks up a superset left with one exercise, but not a circuit", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Bench", "Row"), { kind: "superset" });
    const benchOnly = removePlannedBlock(day, ids(day, "Row")[0]!);
    expect(benchOnly.groups).toBeUndefined();
    expect((benchOnly.blocks.find((b) => plannedBlockName(b) === "Bench") as PlannedStrength).targets?.sets).toBe(4);

    const circuit = setPlannedGroupKind(day, day.groups![0]!.id, "circuit");
    const left = removePlannedBlock(circuit, ids(circuit, "Row")[0]!);
    expect(left.groups).toHaveLength(1);
  });

  it("making a one-exercise circuit a superset ungroups it", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Dead hang"), { kind: "circuit" });
    day = setPlannedGroupKind(day, day.groups![0]!.id, "superset");
    expect(day.groups).toBeUndefined();
    expect(day.blocks.every((b) => !b.groupId)).toBe(true);
  });

  it("keeps rounds between 1 and 20 and changes settings like a workout's group", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Bench", "Row"));
    const id = day.groups![0]!.id;
    expect(setPlannedGroupRounds(day, id, 0).groups![0]!.rounds).toBe(1);
    expect(setPlannedGroupRounds(day, id, 99).groups![0]!.rounds).toBe(20);
    day = setPlannedGroupSettings(day, id, { label: " Pair ", roundRestMs: 90_000, memberRestMs: 10_000 });
    expect(day.groups![0]).toMatchObject({ label: "Pair", roundRestMs: 90_000, memberRestMs: 10_000 });
    day = setPlannedGroupSettings(day, id, { label: "", memberRestMs: null });
    expect(day.groups![0]!.label).toBeUndefined();
    expect(day.groups![0]!.memberRestMs).toBeUndefined();
    expect(day.groups![0]!.roundRestMs).toBe(90_000);
  });

  it("set count: the group's rounds in a group, else the block's own", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Row", "Dead hang"));
    const [bench, row, bike] = ids(day, "Bench", "Row", "Bike").map((id) => day.blocks.find((b) => b.id === id)!);
    expect(plannedSetCount(day, bench!)).toBe(4);
    expect(plannedSetCount(day, row!)).toBe(2);
    expect(plannedSetCount(day, bike!)).toBeUndefined();
  });

  it("orders blocks by id list and drops stray group ids", () => {
    let day = seedDay();
    day = orderPlannedBlocks(day, ids(day, "Bike", "Bench"));
    expect(names(day)).toEqual(["Bike", "Bench", "Row", "Dead hang", "Couch stretch"]);
    const stray = { ...day, blocks: day.blocks.map((b, i) => (i === 0 ? { ...b, groupId: "gone" } : b)) };
    expect(normalizePlannedGroups(stray).blocks.every((b) => !b.groupId)).toBe(true);
  });

  it("setPlannedTargets keeps a block's group", () => {
    let s = createSplit("T");
    s = addDay(s);
    const dayId = s.days[0]!.id;
    s = addPlannedStrength(s, dayId, { exerciseName: "A" });
    s = addPlannedStrength(s, dayId, { exerciseName: "B" });
    const day = groupPlannedBlocks(s.days[0]!, s.days[0]!.blocks.map((b) => b.id));
    s = { ...s, days: [day] };
    s = setPlannedTargets(s, dayId, day.blocks[0]!.id, { reps: 5 });
    expect(s.days[0]!.blocks[0]!.groupId).toBe(day.groups![0]!.id);
  });
});

describe("split day → workout", () => {
  it("adds drills with their sets and targets", () => {
    const { session } = splitDaySession(seedDay());
    const drills = session.blocks.filter((b) => b.type === "mobility");
    const hang = drills[0]!.data as MobilityBlockData;
    expect(hang.sets).toHaveLength(2);
    expect(hang.sets.every((s) => s.targetSec === 30 && !s.completed)).toBe(true);
    const couch = drills[1]!.data as MobilityBlockData;
    expect(couch.perSide).toBe(true);
    expect(mobilitySetGroups(couch)).toHaveLength(1);
    expect(couch.sets.every((s) => s.targetSec === 45)).toBe(true);
  });

  it("prefills reps on a reps drill", () => {
    let s = createSplit("T");
    s = addDay(s);
    s = addPlannedMobility(s, s.days[0]!.id, { drillName: "Cat cow", metric: "reps", perSide: false, targets: { sets: 3, reps: 12 } });
    const { session } = splitDaySession(s.days[0]!);
    const data = session.blocks[0]!.data as MobilityBlockData;
    expect(data.sets.map((x) => x.reps)).toEqual([12, 12, 12]);
  });

  it("recreates groups with their settings and rounds", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Row", "Dead hang", "Couch stretch"), { kind: "circuit", label: "Finisher" });
    const gid = day.groups![0]!.id;
    day = setPlannedGroupRounds(day, gid, 3);
    day = setPlannedGroupSettings(day, gid, { roundRestMs: 60_000, memberRestMs: 10_000, leadInMs: 5_000 });

    const { session, targetsByBlockId, roundsByBlockId, groupIdByPlannedId } = splitDaySession(day);
    const supersetId = groupIdByPlannedId[gid]!;
    const members = supersetMembers(session, supersetId);
    expect(members.map((b) => b.type)).toEqual(["strength", "mobility", "mobility"]);
    expect(blockGroup(members[0]!)).toMatchObject({ label: "Finisher", kind: "circuit", roundRestMs: 60_000, memberRestMs: 10_000, leadInMs: 5_000 });
    expect(targetsByBlockId[members[0]!.id]).toEqual({ sets: 3, reps: 10 });
    expect(roundsByBlockId[members[0]!.id]).toBe(3);
    expect(mobilitySetGroups(members[1]!.data as MobilityBlockData)).toHaveLength(3);
    expect(mobilitySetGroups(members[2]!.data as MobilityBlockData)).toHaveLength(3);
    // Bench isn't grouped: its own targets, no rounds to pad.
    const bench = session.blocks.find((b) => b.type === "strength" && (b.data as StrengthBlockData).exerciseName === "Bench")!;
    expect(targetsByBlockId[bench.id]).toEqual({ sets: 4, reps: 8, weight: 60 });
    expect(roundsByBlockId[bench.id]).toBeUndefined();

    expect(groupTiming(session, supersetId)).toEqual({ leadInMs: 5_000, memberRestMs: 10_000, roundRestMs: 60_000 });
    expect(estimateCircuitMs(session, supersetId).totalMs).toBeGreaterThan(0);
  });

  it("pads grouped exercises the plan left short", () => {
    let day = seedDay();
    day = groupPlannedBlocks(day, ids(day, "Bench", "Row"));
    const gid = day.groups![0]!.id;
    day = setPlannedGroupRounds(day, gid, 3);
    const { session, targetsByBlockId, roundsByBlockId } = splitDaySession(day);
    const padded = padGroupRounds(session, roundsByBlockId, targetsByBlockId);
    const strength = padded.blocks.filter((b) => b.type === "strength").map((b) => (b.data as StrengthBlockData).sets);
    // Both have a rep target: planned sets to tick.
    expect(strength[0]!.map((s) => s.target)).toEqual(Array(3).fill({ reps: 8, weight: 60 }));
    expect(strength[1]!.map((s) => s.target)).toEqual(Array(3).fill({ reps: 10, weight: 0 }));
    expect(strength.flat().every((s) => s.reps === 0 && !s.completed)).toBe(true);
  });

  it("padding repeats the last planned set and adds plain sets with no target", () => {
    let s = createSplit("T");
    s = addDay(s);
    const dayId = s.days[0]!.id;
    s = addPlannedStrength(s, dayId, { exerciseName: "A" });
    s = addPlannedStrength(s, dayId, { exerciseName: "B" });
    let day = groupPlannedBlocks(s.days[0]!, s.days[0]!.blocks.map((b) => b.id));
    day = setPlannedGroupRounds(day, day.groups![0]!.id, 2);
    const built = splitDaySession(day);
    const [a, b] = built.session.blocks;
    // As if the algorithm planned one set of A.
    let session = padGroupRounds(built.session, { [a!.id]: 1 }, { [a!.id]: { reps: 6, weight: 50 } });
    session = padGroupRounds(session, built.roundsByBlockId, built.targetsByBlockId);
    const setsA = (session.blocks.find((x) => x.id === a!.id)!.data as StrengthBlockData).sets;
    expect(setsA.map((x) => x.target)).toEqual([{ reps: 6, weight: 50 }, { reps: 6, weight: 50 }]);
    const setsB = (session.blocks.find((x) => x.id === b!.id)!.data as StrengthBlockData).sets;
    expect(setsB).toHaveLength(2);
    expect(setsB.every((x) => !x.target && x.reps === 0)).toBe(true);
  });
});
