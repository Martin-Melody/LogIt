import { describe, expect, it } from "vitest";
import { detectSplit, splitFromDetected, summariseHistory } from "./historyFromImport";
import type { WorkoutSession } from "../domain/workout";

const DAY = 86_400_000;
// Monday 2 November 2026, 07:00 local.
const MON = new Date(2026, 10, 2, 7, 0).getTime();

function session(name: string, atMs: number, lifts: [string, number, number[]][]): WorkoutSession {
  return {
    id: `${name}-${atMs}`, startedAtMs: atMs, endedAtMs: atMs, name,
    blocks: lifts.map(([ex, weight, reps], i) => ({
      id: `b${i}`, type: "strength", orderIndex: i,
      data: { exerciseName: ex, sets: [{ id: "w", setType: "warmup", weight: weight / 2, reps: 8, orderIndex: 0, completed: true },
        ...reps.map((r, j) => ({ id: `s${j}`, setType: "normal" as const, weight, reps: r, orderIndex: j + 1, completed: true }))] },
    })),
  };
}

// Five weeks of Upper (Mon) / Lower (Thu), getting stronger, plus an odd one-off.
const history: WorkoutSession[] = [];
for (let w = 0; w < 5; w++) {
  history.push(session("Upper", MON + w * 7 * DAY, [["Bench Press", 100 + w * 2.5, [5, 5, 4]], ["Barbell Row", 80, [8, 8]]]));
  history.push(session("Lower", MON + (w * 7 + 3) * DAY, [["Squat", 140 + w * 5, [5, 5, 5]], ["Leg Curl", 40, [12, 10]]]));
}
history.push(session("Hotel gym", MON + 9 * DAY, [["Dumbbell Press", 30, [12]]]));

describe("detectSplit", () => {
  const split = detectSplit(history)!;

  it("finds the named days that repeat, on their usual weekdays, Monday first", () => {
    expect(split.days.map((d) => [d.name, d.weekday])).toEqual([["Upper", 1], ["Lower", 4]]);
    expect(split.daysPerWeek).toBe(2);
  });

  it("takes each day's exercises, working sets and rep range from its latest session", () => {
    expect(split.days[0]!.exercises).toEqual([
      { name: "Bench Press", sets: 3, repRange: [4, 5] },
      { name: "Barbell Row", sets: 2, repRange: [8, 8] },
    ]);
  });

  it("makes a weekday split from it", () => {
    const s = splitFromDetected(split, "Upper / Lower");
    expect(s.schedule).toBe("weekdays");
    expect(s.days.map((d) => [d.name, d.weekday, d.blocks.length])).toEqual([["Upper", 1, 2], ["Lower", 4, 2]]);
  });

  it("finds nothing without named workouts that repeat", () => {
    expect(detectSplit([session("Once", MON, [["Squat", 100, [5]]])])).toBeNull();
    expect(detectSplit(history.map((s) => ({ ...s, name: null })))).toBeNull();
  });
});

describe("summariseHistory: the big three", () => {
  it("totals squat, bench and deadlift at each one's best of its last six weeks", () => {
    const withDeadlift = [...history, session("Pull", MON + 30 * DAY, [["Deadlift", 200, [3]]])];
    const big = summariseHistory(withDeadlift)!.bigThree!;
    expect(big).toEqual({ squatKg: 186.7, benchKg: 128.3, deadliftKg: 220, totalKg: 535 }); // 160×5, 110×5, 200×3
  });

  it("lists squat, bench and deadlift above the total, not the most-logged lifts", () => {
    const busy = [...history, session("Pull", MON + 30 * DAY, [["Deadlift", 200, [3]]]),
      ...[1, 2, 3, 4].map((i) => session("Arms", MON + i * DAY, [["Leg Curl", 40, [12, 12, 12, 12, 12]]]))];
    expect(summariseHistory(busy)!.lifts.map((l) => l.name).sort()).toEqual(["Bench Press", "Deadlift", "Squat"]);
  });

  it("has no total without all three", () => {
    expect(summariseHistory(history)!.bigThree).toBeNull();
  });
});

describe("summariseHistory", () => {
  const sum = summariseHistory(history)!;

  it("counts workouts, exercises and PRs (a new best estimated max after the first)", () => {
    expect(sum.workouts).toBe(11);
    expect(sum.exercises).toBe(5);
    expect(sum.prs).toBe(8); // bench and squat went up each of the last 4 weeks
  });

  it("follows the three most-trained lifts' estimated max by month", () => {
    expect(sum.lifts.map((l) => l.name)).toEqual(["Bench Press", "Squat", "Barbell Row"]);
    const squat = sum.lifts[1]!;
    // Each month's best: November ends on 155 × 5, December has 160 × 5.
    expect(squat.months.map((m) => m.kg)).toEqual([180.8, 186.7]);
    expect([squat.firstKg, squat.lastKg]).toEqual([180.8, 186.7]);
  });
});
