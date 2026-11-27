import { describe, expect, it } from "vitest";
import { foodAverages, weekLifts } from "./checkinWeek";
import { weekSquares, type Habit } from "./habit";
import type { WorkoutSession } from "./workout";

const DAY = 86_400_000;
const session = (atMs: number, lifts: [string, number, number][]): WorkoutSession => ({
  id: `s${atMs}`, startedAtMs: atMs, endedAtMs: atMs + 3_600_000,
  blocks: lifts.map(([name, weight, reps], i) => ({
    id: `b${i}`, type: "strength", orderIndex: i,
    data: { exerciseId: name.toLowerCase(), exerciseName: name, sets: [{ id: "x", setType: "normal", reps, weight, orderIndex: 0, completed: true }] },
  })),
}) as unknown as WorkoutSession;

describe("her week beside a check-in (canvas K4)", () => {
  const from = 100 * DAY;
  it("compares each lift's best set with the week before, ones done both weeks first", () => {
    const lifts = weekLifts([
      session(from - 3 * DAY, [["Squat", 77.5, 6], ["Bench", 45, 6]]),
      session(from + DAY, [["Squat", 80, 6], ["Bench", 45, 5], ["Deadlift", 140, 3]]),
    ], from, from + 7 * DAY);
    expect(lifts.map((l) => [l.name, l.weight, l.reps, l.was?.weight ?? null])).toEqual([
      ["Squat", 80, 6, 77.5], ["Bench", 45, 5, 45], ["Deadlift", 140, 3, null],
    ]);
  });
  it("averages food over the days with anything logged", () => {
    const day = (kcal: number, proteinG: number) => ({ dateIso: "x", items: kcal ? [{ computed: { kcal, proteinG, carbsG: 0, fatG: 0 } }] : [] }) as never;
    expect(foodAverages([day(2000, 120), day(2100, 116), day(0, 0)])).toEqual({ kcal: 2050, proteinG: 118, days: 2 });
    expect(foodAverages([day(0, 0)])).toBeNull();
  });
  it("shows a habit's week as squares against what it asks for", () => {
    const h = { id: "h", name: "Mobility", cadence: { kind: "weekly", timesPerWeek: 3 } } as Habit;
    const entries = [{ habitId: "h", dateIso: "2026-11-23", done: true }, { habitId: "h", dateIso: "2026-11-25", done: true }] as never;
    const w = weekSquares(h, entries, "2026-11-27"); // Friday
    expect(w.days[0]!.dateIso).toBe("2026-11-23");
    expect([w.done, w.target]).toEqual([2, 3]);
    expect(w.days.filter((d) => d.future).length).toBe(2);
  });
});
