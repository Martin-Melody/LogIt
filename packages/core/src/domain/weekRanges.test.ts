import { describe, expect, it } from "vitest";
import { dayForWeek, replaceFromWeek, setBlockWeeks, weekRangeText, type CoachProgram } from "./CoachProgram";
import { planExercise } from "./programPlan";
import { programDaySession } from "./programDaySession";

const sets = [0, 1, 2].map((k) => ({ id: `s${k}`, orderIndex: k, setType: "normal" as const, reps: 5, weight: 100 }));
const day = { id: "d", orderIndex: 0, blocks: [
  { type: "strength" as const, id: "bench", orderIndex: 0, exerciseName: "Bench", sets },
  { type: "strength" as const, id: "row", orderIndex: 1, exerciseName: "Row", sets },
] };
const program = { id: "p", name: "P", rule: { kind: "linear", stepKg: 2.5 }, weeks: Array.from({ length: 6 }, (_, i) => ({ id: `w${i + 1}`, weekNumber: i + 1, days: [day] })) } as unknown as CoachProgram;

describe("exercises in some weeks (6.7)", () => {
  it("replaces an exercise from a week, in the same place", () => {
    const p = replaceFromWeek(program, "w1", "d", "bench", 5, { exerciseName: "Paused bench" }, "pblock_new1");
    const blocks = p.weeks[0]!.days[0]!.blocks;
    expect(blocks.map((b) => [b.type === "strength" ? b.exerciseName : "", b.weeks ? weekRangeText(b.weeks) : "all"])).toEqual([
      ["Bench", "Weeks 1–4"], ["Paused bench", "Weeks 5–6"], ["Row", "all"],
    ]);
    expect(dayForWeek(p.weeks[0]!.days[0]!, 5).blocks.map((b) => b.id)).toEqual(["pblock_new1", "row"]);
  });

  it("plans only the weeks it runs, and its progression starts there", () => {
    const p = { ...program, weeks: program.weeks.map((w) => ({ ...w, days: [{ ...day, blocks: [{ ...day.blocks[0]!, weeks: { from: 4, to: 6 } }] }] })) } as CoachProgram;
    expect(planExercise(p, "bench").map((c) => c?.weight ?? null)).toEqual([null, null, null, 100, 102.5, 105]);
  });

  it("the phone leaves out what isn't in this week", () => {
    const p = setBlockWeeks(program, "w1", "d", "row", { from: 1, to: 2 });
    const d = p.weeks[0]!.days[0]!;
    expect(programDaySession(d, { weekNumber: 3 }).blocks).toHaveLength(1);
    expect(programDaySession(d, { weekNumber: 2 }).blocks).toHaveLength(2);
  });
});
