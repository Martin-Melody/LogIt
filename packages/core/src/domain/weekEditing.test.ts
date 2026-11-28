import { describe, expect, it } from "vitest";
import { addToWeeks, swapInWeeks, takeOutOfWeeks, type CoachProgram, type ProgramBlock } from "./CoachProgram";

let n = 0;
const id = () => `n${++n}`;
const sets = [{ id: "s1", orderIndex: 0, setType: "normal" as const, reps: 5 }];
const prog = (blocks: ProgramBlock[]) => ({ id: "p", name: "P", weeks: Array.from({ length: 10 }, (_, i) => ({ id: i ? `w${i}` : "w", weekNumber: i + 1, days: i ? [] : [{ id: "d", orderIndex: 0, blocks }] })) }) as unknown as CoachProgram;
const view = (p: CoachProgram) => [...p.weeks[0]!.days[0]!.blocks].sort((a, b) => a.orderIndex - b.orderIndex)
  .map((b) => `${(b as { exerciseName: string }).exerciseName} ${b.weeks ? `${b.weeks.from}-${b.weeks.to}` : "all"}`);
const base = () => prog([
  { type: "strength", id: "sq", orderIndex: 0, exerciseName: "Squat", sets },
  { type: "strength", id: "bp", orderIndex: 1, exerciseName: "Bench", sets },
] as ProgramBlock[]);

describe("editing exercises by weeks (PX2)", () => {
  it("takes one out of the middle weeks, the start, or all of them", () => {
    expect(view(takeOutOfWeeks(base(), "w", "d", "bp", { from: 7, to: 9 }, id()))).toEqual(["Squat all", "Bench 1-6", "Bench 10-10"]);
    expect(view(takeOutOfWeeks(base(), "w", "d", "bp", { from: 1, to: 2 }, id()))).toEqual(["Squat all", "Bench 3-10"]);
    expect(view(takeOutOfWeeks(base(), "w", "d", "bp", { from: 1, to: 10 }, id()))).toEqual(["Squat all"]);
  });
  it("swaps for another in weeks 7–9 only", () => {
    expect(view(swapInWeeks(base(), "w", "d", "bp", { from: 7, to: 9 }, { exerciseName: "Close-grip bench" }, id)))
      .toEqual(["Squat all", "Bench 1-6", "Close-grip bench 7-9", "Bench 10-10"]);
  });
  it("brings one back: next to its weeks it grows, apart it's a copy", () => {
    const p = takeOutOfWeeks(base(), "w", "d", "bp", { from: 7, to: 10 }, id());
    expect(view(addToWeeks(p, "w", "d", "bp", { from: 7, to: 9 }, id()))).toEqual(["Squat all", "Bench 1-9"]);
    const split = takeOutOfWeeks(base(), "w", "d", "bp", { from: 4, to: 4 }, id());
    expect(view(addToWeeks(split, "w", "d", "bp", { from: 4, to: 4 }, id()))).toEqual(["Squat all", "Bench all"]);
    const q = takeOutOfWeeks(base(), "w", "d", "bp", { from: 5, to: 10 }, id());
    expect(view(addToWeeks(q, "w", "d", "bp", { from: 8, to: 9 }, id()))).toEqual(["Squat all", "Bench 1-4", "Bench 8-9"]);
  });
});
