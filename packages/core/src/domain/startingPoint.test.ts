import { describe, expect, it } from "vitest";
import { startingPoint } from "./startingPoint";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 27, 12);
// Mondays and Thursdays at 6:30 for 8 weeks: squat and bench, plus face pulls.
const sessions = Array.from({ length: 16 }, (_, i) => {
  const t = now - (i * 3.5 + 1) * DAY;
  const start = new Date(t); start.setHours(6, 30, 0, 0);
  const set = (w: number, r: number) => ({ id: `s${i}${w}`, setType: "normal", reps: r, weight: w, orderIndex: 0, completed: true });
  return {
    id: `w${i}`, startedAtMs: start.getTime(), endedAtMs: start.getTime() + 70 * 60_000,
    blocks: [
      { id: "a", type: "strength", orderIndex: 0, data: { exerciseName: "Back squat", sets: [set(150, 5), set(150, 5)] } },
      { id: "b", type: "strength", orderIndex: 1, data: { exerciseName: "Bench press", sets: [set(110, 6)] } },
      { id: "c", type: "strength", orderIndex: 2, data: { exerciseName: "Face pull", sets: [set(20, 15)] } },
    ],
  };
});

describe("starting point (6.11)", () => {
  it("lifts with where they come from, and how they train", () => {
    const sp = startingPoint(sessions as never, now, { muscleOf: (n) => (/squat/i.test(n) ? ["quads"] : /bench/i.test(n) ? ["chest"] : ["rear delts"]), also: ["Overhead press"] });
    expect(sp.workouts).toBe(16);
    const squat = sp.lifts.find((l) => l.name === "Back squat")!;
    expect([squat.best, squat.from, squat.how]).toEqual([{ weight: 150, reps: 5 }, { kind: "logged", times: 16 }, "high"]);
    const ohp = sp.lifts.find((l) => l.name === "Overhead press")!;
    expect(ohp.from.kind).toBe("related");
    expect(ohp.e1rm).toBeLessThan(110);
    expect(sp.habits?.perWeek).toBe(2);
    expect(sp.habits?.startHour).toBeCloseTo(6.5);
    expect(sp.habits?.minutes).toBe(70);
    expect(sp.weeklySets[0]).toEqual({ muscle: "quads", sets: 4 });
  });
});
