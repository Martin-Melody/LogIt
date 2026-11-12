import { describe, expect, it } from "vitest";
import type { ProgramDay } from "./CoachProgram";
import { programDaySession } from "./programDaySession";
import { blockGroup, supersetMembers } from "./workout";

describe("coach program days", () => {
  it("blocks sharing a superset group start as one group", async () => {
    const day: ProgramDay = {
      id: "d",
      orderIndex: 0,
      blocks: [
        { type: "strength", id: "a", orderIndex: 0, exerciseName: "Bench", supersetGroup: "A", sets: [{ id: "s1", orderIndex: 0, setType: "normal", reps: 8 }] },
        { type: "strength", id: "b", orderIndex: 1, exerciseName: "Squat", sets: [] },
        { type: "strength", id: "c", orderIndex: 2, exerciseName: "Row", supersetGroup: "A", sets: [{ id: "s2", orderIndex: 0, setType: "normal", reps: 10 }] },
        { type: "cardio", id: "d", orderIndex: 3, activityName: "Bike", supersetGroup: "lonely" },
      ],
    };
    const session = programDaySession(day);
    const bench = session.blocks.find((b) => (b.data as { exerciseName?: string }).exerciseName === "Bench")!;
    const group = blockGroup(bench)!;
    expect(supersetMembers(session, group.id).map((b) => (b.data as { exerciseName: string }).exerciseName)).toEqual(["Bench", "Row"]);
    // A group of one from the coach is left alone.
    const bike = session.blocks.find((b) => b.type === "cardio")!;
    expect(blockGroup(bike)).toBeUndefined();
  });
});
