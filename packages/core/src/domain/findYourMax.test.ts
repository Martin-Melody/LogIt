import { describe, expect, it } from "vitest";
import { createCoachProgram, maxTestDue, MAX_FINDER_ID, phaseBlock, type CoachProgram, type ProgramBlock } from "./CoachProgram";
import { setLength } from "./programBuilder";
import { putStretch, stretchesOf, stretchTitle } from "./stretches";
import { maxesFound } from "./phaseHandoff";
import { programDaySession } from "./programDaySession";
import type { WorkoutSession } from "./workout";

let n = 0;
const id = () => `m${++n}`;
const WEEK = 7 * 86_400_000;
const START = Date.UTC(2026, 8, 7);

function program(): CoachProgram {
  let p = setLength({ ...createCoachProgram("P"), startMode: "fixed-date", startDateMs: START }, 10);
  const day = { id: "d", orderIndex: 0, blocks: [
    { type: "strength", id: "sq", orderIndex: 0, exerciseName: "Back squat", sets: [{ id: "s", orderIndex: 0, setType: "normal", reps: 5 }] },
    { type: "strength", id: "fl", orderIndex: 1, exerciseName: "Cable fly", sets: [{ id: "f", orderIndex: 0, setType: "normal", reps: 12 }] },
  ] as ProgramBlock[] };
  p = { ...p, weeks: p.weeks.map((w) => ({ ...w, days: [day] })) };
  return putStretch(p, { from: 10, to: 10, what: { kind: "max", lifts: ["Back squat"] } }, id);
}
const session = (weekIdx: number, sets: [number, number][]): WorkoutSession => ({
  id: `s${weekIdx}`, startedAtMs: START + weekIdx * WEEK + 3600_000, endedAtMs: START + weekIdx * WEEK + 7200_000,
  source: { kind: "program", parentId: "P", dayId: "d" },
  blocks: [{ id: "b", type: "strength", orderIndex: 0, data: { exerciseName: "Back squat", sets: sets.map(([w, r], i) => ({ id: `x${i}`, orderIndex: i, setType: "normal", weight: w, reps: r, completed: true })) } }],
}) as unknown as WorkoutSession;

describe("Find your max (PX4)", () => {
  it("is a stretch that runs the Max finder on the lifts ticked only", () => {
    const p = program();
    expect(stretchTitle(stretchesOf(p).at(-1)!)).toBe("Find your max");
    const ph = p.phases![0]!;
    expect(phaseBlock(ph)).toBe(MAX_FINDER_ID);
    const decl = { id: MAX_FINDER_ID, name: "Max finder", entry: { one: "Single", many: "Singles" }, blockFields: [{ key: "lift", type: "exercise", label: "Lift" }], fields: [{ key: "kg", type: "weight", label: "kg" }] };
    const s = programDaySession(p.weeks[9]!.days[0]!, { weekNumber: 10, phase: ph, pluginBlock: (pid) => (pid === MAX_FINDER_ID ? decl as never : null) });
    expect(s.blocks.map((b) => b.type.split(":")[0])).toEqual(["plugin", "strength"]);
    expect(maxTestDue(p, 10)?.id).toBe(ph.id);
  });
  it("changing it to a test week doesn't keep the name Find your max", async () => {
    const { WEEK_TYPES } = await import("./weekTypes");
    const p = program();
    const s = stretchesOf(p).at(-1)!;
    const q = putStretch(p, { from: 10, to: 10, ...(s.name ? { name: s.name } : {}), what: { kind: "week", type: WEEK_TYPES.test } }, id, s);
    expect(stretchTitle(stretchesOf(q).at(-1)!)).toBe("Test");
  });

  it("compares the start with the heaviest single", () => {
    const p = { ...program(), id: "P" };
    const out = maxesFound(p, p.phases![0]!, [session(0, [[60, 5]]), session(9, [[80, 1], [85, 1]])]);
    expect(out).toEqual([{ exerciseName: "Back squat", startKg: 70, nowKg: 85, single: true }]);
  });
});
