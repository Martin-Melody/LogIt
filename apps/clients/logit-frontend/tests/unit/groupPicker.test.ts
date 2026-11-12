import { describe, expect, it } from "vitest";
import {
  addCardioBlock,
  addExercise,
  addMobilityBlock,
  addSet,
  blockDisplayName,
  createSession,
  groupIntoSuperset,
  type WorkoutSession,
} from "@logit/core/domain/workout";
import {
  allowedDropIndices,
  canConfirmGroup,
  groupConfirmLabel,
  groupPickerModel,
  nearestAllowed,
  pickerGroupKind,
} from "$lib/features/session/grouping";

function mobilityDay(): WorkoutSession {
  let s = createSession(1_000);
  s = addMobilityBlock(s, { drillName: "Hamstring stretch", metric: "hold" });
  s = addMobilityBlock(s, { drillName: "Butterfly stretch", metric: "hold" });
  s = addMobilityBlock(s, { drillName: "Pigeon stretch", metric: "hold", perSide: true });
  s = addExercise(s, { exerciseName: "Pull-ups" });
  s = addCardioBlock(s, "Incline walk");
  return s;
}

const idOf = (s: WorkoutSession, name: string) => s.blocks.find((b) => blockDisplayName(b) === name)!.id;

describe("group picker model", () => {
  it("lists the anchor's kind first, then other exercises", () => {
    let s = mobilityDay();
    s = addSet(s, idOf(s, "Pull-ups"), { reps: 8, weight: 0 });
    const m = groupPickerModel(s, idOf(s, "Hamstring stretch"))!;

    expect(m.title).toBe("Superset / circuit with Hamstring stretch");
    expect(m.alreadyGrouped).toBe(false);
    expect(m.sections.map((sec) => sec.title)).toEqual(["Mobility", "Other exercises"]);
    expect(m.sections[0]!.items.map((i) => [i.name, i.detail])).toEqual([
      ["Butterfly stretch", "Mobility · 1 set"],
      ["Pigeon stretch", "Mobility · 1 set per side"],
    ]);
    expect(m.sections[1]!.items.map((i) => [i.name, i.detail])).toEqual([
      ["Pull-ups", "Strength · 1 set"],
      ["Incline walk", "Cardio"],
    ]);
  });

  it("drops empty sections", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    s = addExercise(s, { exerciseName: "Rows" });
    const m = groupPickerModel(s, idOf(s, "Bench"))!;
    expect(m.sections.map((sec) => sec.title)).toEqual(["Strength"]);
  });

  it("adds to an existing group and says so", () => {
    let s = mobilityDay();
    s = groupIntoSuperset(s, [idOf(s, "Hamstring stretch"), idOf(s, "Butterfly stretch"), idOf(s, "Pigeon stretch")]);
    const m = groupPickerModel(s, idOf(s, "Butterfly stretch"))!;
    expect(m.title).toBe("Add to circuit");
    expect(m.groupSize).toBe(3);
    expect(m.sections.flatMap((sec) => sec.items.map((i) => i.name))).toEqual(["Pull-ups", "Incline walk"]);

    // Seen from outside, members say which group they're in.
    const fromPullups = groupPickerModel(s, idOf(s, "Pull-ups"))!;
    expect(fromPullups.sections[0]!.items[0]!.detail).toBe("Mobility · 1 set · in a circuit");
  });

  it("uses a group's own name", () => {
    let s = mobilityDay();
    s = groupIntoSuperset(s, [idOf(s, "Hamstring stretch"), idOf(s, "Butterfly stretch")], "Hips");
    expect(groupPickerModel(s, idOf(s, "Hamstring stretch"))!.title).toBe("Add to Hips");
    expect(groupPickerModel(s, idOf(s, "Pull-ups"))!.sections[0]!.items[0]!.detail).toBe("Mobility · 1 set · in Hips");
  });

  it("returns null for a block that's gone", () => {
    expect(groupPickerModel(mobilityDay(), "missing")).toBeNull();
  });

  it("confirm label follows the group size, or the kind chosen", () => {
    const fresh = { groupSize: 1, alreadyGrouped: false };
    // Nothing ticked: a circuit of just this exercise.
    expect(groupConfirmLabel(fresh, 0)).toBe("Make circuit · 1 exercise");
    expect(groupConfirmLabel(fresh, 1)).toBe("Make superset");
    expect(groupConfirmLabel(fresh, 4)).toBe("Make circuit · 5 exercises");
    // Chosen: two can be a circuit, and a superset needs another exercise.
    expect(groupConfirmLabel(fresh, 1, "circuit")).toBe("Make circuit · 2 exercises");
    expect(groupConfirmLabel(fresh, 2, "superset")).toBe("Make superset · 3 exercises");
    expect(pickerGroupKind(0, "superset")).toBe("circuit");
    expect(canConfirmGroup(fresh, 0, "circuit")).toBe(true);
    expect(canConfirmGroup(fresh, 0, "superset")).toBe(false);
    // Adding to a group needs something ticked; the group's kind names it.
    expect(groupConfirmLabel({ groupSize: 2, alreadyGrouped: true }, 0)).toBe("Tick at least one");
    expect(canConfirmGroup({ alreadyGrouped: true }, 0, "circuit")).toBe(false);
    expect(groupConfirmLabel({ groupSize: 2, alreadyGrouped: true }, 1)).toBe("Add to circuit · 3 exercises");
    expect(groupConfirmLabel({ groupSize: 1, alreadyGrouped: true, kind: "circuit" }, 1)).toBe("Add to circuit");
    expect(groupConfirmLabel({ groupSize: 2, alreadyGrouped: true, label: "Hips" }, 1)).toBe("Add to Hips · 3 exercises");
  });
});

describe("drag drop rules", () => {
  // Hamstring, Butterfly, Pigeon grouped (0–2), then Pull-ups (3), Incline walk (4).
  function grouped() {
    let s = mobilityDay();
    s = groupIntoSuperset(s, [idOf(s, "Hamstring stretch"), idOf(s, "Butterfly stretch"), idOf(s, "Pigeon stretch")]);
    return [...s.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  it("a block from outside can't land inside a group", () => {
    // Incline walk (4) out; the rest is H B P Pull-ups. Inside the group = 1, 2.
    expect(allowedDropIndices(grouped(), 4)).toEqual([0, 3, 4]);
  });

  it("a member stays inside its own group", () => {
    // Hamstring (0) out; the rest is B P Pull-ups Walk. Inside or at the group's edges = 0, 1, 2.
    expect(allowedDropIndices(grouped(), 0)).toEqual([0, 1, 2]);
  });

  it("a whole group moves between other blocks", () => {
    // The group (3 blocks from 0) out; the rest is Pull-ups, Walk.
    expect(allowedDropIndices(grouped(), 0, 3)).toEqual([0, 1, 2]);
  });

  it("snaps to the nearest allowed spot", () => {
    expect(nearestAllowed([0, 3, 4], 2, 4)).toBe(3);
    expect(nearestAllowed([0, 3, 4], 1, 4)).toBe(0);
    expect(nearestAllowed([0, 1, 2], 9, 0)).toBe(2);
  });
});
