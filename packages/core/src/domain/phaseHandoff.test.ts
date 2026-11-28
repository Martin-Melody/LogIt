import { describe, expect, it } from "vitest";
import { handoffDue, putPhase, removePhase, withHandoffs, type CoachProgram } from "./CoachProgram";
import { foundWeights } from "./phaseHandoff";
import { planExercise } from "./programPlan";

const DAY = 86_400_000;
const sets = [0, 1, 2].map((k) => ({ id: `s${k}`, orderIndex: k, setType: "normal" as const, reps: 8, weight: 60 }));
const day = { id: "d", orderIndex: 0, blocks: [
  { type: "strength" as const, id: "sq", orderIndex: 0, exerciseName: "Squat", sets },
  { type: "strength" as const, id: "bp", orderIndex: 1, exerciseName: "Bench Press", sets },
] };
const base = { id: "p", name: "P", startMode: "fixed-date", startDateMs: 0, rule: { kind: "linear", stepKg: 2.5 }, weeks: Array.from({ length: 4 }, (_, i) => ({ id: `w${i + 1}`, weekNumber: i + 1, days: [day] })) } as unknown as CoachProgram;
const phased = putPhase(base, { id: "find", name: "Find your weights", weeks: { from: 1, to: 1 }, findsWeights: true });

describe("phases and handoff (6.9)", () => {
  it("a weight-finding phase makes its weeks Find your weights, and removing it puts them back", () => {
    expect(phased.weeks[0]!.type?.kind).toBe("find");
    expect(removePhase(phased, "find").weeks[0]!.type).toBeUndefined();
  });

  it("the next phase plans from the estimate, from its first week", () => {
    // No typed weights: the numbers come from the estimate, starting in week 2.
    const untyped = { ...phased, weeks: phased.weeks.map((w) => ({ ...w, days: [{ ...day, blocks: day.blocks.map((b) => ({ ...b, sets: b.sets.map(({ weight: _w, ...s }) => s) })) }] })) } as CoachProgram;
    const cells = planExercise(untyped, "sq", { e1rm: () => 100 });
    expect(cells[0]?.source).toBe("words");
    const w = cells.slice(1).map((c) => c!.weight!);
    expect(w[0]).toBeLessThan(100);
    expect([w[1]! - w[0]!, w[2]! - w[1]!]).toEqual([2.5, 2.5]);
  });

  it("finds the top sets, how sure, and the coach's numbers win", () => {
    const s = (day0: number, weight: number, reps: number, rpe?: number) => ({
      id: `x${day0}${weight}`, startedAtMs: day0 * DAY, endedAtMs: day0 * DAY + 1, source: { kind: "program", parentId: "p", dayId: "d" },
      blocks: [{ id: "b", type: "strength", orderIndex: 0, data: { exerciseName: "Squat", sets: [{ id: "a", setType: "normal", reps, weight, orderIndex: 0, completed: true, ...(rpe ? { rpe } : {}) }] } }],
    });
    const found = foundWeights(phased, phased.phases![0]!, [s(1, 100, 6, 9), s(3, 90, 8), s(10, 200, 1)] as never);
    expect(found.map((f) => [f.exerciseName, f.top?.weight ?? null, f.how])).toEqual([["Squat", 100, "sure"], ["Bench Press", null, "skipped"]]);
    expect(handoffDue(phased, 1)?.id).toBe("find");
    expect(handoffDue(phased, 3)).toBeNull();
    const checked = { ...phased, handoffs: [{ phaseId: "find", checkedAtMs: 1, e1rm: { squat: 110 } }] };
    expect(handoffDue(checked, 2)).toBeNull();
    expect(withHandoffs(checked, () => 100)("Squat")).toBe(110);
    expect(withHandoffs(checked, () => 100)("Bench Press")).toBe(100);
  });
});
