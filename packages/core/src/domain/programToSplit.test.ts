import { describe, expect, it } from "vitest";
import { programWeekToSplit } from "./programToSplit";
import { BUILTIN_PROGRAMS } from "./builtinPrograms";
import { loadFromPercent } from "./oneRepMax";
import type { CoachProgram } from "./CoachProgram";

function program(days: CoachProgram["weeks"][number]["days"]): CoachProgram {
  return {
    id: "p1", name: "Block", lengthWeeks: 1, startMode: "manual", archived: false, createdAtMs: 0, updatedAtMs: 0,
    weeks: [{ id: "w1", weekNumber: 1, days }],
  };
}
const set = (o: number, extra: Record<string, unknown> = {}) => ({ id: `s${o}`, orderIndex: o, setType: "normal", ...extra }) as never;

describe("loadFromPercent", () => {
  it("rounds to 2.5 kg", () => {
    expect(loadFromPercent(130, 80)).toBe(105);
    expect(loadFromPercent(71.3, 70)).toBe(50);
    expect(loadFromPercent(0, 80)).toBeNull();
  });
});

describe("programWeekToSplit", () => {
  it("turns a built-in into a rotation with set counts and the top of each rep range", () => {
    const upperLower = BUILTIN_PROGRAMS.find((p) => p.id === "builtin-upper-lower-4x")!;
    const split = programWeekToSplit(upperLower);
    expect(split.name).toBe(upperLower.name);
    expect(split.schedule).toBeUndefined();
    expect(split.days.map((d) => d.name)).toEqual(["Upper A", "Lower A", "Upper B", "Lower B"]);
    const row = split.days[0]!.blocks[1]!;
    expect(row).toMatchObject({ type: "strength", exerciseName: "Barbell Row", targets: { sets: 4, reps: 10 } });
    expect(split.days[0]!.blocks.map((b) => b.orderIndex)).toEqual([0, 1, 2, 3]);
  });

  it("keeps weekdays, skips warm-ups, and works out % of 1RM loads", () => {
    const p = program([
      {
        id: "d1", orderIndex: 0, name: "Upper 1", weekday: 1,
        blocks: [{
          type: "strength", id: "b1", orderIndex: 0, exerciseName: "Bench Press",
          sets: [set(0, { setType: "warmup", reps: 5 }), set(1, { reps: 5, percent1RM: 80 }), set(2, { reps: 5, percent1RM: 80 })],
        }],
      },
      { id: "d2", orderIndex: 1, weekday: 4, blocks: [{ type: "cardio", id: "c1", orderIndex: 0, activityName: "Bike" }] },
    ]);
    const split = programWeekToSplit(p, p.weeks[0], new Map([["bench press", 130]]));
    expect(split.schedule).toBe("weekdays");
    expect(split.days.map((d) => d.weekday)).toEqual([1, 4]);
    expect(split.days[0]!.blocks[0]).toMatchObject({ targets: { sets: 2, reps: 5, weight: 105 } });
    expect(split.days[1]!.blocks[0]).toMatchObject({ type: "cardio", activityName: "Bike" });
  });

  it("makes superset groups with the most sets as rounds; AMRAP has no rep target", () => {
    const p = program([
      {
        id: "d1", orderIndex: 0,
        blocks: [
          { type: "strength", id: "a", orderIndex: 0, supersetGroup: "x", exerciseName: "Lateral Raise", sets: [set(0, { reps: 12 }), set(1, { reps: 12 })] },
          { type: "strength", id: "b", orderIndex: 1, supersetGroup: "x", exerciseName: "Face Pull", sets: [set(0, { reps: 15 }), set(1, { reps: 15 }), set(2, { reps: 15 })] },
          { type: "strength", id: "c", orderIndex: 2, supersetGroup: "lonely", exerciseName: "Chin-up", sets: [set(0, { setType: "amrap" })] },
        ],
      },
    ]);
    const day = programWeekToSplit(p).days[0]!;
    expect(day.groups).toHaveLength(1);
    expect(day.groups![0]!.rounds).toBe(3);
    expect(day.blocks[0]!.groupId).toBe(day.groups![0]!.id);
    expect(day.blocks[1]!.groupId).toBe(day.groups![0]!.id);
    expect(day.blocks[2]!.groupId).toBeUndefined();
    expect(day.blocks[2]).toMatchObject({ targets: { sets: 1 } });
  });
});
