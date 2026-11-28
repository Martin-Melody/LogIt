import { describe, expect, it } from "vitest";
import type { CoachProgram, ProgramDay } from "./CoachProgram";
import { addToGroup, groupLabel, setGroup, strengthSummary, ungroup } from "./CoachProgram";
import { programDaySession } from "./programDaySession";
import { blockGroup } from "./workout";

const set = (k: number, extra = {}) => ({ id: `s${k}`, orderIndex: k, setType: "normal" as const, reps: 10, ...extra });
const ex = (id: string, i: number, group?: string, extra = {}) => ({ type: "strength" as const, id, orderIndex: i, exerciseName: id, supersetGroup: group, sets: [set(0), set(1), set(2)], ...extra });

describe("groups and measures (6.6)", () => {
  it("a tri-set stays a superset unless the coach made it a circuit", () => {
    const day: ProgramDay = { id: "d", orderIndex: 0, blocks: [ex("A", 0, "g"), ex("B", 1, "g"), ex("C", 2, "g")] };
    expect(groupLabel(day, "g")).toBe("Tri-set");
    const s = programDaySession(day);
    expect(blockGroup(s.blocks[0]!)?.kind).toBe("superset");
    const circuit = programDaySession({ ...day, groups: [{ id: "g", kind: "circuit", roundRestSec: 90, name: "Finisher" }] });
    const info = blockGroup(circuit.blocks[0]!)!;
    expect([info.kind, info.label, info.roundRestMs]).toEqual(["circuit", "Finisher", 90000]);
  });

  it("adds to a group after its last member, and ungroups", () => {
    const day: ProgramDay = { id: "d", orderIndex: 0, blocks: [ex("A", 0, "g"), ex("B", 1, "g"), ex("X", 2), ex("C", 3)] };
    const p = { id: "p", name: "P", weeks: [{ id: "w", weekNumber: 1, days: [day] }] } as unknown as CoachProgram;
    let next = addToGroup(p, "w", "d", "C", "g");
    const blocks = next.weeks[0]!.days[0]!.blocks.sort((a, b) => a.orderIndex - b.orderIndex);
    expect(blocks.map((b) => `${b.id}${b.supersetGroup ? "*" : ""}`)).toEqual(["A*", "B*", "C*", "X"]);
    next = setGroup(next, "w", "d", "g", { name: "Arms" });
    expect(groupLabel(next.weeks[0]!.days[0]!, "g")).toBe("Arms");
    next = ungroup(next, "w", "d", "g");
    expect(next.weeks[0]!.days[0]!.blocks.every((b) => !b.supersetGroup)).toBe(true);
    expect(next.weeks[0]!.days[0]!.groups).toEqual([]);
  });

  it("a hold runs as a timed drill, a carry as distance, bodyweight with no weight", () => {
    const plank = ex("Plank", 0, undefined, { measure: "time", perSide: false, sets: [set(0, { durationSec: 45 }), set(1, { durationSec: 45 })] });
    const carry = ex("Farmer's carry", 1, undefined, { measure: "distance", sets: [set(0, { distanceM: 40 }), set(1, { distanceM: 40 })] });
    const pushup = ex("Push-up", 2, undefined, { measure: "reps", sets: [set(0, { weight: 20 })] });
    expect(strengthSummary(plank)).toBe("2 × 0:45");
    const s = programDaySession({ id: "d", orderIndex: 0, blocks: [plank, carry, pushup] });
    expect(s.blocks.map((b) => b.type)).toEqual(["mobility", "cardio", "strength"]);
    expect((s.blocks[0]!.data as { sets: { targetSec?: number }[] }).sets.map((x) => x.targetSec)).toEqual([45, 45]);
    expect((s.blocks[1]!.data as { planned?: string }).planned).toBe("2 × 40 m");
    expect((s.blocks[2]!.data as { sets: { weight: number }[] }).sets[0]!.weight).toBe(0);
  });

  it("cardio carries what was planned", () => {
    const s = programDaySession({ id: "d", orderIndex: 0, blocks: [{ type: "cardio", id: "c", orderIndex: 0, activityName: "Rower", intervals: { workSec: 60, easySec: 120, repeat: 6 }, effort: "Hard, about 8/10" }] });
    expect((s.blocks[0]!.data as { planned?: string }).planned).toBe("6 × 1:00, 2:00 easy · Hard, about 8/10");
  });
});
