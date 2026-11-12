import {
  createSession, addExercise, addSet, updateSet, removeSet, removeExercise,
  getSessionDurationMs, finishSession, getTopSetHighlight, getExercises, getSessionVolumeKg, getSessionSetCount,
  SET_TYPE_META, setTypeMeta, isContinuationSet, swapExercise,
  groupIntoSuperset, ungroupSuperset, addSupersetRound, supersetMembers,
  setSessionNote, foldSupersets, addWarmupSets,
  addMobilityBlock, addCardioBlock, blockGroup, blockDisplayName, groupLabel, groupCandidates,
  addMobilitySet, updateMobilitySet, supersetRoundCount, mobilitySetGroups,
  setGroupKind, removeGroup, normalizeSupersets,
} from "@logit/core/domain/workout";
import type { MobilityBlockData, StrengthBlockData } from "@logit/core/domain/workout";
import { describe, expect, it } from "vitest";

function seedSession() {
  let s = createSession(1_000);
  s = addExercise(s, { exerciseName: " Bench Press " });
  s = addExercise(s, { exerciseName: "Rows" });
  return s;
}

describe("workout domain", () => {
  it("addExercise trims name and assigns orderIndex", () => {
    const s0 = createSession(1_000);
    const s1 = addExercise(s0, { exerciseName: " Bench Press " });
    const exs1 = getExercises(s1);
    const exs0 = getExercises(s0);

    expect(exs1).toHaveLength(1);
    expect(exs1[0].exerciseName).toBe("Bench Press");
    expect(exs1[0].orderIndex).toBe(0);
    expect(exs0).toHaveLength(0);
  });

  it("addSet applies defaults and assigns orderIndex", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const exId = getExercises(s)[0].id;

    s = addSet(s, exId);
    s = addSet(s, exId, { reps: 5, weight: 100, setType: "normal" });

    const sets = getExercises(s)[0].sets;
    expect(sets).toHaveLength(2);

    expect(sets[0].setType).toBe("normal");
    expect(sets[0].reps).toBe(0);
    expect(sets[0].weight).toBe(0);
    expect(sets[0].orderIndex).toBe(0);

    expect(sets[1].reps).toBe(5);
    expect(sets[1].weight).toBe(100);
    expect(sets[1].orderIndex).toBe(1);
  });

  it("updateSet patches only the target set", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const exId = getExercises(s)[0].id;

    s = addSet(s, exId, { reps: 5, weight: 80 });
    s = addSet(s, exId, { reps: 8, weight: 60 });

    const [a, b] = getExercises(s)[0].sets;
    const s2 = updateSet(s, exId, a.id, { weight: 85 });

    expect(getExercises(s2)[0].sets[0].weight).toBe(85);
    expect(getExercises(s2)[0].sets[1].weight).toBe(b.weight);
  });

  it("removeSet reindexes orderIndex", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const exId = getExercises(s)[0].id;

    s = addSet(s, exId);
    s = addSet(s, exId);
    s = addSet(s, exId);

    const setIds = getExercises(s)[0].sets.map((x) => x.id);
    const s2 = removeSet(s, exId, setIds[1]);
    const exSets = getExercises(s2)[0].sets;

    expect(exSets).toHaveLength(2);
    expect(exSets[0].orderIndex).toBe(0);
    expect(exSets[1].orderIndex).toBe(1);
  });

  it("removeExercise reindexes orderIndex", () => {
    const s = seedSession();
    const ex0 = getExercises(s)[0].id;

    const s2 = removeExercise(s, ex0);
    const exs2 = getExercises(s2);
    expect(exs2).toHaveLength(1);
    expect(exs2[0].orderIndex).toBe(0);
  });

  it("finishSession + getSessionDurationMs", () => {
    const s = createSession(1_000);

    expect(getSessionDurationMs(s)).toBeNull();

    const s2 = finishSession(s, 1_800);
    expect(getSessionDurationMs(s2)).toBe(800);

    const s3 = finishSession(s, 900);
    expect(getSessionDurationMs(s3)).toBe(0);
  });

  it("getTopSetHighlight picks highest weight; tie-breaks by reps", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    s = addExercise(s, { exerciseName: "Rows" });

    const [benchId, rowsId] = getExercises(s).map((e) => e.id);

    s = addSet(s, benchId, { weight: 100, reps: 5 });
    s = addSet(s, rowsId, { weight: 100, reps: 8 });
    s = addSet(s, benchId, { weight: 105, reps: 3 });

    const top = getTopSetHighlight(s);
    expect(top).toEqual({ exerciseName: "Bench", weight: 105, reps: 3 });
  });

  it("getTopSetHighlight returns null if there are no sets", () => {
    const s = createSession(1_000);
    expect(getTopSetHighlight(s)).toBeNull();
  });

  it("addWarmupSets prepends warm-ups and reindexes", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Squat" });
    const id = getExercises(s)[0].id;
    s = addSet(s, id, { reps: 5, weight: 100 });
    s = addWarmupSets(s, id, [{ weight: 20, reps: 10 }, { weight: 60, reps: 3 }]);
    const sets = getExercises(s)[0].sets;
    expect(sets.map((x) => [x.setType, x.weight, x.orderIndex])).toEqual([
      ["warmup", 20, 0],
      ["warmup", 60, 1],
      ["normal", 100, 2],
    ]);
  });

  it("addWarmupSets is a no-op for an empty ramp", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Squat" });
    const id = getExercises(s)[0].id;
    const before = JSON.stringify(s);
    s = addWarmupSets(s, id, []);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("getSessionVolumeKg / getSessionSetCount total the strength work", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const id = getExercises(s)[0].id;
    s = addSet(s, id, { weight: 100, reps: 5 }); // 500
    s = addSet(s, id, { weight: 60, reps: 10, setType: "warmup" }); // 600, not a working set
    expect(getSessionVolumeKg(s)).toBe(1100);
    expect(getSessionSetCount(s)).toBe(1);
  });

  it("swapExercise changes the exercise but keeps the sets", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Flat Bench", exerciseId: "ex-flat" });
    const blockId = getExercises(s)[0].id;
    s = addSet(s, blockId, { reps: 8, weight: 60 });
    s = addSet(s, blockId, { reps: 8, weight: 60 });

    s = swapExercise(s, blockId, { exerciseName: " Incline Bench ", exerciseId: "ex-incline" });

    const ex = getExercises(s)[0];
    expect(ex.id).toBe(blockId); // same block
    expect(ex.exerciseName).toBe("Incline Bench");
    expect(ex.exerciseId).toBe("ex-incline");
    expect(ex.sets.map((x) => [x.reps, x.weight])).toEqual([[8, 60], [8, 60]]);
  });

  it("setSessionNote trims and clears", () => {
    let s = createSession(1_000);
    s = setSessionNote(s, "  felt strong  ");
    expect(s.note).toBe("felt strong");
    s = setSessionNote(s, "   ");
    expect(s.note).toBeNull();
  });

  it("swapExercise is a no-op for an unknown block", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const before = JSON.stringify(s);
    s = swapExercise(s, "nope", { exerciseName: "Squat" });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("supersets", () => {
  function seedThree() {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "A" });
    s = addExercise(s, { exerciseName: "B" });
    s = addExercise(s, { exerciseName: "C" });
    return { s, ids: getExercises(s).map((e) => e.id) };
  }

  it("groups two blocks under a shared id and makes them contiguous", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[2]]); // group A and C (non-adjacent)

    const members = supersetMembers(s, superId(s, ids[0]));
    expect(members.map((m) => (m.data as StrengthBlockData).exerciseName)).toEqual(["A", "C"]);
    // A, C now sit together; B is pushed out.
    const order = getExercises(s).map((e) => e.exerciseName);
    expect(order).toEqual(["A", "C", "B"]);
  });

  it("needs at least two blocks", () => {
    let { s, ids } = seedThree();
    const before = JSON.stringify(s);
    s = groupIntoSuperset(s, [ids[0]]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("addSupersetRound appends one set to every strength member", () => {
    let { s, ids } = seedThree();
    s = addSet(s, ids[0], { reps: 8, weight: 50 });
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    const supersetId = superId(s, ids[0]);

    s = addSupersetRound(s, supersetId);

    const [a, b] = getExercises(s);
    expect(a.sets).toHaveLength(2);
    expect(a.sets[1].weight).toBe(50); // carried from the previous set
    expect(b.sets).toHaveLength(1);
  });

  it("addSupersetRound adds a set to mobility members, an L/R pair when per side", () => {
    let s = createSession(1_000);
    s = addMobilityBlock(s, { drillName: "Hamstring stretch", metric: "hold" });
    s = addMobilityBlock(s, { drillName: "Pigeon stretch", metric: "hold", perSide: true });
    s = addCardioBlock(s, "Incline walk");
    const [ham, pigeon, walk] = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const mob = (id: string) => s.blocks.find((b) => b.id === id)!.data as MobilityBlockData;
    // Targets and a load on the first round carry into the next one.
    s = updateMobilitySet(s, ham!.id, mob(ham!.id).sets[0]!.id, { targetSec: 30, loadKg: 5, durationSec: 34, completed: true });
    const [l, r] = mob(pigeon!.id).sets;
    s = updateMobilitySet(s, pigeon!.id, l!.id, { targetSec: 40 });
    s = updateMobilitySet(s, pigeon!.id, r!.id, { targetSec: 45 });
    s = groupIntoSuperset(s, [ham!.id, pigeon!.id, walk!.id]);
    const group = blockGroup(s.blocks[0]!)!.id;
    expect(supersetRoundCount(supersetMembers(s, group))).toBe(1);

    s = addSupersetRound(s, group);

    expect(supersetRoundCount(supersetMembers(s, group))).toBe(2);
    const hamSets = mob(ham!.id).sets;
    expect(hamSets).toHaveLength(2);
    expect(hamSets[1]).toMatchObject({ targetSec: 30, loadKg: 5 });
    expect(hamSets[1]!.durationSec).toBeUndefined();
    expect(hamSets[1]!.completed).toBeUndefined();
    const pairs = mobilitySetGroups(mob(pigeon!.id));
    expect(pairs).toHaveLength(2);
    const second = pairs[1]!;
    expect(second.kind === "pair" && [second.left?.targetSec, second.right?.targetSec]).toEqual([40, 45]);
    // Cardio has no rounds, so it's left alone.
    const intervals = (id: string) => (s.blocks.find((b) => b.id === id)!.data as { intervals: unknown[] }).intervals;
    expect(intervals(walk!.id)).toEqual((walk!.data as { intervals: unknown[] }).intervals);
  });

  it("supersetRoundCount takes the member with the most rounds", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Push-up" });
    s = addMobilityBlock(s, { drillName: "Pigeon stretch", perSide: true });
    const [push, pigeon] = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    s = addSet(s, push!.id, { reps: 10, weight: 0 });
    s = addMobilitySet(s, pigeon!.id);
    s = addMobilitySet(s, pigeon!.id);
    // 1 strength set vs 3 L/R pairs (6 sets).
    expect(supersetRoundCount(s.blocks)).toBe(3);
    expect(supersetRoundCount([])).toBe(0);
  });

  it("a circuit can be one exercise, or two; a superset still needs two", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0]], undefined, "circuit");
    const one = blockGroup(s.blocks.find((b) => b.id === ids[0])!)!;
    expect(one.kind).toBe("circuit");
    expect(groupLabel(1, undefined, one.kind)).toBe("Circuit");
    // It survives the clean-up that drops lone members.
    expect(supersetMembers(normalizeSupersets(s), one.id)).toHaveLength(1);
    expect(foldSupersets(getExercises(s))[0]).toMatchObject({ kind: "superset", groupKind: "circuit" });

    // Adding one more keeps it a circuit (no longer by count).
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    expect(groupLabel(2, undefined, blockGroup(s.blocks[0]!)!.kind)).toBe("Circuit");

    // Made a superset, then cut to one exercise: it's ungrouped.
    s = setGroupKind(s, one.id, "superset");
    expect(groupLabel(2, undefined, blockGroup(s.blocks[0]!)!.kind)).toBe("Superset");
    s = removeExercise(s, ids[1]);
    expect(supersetMembers(s, one.id)).toHaveLength(0);

    // A superset of one can't be made.
    const before = JSON.stringify(s);
    expect(JSON.stringify(groupIntoSuperset(s, [ids[0]], undefined, "superset"))).toBe(before);
  });

  it("removeGroup takes the group and its exercises out, and renumbers the rest", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[2]]);
    s = removeGroup(s, superId(s, ids[0]));
    expect(getExercises(s).map((e) => [e.exerciseName, e.orderIndex])).toEqual([["B", 0]]);
  });

  it("ungroupSuperset clears the tag", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    const supersetId = superId(s, ids[0]);
    s = ungroupSuperset(s, supersetId);
    expect(supersetMembers(s, supersetId)).toHaveLength(0);
  });

  it("removing a member down to one dissolves the superset", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    const supersetId = superId(s, ids[0]);
    s = removeExercise(s, ids[1]);
    expect(supersetMembers(s, supersetId)).toHaveLength(0);
  });

  function superId(s: ReturnType<typeof createSession>, blockId: string): string {
    const block = s.blocks.find((b) => b.id === blockId)!;
    return (block.data as StrengthBlockData).superset!.id;
  }

  it("merging into a named group keeps its name", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[1]], "Finisher");
    s = groupIntoSuperset(s, [ids[0], ids[2]]);
    expect(blockGroup(s.blocks.find((b) => b.id === ids[2])!)?.label).toBe("Finisher");
    expect(supersetMembers(s, superId(s, ids[0]))).toHaveLength(3);
  });

  it("groups any block type, mobility and cardio included", () => {
    let s = createSession(1_000);
    s = addMobilityBlock(s, { drillName: "Hamstring stretch", metric: "hold" });
    s = addCardioBlock(s, "Incline walk");
    s = addMobilityBlock(s, { drillName: "Pigeon stretch", metric: "hold", perSide: true });
    const [mob1, cardio, mob2] = [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    s = groupIntoSuperset(s, [mob1!.id, mob2!.id, cardio!.id]);
    const members = supersetMembers(s, blockGroup(s.blocks[0]!)!.id);
    // Workout order is kept.
    expect(members.map(blockDisplayName)).toEqual(["Hamstring stretch", "Incline walk", "Pigeon stretch"]);
  });

  it("groupLabel: two is a superset, three or more a circuit, a name wins", () => {
    expect(groupLabel(2)).toBe("Superset");
    expect(groupLabel(3)).toBe("Circuit");
    expect(groupLabel(5, "  Mobility flow ")).toBe("Mobility flow");
    expect(groupLabel(2, "  ")).toBe("Superset");
  });

  it("groupCandidates puts the same kind first and leaves out the block's own group", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    s = addMobilityBlock(s, { drillName: "Hamstring stretch" });
    s = addCardioBlock(s, "Incline walk");
    s = addMobilityBlock(s, { drillName: "Butterfly stretch" });
    s = addMobilityBlock(s, { drillName: "Pancake stretch" });
    const byName = (n: string) => s.blocks.find((b) => blockDisplayName(b) === n)!.id;
    s = groupIntoSuperset(s, [byName("Hamstring stretch"), byName("Pancake stretch")]);

    const { same, other } = groupCandidates(s, byName("Hamstring stretch"));
    expect(same.map(blockDisplayName)).toEqual(["Butterfly stretch"]);
    expect(other.map(blockDisplayName)).toEqual(["Bench", "Incline walk"]);

    // From a block outside the group, the group's members are offered (picking merges).
    const fromBench = groupCandidates(s, byName("Bench"));
    expect(fromBench.same).toHaveLength(0);
    expect(fromBench.other.map(blockDisplayName)).toEqual([
      "Hamstring stretch", "Pancake stretch", "Incline walk", "Butterfly stretch",
    ]);
    expect(groupCandidates(s, "missing")).toEqual({ same: [], other: [] });
  });

  it("getExercises carries the superset tag", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    const [a, , c] = getExercises(s);
    expect(a.superset?.id).toBe(superId(s, ids[0]));
    expect(c.superset).toBeUndefined();
  });

  it("foldSupersets brackets consecutive members and leaves singles alone", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    const groups = foldSupersets(getExercises(s));
    expect(groups.map((g) => g.kind)).toEqual(["superset", "single"]);
    const first = groups[0];
    if (first.kind !== "superset") throw new Error("expected superset");
    expect(first.exercises.map((e) => e.exerciseName)).toEqual(["A", "B"]);
  });
});

describe("set types", () => {
  it("every meta entry has a label and hint", () => {
    for (const m of SET_TYPE_META) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.hint.length).toBeGreaterThan(0);
    }
  });

  it("setTypeMeta falls back to normal for an unknown type", () => {
    expect(setTypeMeta("does-not-exist").type).toBe("normal");
  });

  it("drop / rest-pause / myo-reps are continuation sets, others are not", () => {
    expect(isContinuationSet("dropset")).toBe(true);
    expect(isContinuationSet("rest-pause")).toBe(true);
    expect(isContinuationSet("myo-reps")).toBe(true);
    expect(isContinuationSet("normal")).toBe(false);
    expect(isContinuationSet("warmup")).toBe(false);
    expect(isContinuationSet("amrap")).toBe(false);
  });

  it("normal has no badge glyph; the rest do", () => {
    expect(setTypeMeta("normal").short).toBe("");
    expect(setTypeMeta("warmup").short).toBe("W");
    expect(setTypeMeta("rest-pause").short).toBe("RP");
  });

  it("updateSet can record and clear an RPE", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const exId = getExercises(s)[0].id;
    s = addSet(s, exId, { weight: 100, reps: 5 });
    const setId = getExercises(s)[0].sets[0].id;

    s = updateSet(s, exId, setId, { rpe: 8.5 });
    expect(getExercises(s)[0].sets[0].rpe).toBe(8.5);

    s = updateSet(s, exId, setId, { rpe: null });
    expect(getExercises(s)[0].sets[0].rpe).toBeNull();
  });
});
