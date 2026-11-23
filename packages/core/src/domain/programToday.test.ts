import { describe, expect, it } from "vitest";
import type { CoachProgram, ProgramDay } from "./CoachProgram";
import { programToday } from "./programToday";

const DAY = 86_400_000;
const START = new Date("2026-11-16T00:00:00").getTime(); // a Monday
const strength = { type: "strength", id: "b", orderIndex: 0, exerciseName: "Bench", sets: [] } as unknown as ProgramDay["blocks"][number];
const day = (id: string, orderIndex: number): ProgramDay => ({ id, orderIndex, name: id, blocks: [strength] });
const program: CoachProgram = {
  id: "p", name: "Block", lengthWeeks: 2, startMode: "manual", clientStartedAtMs: START,
  weeks: [
    { id: "w1", weekNumber: 1, days: [day("Push", 0), day("Pull", 1), day("Legs", 2)] },
    { id: "w2", weekNumber: 2, days: [day("Push2", 0), day("Pull2", 1)] },
  ],
  archived: false, createdAtMs: 0, updatedAtMs: 0,
};
const did = (dayId: string, atMs: number) => ({ startedAtMs: atMs, source: { kind: "program", parentId: "p", dayId } });

describe("a coach's program on Home (decision D2)", () => {
  it("offers the first day of this program week not done yet", () => {
    const t = programToday(program, [did("Push", START + 9 * 3_600_000)], START + 2 * DAY)!;
    expect(t).toMatchObject({ weekNumber: 1, totalWeeks: 2, doneThisWeek: 1, daysThisWeek: 3, doneToday: [] });
    expect(t.next?.day.id).toBe("Pull");
  });

  it("knows a day was done today, and moves on to the next", () => {
    const t = programToday(program, [did("Push", START + 9 * 3_600_000)], START + 20 * 3_600_000)!;
    expect(t.doneToday.map((d) => d.id)).toEqual(["Push"]);
    expect(t.next?.day.id).toBe("Pull");
  });

  it("with the week done, the next week's first day on its start date", () => {
    const sessions = ["Push", "Pull", "Legs"].map((id, i) => did(id, START + i * DAY));
    const t = programToday(program, sessions, START + 4 * DAY)!;
    expect(t.next).toEqual({ day: expect.objectContaining({ id: "Push2" }), atMs: START + 7 * DAY });
  });

  it("isn't there before Start or after the last week", () => {
    expect(programToday({ ...program, clientStartedAtMs: undefined }, [], START)).toBeNull();
    expect(programToday(program, [], START + 15 * DAY)).toBeNull();
  });
});
