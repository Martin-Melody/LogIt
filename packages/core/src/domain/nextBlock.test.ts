import { describe, expect, it } from "vitest";
import { addDay, addSet, addStrengthBlock, createCoachProgram, setProgramStart, type CoachProgram, type ProgramStrength } from "./CoachProgram";
import { forBuilder, setLength } from "./programBuilder";
import { blockSummaryText, nextBlockFrom, reviewBlock } from "./nextBlock";
import type { WorkoutSession } from "./workout";
import type { MuscleGroup } from "./exercise";

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 5);

function program(): CoachProgram {
  let p = createCoachProgram("Hypertrophy");
  const w = p.weeks[0]!.id;
  p = addDay(p, w, "Lower");
  const d = p.weeks[0]!.days[0]!.id;
  for (const name of ["Squat", "Pull-up"]) {
    p = addStrengthBlock(p, w, d, { exerciseName: name });
    const b = p.weeks[0]!.days[0]!.blocks.at(-1)!.id;
    for (let i = 0; i < 3; i++) p = addSet(p, w, d, b, { reps: 8, weight: name === "Squat" ? 60 : 0 });
  }
  p = setLength(forBuilder(p)!, 4);
  return setProgramStart(p, { mode: "fixed-date", startDateMs: START });
}
const muscles = (n: string): MuscleGroup[] => (n === "Squat" ? ["quads"] : n === "Pull-up" || n === "Chin-up" ? ["back"] : []);

function session(p: CoachProgram, at: number, squat: number, pullups: number): WorkoutSession {
  const sets = (w: number, r: number) => [1, 2, 3].map((i) => ({ id: `s${i}`, reps: r, weight: w, completed: true, setType: "normal" }));
  return {
    id: `x${at}`, startedAtMs: at, endedAtMs: at + 3600_000,
    source: { kind: "program", parentId: p.id, dayId: p.weeks[0]!.days[0]!.id },
    blocks: [
      { id: "a", type: "strength", orderIndex: 0, data: { exerciseName: "Squat", sets: sets(squat, 5) } },
      { id: "b", type: "strength", orderIndex: 1, data: { exerciseName: "Pull-up", sets: sets(0, pullups) } },
    ],
  } as unknown as WorkoutSession;
}

describe("next block (canvas W3)", () => {
  it("says how the block went: sessions, lifts at the start and now, muscles behind", () => {
    const p = program();
    const now = START + 27 * DAY;
    const r = reviewBlock(p, [session(p, START + DAY, 70, 4), session(p, START + 15 * DAY, 72.5, 5), session(p, now - 2 * DAY, 80, 7)], muscles, now);
    expect(r.sessionsDone).toBe(3);
    expect(r.sessionsPlanned).toBe(4);
    expect(r.lifts.map((l) => l.name)).toEqual(["Squat", "Pull-up"]);
    expect(r.lifts[0]!.start).toEqual({ kg: 81.5 });
    expect(r.lifts[1]!.now).toEqual({ reps: 7 });
    // 9 back sets over 4 weeks: about 2 a week, under 10.
    expect(r.behind.map((b) => b.muscle).sort()).toEqual(["back", "quads"]);
    expect(r.behind[0]).toMatchObject({ sets: 2, target: 10 });
    expect(blockSummaryText(p.name, r)).toContain("Squat: 81.5 kg → 93.5 kg");
    expect(blockSummaryText(p.name, r, START + 35 * DAY)).toContain("Your next block starts");
  });

  it("the rerun starts on the new date, numbers unpinned, with the small changes", () => {
    let p = program();
    // Week 3's squat was typed (pinned).
    p = { ...p, weeks: p.weeks.map((w) => (w.weekNumber === 3 ? { ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b, i) => (i === 0 && b.type === "strength" ? { ...b, sets: b.sets.map((s) => ({ ...s, weight: 90, pinned: true })) } : b)) })) } : w)) };
    const next = nextBlockFrom(p, { startDateMs: START + 35 * DAY, lengthWeeks: 6, moreSetsFor: ["back"], lighterFirst: true, keepSwaps: [{ from: "Pull-up", to: "Chin-up", atMs: 1 }] }, muscles);
    expect(next.id).not.toBe(p.id);
    expect(next.startDateMs).toBe(START + 35 * DAY);
    expect(next.weeks).toHaveLength(6);
    expect(next.weeks[0]!.lighter).toBe(true);
    const w3 = next.weeks.find((w) => w.weekNumber === 3)!.days[0]!.blocks;
    expect((w3[0] as ProgramStrength).sets.every((s) => !s.pinned && s.weight === 60)).toBe(true);
    expect((w3[1] as ProgramStrength).exerciseName).toBe("Chin-up");
    expect((w3[1] as ProgramStrength).sets).toHaveLength(4);
    expect((w3[0] as ProgramStrength).sets).toHaveLength(3);
  });
});
