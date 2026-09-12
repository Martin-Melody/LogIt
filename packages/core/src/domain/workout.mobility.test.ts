import { describe, it, expect } from "vitest";
import {
  createSession,
  addMobilityBlock,
  addMobilitySet,
  updateMobilitySet,
  removeMobilitySet,
  setMobilityPerSide,
  setMobilityMetric,
  setMobilityLeadSide,
  mobilitySetGroups,
  moveMobilitySetGroup,
  getSessionVolumeKg,
  getSessionSetCount,
  getExercises,
  type MobilityBlockData,
  type SessionBlock,
} from "./workout";

function mobilityData(s: ReturnType<typeof createSession>): MobilityBlockData {
  return (s.blocks[0] as SessionBlock<MobilityBlockData>).data;
}

describe("mobility block helpers", () => {
  it("adds a per-side block with a starting L/R pair", () => {
    const s = addMobilityBlock(createSession(), { drillName: "Couch stretch", perSide: true, metric: "hold" });
    const d = mobilityData(s);
    expect(d.metric).toBe("hold");
    expect(d.perSide).toBe(true);
    expect(d.sets.map((x) => x.side)).toEqual(["left", "right"]);
  });

  it("adds a single set when not per-side, and an L/R pair when per-side", () => {
    let s = addMobilityBlock(createSession(), { drillName: "Dead hang", perSide: false });
    const id = s.blocks[0]!.id;
    s = addMobilitySet(s, id);
    expect(mobilityData(s).sets).toHaveLength(2);

    let p = addMobilityBlock(createSession(), { drillName: "90/90", perSide: true, metric: "reps" });
    const pid = p.blocks[0]!.id;
    p = addMobilitySet(p, pid);
    expect(mobilityData(p).sets).toHaveLength(4);
    expect(mobilitySetGroups(mobilityData(p))).toHaveLength(2);
  });

  it("removes the whole pair for a per-side set", () => {
    let s = addMobilityBlock(createSession(), { drillName: "Pigeon", perSide: true });
    const id = s.blocks[0]!.id;
    s = addMobilitySet(s, id); // now 2 pairs
    const firstRight = mobilityData(s).sets.find((x) => x.side === "right")!;
    s = removeMobilitySet(s, id, firstRight.id);
    expect(mobilityData(s).sets).toHaveLength(2);
    expect(mobilityData(s).sets.map((x) => x.orderIndex)).toEqual([0, 1]);
  });

  it("regenerates rows when toggling per-side, keeping the left side's data", () => {
    let s = addMobilityBlock(createSession(), { drillName: "Frog", perSide: false });
    const id = s.blocks[0]!.id;
    s = updateMobilitySet(s, id, mobilityData(s).sets[0]!.id, { durationSec: 42 });
    s = setMobilityPerSide(s, id, true);
    const d = mobilityData(s);
    expect(d.perSide).toBe(true);
    const left = d.sets.find((x) => x.side === "left")!;
    const right = d.sets.find((x) => x.side === "right")!;
    expect(left.durationSec).toBe(42);
    expect(right.durationSec).toBeUndefined();

    // back to single — left's data survives
    s = setMobilityPerSide(s, id, false);
    expect(mobilityData(s).perSide).toBe(false);
    expect(mobilityData(s).sets).toHaveLength(1);
    expect(mobilityData(s).sets[0]!.durationSec).toBe(42);
    expect(mobilityData(s).sets[0]!.side).toBeUndefined();
  });

  it("restores the right side's data after a per-side → both → per-side round trip", () => {
    let s = addMobilityBlock(createSession(), { drillName: "Pigeon", perSide: true, metric: "hold" });
    const id = s.blocks[0]!.id;
    const [l0, r0] = mobilityData(s).sets;
    s = updateMobilitySet(s, id, l0!.id, { durationSec: 50, completed: true });
    s = updateMobilitySet(s, id, r0!.id, { durationSec: 35, depth: 4 });

    // Collapse to "both sides together" — right side is parked, not lost.
    s = setMobilityPerSide(s, id, false);
    expect(mobilityData(s).perSide).toBe(false);
    expect(mobilityData(s).sets).toHaveLength(1);
    expect(mobilityData(s).sets[0]!.durationSec).toBe(50);
    expect(mobilityData(s).stashedSides).toHaveLength(1);

    // Expand again — the right side comes back with its data.
    s = setMobilityPerSide(s, id, true);
    const d = mobilityData(s);
    expect(d.stashedSides).toBeUndefined();
    const left = d.sets.find((x) => x.side === "left")!;
    const right = d.sets.find((x) => x.side === "right")!;
    expect(left.durationSec).toBe(50);
    expect(right.durationSec).toBe(35);
    expect(right.depth).toBe(4);
    expect(right.id).not.toBe(r0!.id); // fresh id, no collision with the left entry
  });

  it("does not stash an empty right side", () => {
    let s = addMobilityBlock(createSession(), { drillName: "Frog", perSide: true });
    const id = s.blocks[0]!.id;
    s = updateMobilitySet(s, id, mobilityData(s).sets[0]!.id, { durationSec: 42 });
    s = setMobilityPerSide(s, id, false);
    expect(mobilityData(s).stashedSides).toBeUndefined();
  });

  it("seeds leadSide onto the block and orders groups by it", () => {
    const s = addMobilityBlock(createSession(), {
      drillName: "Couch stretch",
      perSide: true,
      leadSide: "right",
    });
    expect(mobilityData(s).leadSide).toBe("right");
    const [group] = mobilitySetGroups(mobilityData(s));
    expect(group!.kind === "pair" && group!.lead).toBe("right");
  });

  it("drags a set group to a new position, keeping L/R pairs intact", () => {
    let s = addMobilityBlock(createSession(), { drillName: "90/90", perSide: true, metric: "reps" });
    const id = s.blocks[0]!.id;
    s = addMobilitySet(s, id); // 2 pairs
    const g1 = mobilitySetGroups(mobilityData(s))[0]!;
    s = updateMobilitySet(s, id, (g1 as any).left.id, { reps: 11 });

    s = moveMobilitySetGroup(s, id, 0, 1);
    const groups = mobilitySetGroups(mobilityData(s));
    expect(groups).toHaveLength(2);
    expect(groups[1]!.kind).toBe("pair");
    expect((groups[1] as any).left.reps).toBe(11);
    expect(mobilityData(s).sets.map((x) => x.side)).toEqual(["left", "right", "left", "right"]);
  });

  it("ignores an out-of-range or no-op drag", () => {
    let s = addMobilityBlock(createSession(), { drillName: "90/90", perSide: false });
    const id = s.blocks[0]!.id;
    s = addMobilitySet(s, id); // 2 singles
    const before = mobilityData(s).sets;
    expect(mobilityData(moveMobilitySetGroup(s, id, 0, 0)).sets).toBe(before); // no-op → same data
    expect(mobilityData(moveMobilitySetGroup(s, id, 0, 5)).sets).toEqual(before);
  });

  it("sets and clears the block's lead side", () => {
    let s = addMobilityBlock(createSession(), { drillName: "Couch stretch", perSide: true });
    const id = s.blocks[0]!.id;
    s = setMobilityLeadSide(s, id, "right");
    expect(mobilityData(s).leadSide).toBe("right");
    s = setMobilityLeadSide(s, id, undefined);
    expect(mobilityData(s).leadSide).toBeUndefined();
  });

  it("switches the metric without dropping sets", () => {
    let s = addMobilityBlock(createSession(), { drillName: "Cossack", perSide: false, metric: "hold" });
    const id = s.blocks[0]!.id;
    s = setMobilityMetric(s, id, "reps");
    expect(mobilityData(s).metric).toBe("reps");
    expect(mobilityData(s).sets).toHaveLength(1);
  });

  it("is invisible to strength volume, set count and getExercises", () => {
    let s = addMobilityBlock(createSession(), { drillName: "Hip raise", perSide: true, metric: "reps" });
    const id = s.blocks[0]!.id;
    for (const set of mobilityData(s).sets) {
      s = updateMobilitySet(s, id, set.id, { reps: 12, loadKg: 5, completed: true });
    }
    expect(getSessionVolumeKg(s)).toBe(0);
    expect(getSessionSetCount(s)).toBe(0);
    expect(getExercises(s)).toHaveLength(0);
  });
});
