import { describe, expect, it } from "vitest";
import {
  createSplit,
  addDay,
  addPlannedStrength,
  addPlannedCardio,
  updatePlannedBlock,
  setPlannedTargets,
  reorderPlannedBlocks,
  type PlannedStrength,
} from "./WorkoutSplit";

function seed() {
  let s = createSplit("PPL");
  s = addDay(s, "Push");
  const dayId = s.days[0]!.id;
  s = addPlannedStrength(s, dayId, { exerciseName: "Bench Press", exerciseId: "ex-bench" });
  s = addPlannedStrength(s, dayId, { exerciseName: "OHP" });
  s = addPlannedCardio(s, dayId, "Bike");
  return { s, dayId };
}

describe("WorkoutSplit planned blocks", () => {
  it("setPlannedTargets stores non-empty fields and drops zeros", () => {
    let { s, dayId } = seed();
    const blockId = s.days[0]!.blocks[0]!.id;

    s = setPlannedTargets(s, dayId, blockId, { sets: 3, reps: 8, weight: 60 });
    let block = s.days[0]!.blocks[0] as PlannedStrength;
    expect(block.targets).toEqual({ sets: 3, reps: 8, weight: 60 });

    // Zeros / blanks clear the field, and an all-empty target removes `targets`.
    s = setPlannedTargets(s, dayId, blockId, { sets: 0, reps: 0, weight: 0 });
    block = s.days[0]!.blocks[0] as PlannedStrength;
    expect(block.targets).toBeUndefined();
  });

  it("setPlannedTargets keeps a partial target", () => {
    let { s, dayId } = seed();
    const blockId = s.days[0]!.blocks[1]!.id;
    s = setPlannedTargets(s, dayId, blockId, { reps: 10 });
    expect((s.days[0]!.blocks[1] as PlannedStrength).targets).toEqual({ reps: 10 });
  });

  it("updatePlannedBlock patches identity without touching siblings", () => {
    let { s, dayId } = seed();
    const [b0, b1] = s.days[0]!.blocks;
    s = updatePlannedBlock(s, dayId, b1!.id, { exerciseName: "Overhead Press", exerciseId: "ex-ohp" });
    expect((s.days[0]!.blocks[1] as PlannedStrength).exerciseName).toBe("Overhead Press");
    expect((s.days[0]!.blocks[1] as PlannedStrength).exerciseId).toBe("ex-ohp");
    expect(s.days[0]!.blocks[0]).toEqual(b0);
  });

  it("updatePlannedBlock is a no-op for an unknown block / day", () => {
    let { s, dayId } = seed();
    const before = JSON.stringify(s);
    s = updatePlannedBlock(s, dayId, "nope", { exerciseName: "x" });
    s = updatePlannedBlock(s, "nope", s.days[0]!.blocks[0]!.id, { exerciseName: "x" });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("reorderPlannedBlocks reindexes", () => {
    let { s, dayId } = seed();
    s = reorderPlannedBlocks(s, dayId, 0, 2);
    expect(s.days[0]!.blocks.map((b) => (b.type === "strength" ? b.exerciseName : b.activityName)))
      .toEqual(["OHP", "Bike", "Bench Press"]);
    expect(s.days[0]!.blocks.map((b) => b.orderIndex)).toEqual([0, 1, 2]);
  });
});
