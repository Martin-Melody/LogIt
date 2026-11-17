import { describe, expect, it } from "vitest";
import { dayFrequencies, plannedWeeklySets, scoreSplit, setTargetFor, DEFAULT_SET_TARGETS, type MuscleTags } from "./weeklySets";
import type { PlannedStrength, SplitDay, WorkoutSplit } from "./WorkoutSplit";
import type { MuscleGroup } from "./exercise";

function block(name: string, sets: number, extra: Partial<PlannedStrength> = {}): PlannedStrength {
  return { type: "strength", id: `${name}-${sets}`, orderIndex: 0, exerciseName: name, targets: { sets }, ...extra };
}
function day(id: string, blocks: PlannedStrength[], extra: Partial<SplitDay> = {}): SplitDay {
  return { id, orderIndex: Number(id.replace(/\D/g, "")) || 0, name: id, blocks, ...extra };
}
function split(days: SplitDay[], schedule?: WorkoutSplit["schedule"]): WorkoutSplit {
  return { id: "s", name: "PPL", archived: false, createdAtMs: 0, updatedAtMs: 0, days, schedule };
}

const TAGS: Record<string, MuscleTags> = {
  Bench: { primary: ["chest"], secondary: ["triceps", "shoulders"] },
  Row: { primary: ["back"], secondary: ["biceps"] },
  Squat: { primary: ["quads", "glutes"], secondary: ["hamstrings"] },
  Curl: { primary: ["biceps"], secondary: [] },
};
const musclesOf = (b: PlannedStrength) => TAGS[b.exerciseName] ?? null;

describe("weekly sets", () => {
  it("counts a weekday split once a week per day, secondary muscles at 40%", () => {
    const s = split([day("d1", [block("Bench", 4)], { weekday: 1 }), day("d2", [block("Bench", 4), block("Row", 3)], { weekday: 4 })], "weekdays");
    const p = plannedWeeklySets(s, musclesOf, 3);
    expect(p.sets.chest).toBe(8);
    expect(p.sets.triceps).toBe(3.2);
    expect(p.sets.back).toBe(3);
  });

  it("spreads a rotation with rest days over its calendar length", () => {
    const s = split([day("d1", [block("Bench", 3)]), day("d2", [block("Row", 3)]), day("d3", [], { rest: true })]);
    const f = dayFrequencies(s, 3);
    expect(f.get("d1")).toBeCloseTo(7 / 3, 5);
  });

  it("spreads a rotation without rest days over the weekly workout target", () => {
    const s = split([day("d1", [block("Bench", 3)]), day("d2", [block("Row", 3)]), day("d3", [block("Squat", 3)])]);
    expect(dayFrequencies(s, 5).get("d1")).toBeCloseTo(5 / 3, 5);
  });

  it("suggests more sets of an exercise already in the split, or a new one", () => {
    const s = split([day("d1", [block("Bench", 3)], { weekday: 1 }), day("d2", [block("Squat", 3)], { weekday: 4 })], "weekdays");
    const rows = scoreSplit(plannedWeeklySets(s, musclesOf, 2), { ...DEFAULT_SET_TARGETS });
    const chest = rows.find((r) => r.muscle === "chest")!;
    expect(chest.status).toBe("under");
    expect(chest.fix).toBe("Add 7 sets of Bench on d1.");
    expect(rows.find((r) => r.muscle === "back")!.fix).toMatch(/Nothing in this split works back directly/);
    expect(rows.find((r) => r.muscle === "forearms")!.status).toBe("in");
  });

  it("moves a target when the insight is sure enough", () => {
    const v = { direction: "higher" as const, thresholdSets: 14, improveRateAbove: 0.7, improveRateBelow: 0.4 };
    expect(setTargetFor("chest" as MuscleGroup, { volumeInsight: v, confidence: "high" })).toEqual({ lo: 14, hi: 18, learned: true });
    expect(setTargetFor("chest" as MuscleGroup, { volumeInsight: v, confidence: "low" })).toEqual({ lo: 10, hi: 16 });
  });
});
