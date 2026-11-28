import { describe, expect, it } from "vitest";
import { gymLimits } from "./gymLimits";
import type { CoachProgram } from "./CoachProgram";
import type { Place } from "./place";

const place = {
  id: "g", name: "Flyefit", kind: "gym", kit: [], createdAtMs: 0, updatedAtMs: 0,
  machines: [{ id: "m", name: "Leg extension", loading: "stack", status: "in", exerciseIds: ["core_leg_extension"], weights: { kind: "stack", values: [5, 10, 50, 100] } }],
} as unknown as Place;
const sets = [0, 1, 2].map((k) => ({ id: `s${k}`, orderIndex: k, setType: "normal" as const, reps: 10, weight: 90 }));
const program = {
  id: "p", name: "P", rule: { kind: "linear", stepKg: 5 },
  weeks: [1, 2, 3, 4].map((n) => ({ id: `w${n}`, weekNumber: n, days: [{ id: "d", orderIndex: 0, blocks: [{ type: "strength", id: "b", orderIndex: 0, exerciseName: "Leg extension", exerciseId: "core_leg_extension", sets }] }] })),
} as unknown as CoachProgram;

describe("gym limits (6.15)", () => {
  it("finds the first week a plan asks for more than the stack", () => {
    const [l] = gymLimits(program, place, {});
    expect(l).toMatchObject({ exerciseName: "Leg extension", what: "Leg extension", topKg: 100, week: 4, plannedKg: 105, decided: false });
  });

  it("a machine they can load past with a pin isn't a limit", () => {
    const pinned = { ...place, machines: [{ ...place.machines[0]!, extraLoad: ["pin"] }] } as Place;
    expect(gymLimits(program, pinned, {})).toEqual([]);
  });
});
