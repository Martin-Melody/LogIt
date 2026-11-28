import { describe, expect, it } from "vitest";
import { createCoachProgram, dayForWeek, numbersAt, numbersFor, ruleFor, setNumbersInWeeks, type ProgramSet, type ProgramStrength } from "./CoachProgram";
import { setLength } from "./programBuilder";
import { planForWeek } from "./programPlan";

const set = (i: number, reps: number | [number, number], restSec = 120): ProgramSet => (Array.isArray(reps) ? { id: `s${i}`, orderIndex: i, setType: "normal", repsMin: reps[0], repsMax: reps[1], restSec } : { id: `s${i}`, orderIndex: i, setType: "normal", reps, restSec });
const squat: ProgramStrength = { type: "strength", id: "sq", orderIndex: 0, exerciseName: "Back squat", sets: [0, 1, 2, 3].map((i) => set(i, [8, 12])) };
const strength = (x: ProgramStrength) => ({ ...x, sets: [0, 1, 2].map((i) => set(i, [3, 5], 180)), rule: { kind: "linear" as const, stepKg: 2.5 } });

describe("numbers by stretch (PX3)", () => {
  it("weeks 7–9 get their own sets, reps, rest and progression; the rest keep every week's", () => {
    const b = setNumbersInWeeks(squat, { from: 7, to: 9 }, strength);
    expect(numbersAt(b, 3).sets).toHaveLength(4);
    expect(numbersAt(b, 8).sets.map((s) => [s.repsMin, s.repsMax, s.restSec])).toEqual([[3, 5, 180], [3, 5, 180], [3, 5, 180]]);
    expect(numbersFor(b, { from: 7, to: 9 }).rule).toEqual({ kind: "linear", stepKg: 2.5 });
    expect(ruleFor({ rule: { kind: "adaptive" } }, b, 8)).toEqual({ kind: "linear", stepKg: 2.5 });
    expect(ruleFor({ rule: { kind: "adaptive" } }, b, 3)).toEqual({ kind: "adaptive" });
  });
  it("the same numbers as every week aren't kept; a new range trims an old one", () => {
    expect(setNumbersInWeeks(squat, { from: 7, to: 9 }, (x) => x).byWeeks).toBeUndefined();
    const b = setNumbersInWeeks(setNumbersInWeeks(squat, { from: 5, to: 9 }, strength), { from: 7, to: 7 }, (x) => ({ ...x, sets: x.sets.slice(0, 1) }));
    expect(b.byWeeks!.map((e) => [e.weeks.from, e.weeks.to, e.sets.length])).toEqual([[5, 6, 3], [7, 7, 1], [8, 9, 3]]);
  });
  it("the day as it is that week and its plan use them", () => {
    let p = setLength(createCoachProgram("P"), 10);
    const b = setNumbersInWeeks(squat, { from: 7, to: 9 }, strength);
    p = { ...p, rule: { kind: "fixed" }, weeks: p.weeks.map((w) => ({ ...w, days: [{ id: "d", orderIndex: 0, blocks: [b] }] })) };
    expect((dayForWeek(p.weeks[7]!.days[0]!, 8).blocks[0] as ProgramStrength).sets).toHaveLength(3);
    const cell = planForWeek(p, 8, { e1rm: () => 100 })("sq");
    expect(cell && "sets" in cell ? cell.sets : null).toBe(3);
  });
});
