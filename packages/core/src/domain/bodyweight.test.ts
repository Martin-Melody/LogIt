import { describe, it, expect } from "vitest";
import { effectiveLoadKg, getLoadMode, looksLikeBodyweightExercise, makeBodyweightLookup } from "./bodyweight";
import { createSession, addExercise, addSet, getSessionVolumeKg } from "./workout";

describe("looksLikeBodyweightExercise", () => {
  it("matches pull-ups, dips and push-ups but not machines or pulldowns", () => {
    for (const n of ["Pull-Up", "Pull ups", "Chin-up", "Dips", "Weighted Dip", "Push-Up", "Muscle-up"]) {
      expect(looksLikeBodyweightExercise(n), n).toBe(true);
    }
    for (const n of ["Lat Pulldown", "Assisted Pull-Up", "Machine Dip", "Banded Push-Up", "Bench Press", "Push Press"]) {
      expect(looksLikeBodyweightExercise(n), n).toBe(false);
    }
  });
});

describe("effectiveLoadKg", () => {
  it("adds or subtracts the logged number from bodyweight", () => {
    expect(effectiveLoadKg(0, "bodyweight", 90)).toBe(90);
    expect(effectiveLoadKg(-25, "bodyweight", 90)).toBe(65);
    expect(effectiveLoadKg(10, "bodyweight", 90)).toBe(100);
    expect(effectiveLoadKg(30, "assisted", 90)).toBe(60);
  });

  it("counts only added weight, and no assistance, without a bodyweight", () => {
    expect(effectiveLoadKg(-25, "bodyweight", null)).toBe(0);
    expect(effectiveLoadKg(10, "bodyweight", null)).toBe(10);
    expect(effectiveLoadKg(30, "assisted", null)).toBe(0);
    expect(effectiveLoadKg(60, "external", 90)).toBe(60);
  });

  it("never goes below zero", () => {
    expect(effectiveLoadKg(-100, "bodyweight", 60)).toBe(0);
    expect(effectiveLoadKg(100, "assisted", 60)).toBe(0);
  });
});

describe("getLoadMode", () => {
  it("uses the type first, then negative weights, then the name", () => {
    expect(getLoadMode("assisted", [-5], "Dips")).toBe("assisted");
    expect(getLoadMode("bodyweight")).toBe("bodyweight");
    expect(getLoadMode(undefined, [-25], "Something")).toBe("bodyweight");
    expect(getLoadMode("normal", [0], "Pull-Up")).toBe("bodyweight");
    expect(getLoadMode("normal", [60], "Bench Press")).toBe("external");
  });
});

describe("makeBodyweightLookup", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
  const lookup = makeBodyweightLookup(
    [
      { dateIso: "2026-10-01", weightKg: 90 },
      { dateIso: "2026-10-15", weightKg: 92 },
      { dateIso: "2026-10-20", weightKg: 50, deletedAtMs: 1 },
    ],
    80,
  );

  it("uses the last weigh-in on or before the day", () => {
    expect(lookup(at("2026-10-01"))).toBe(90);
    expect(lookup(at("2026-10-14"))).toBe(90);
    expect(lookup(at("2026-10-15"))).toBe(92);
    expect(lookup(at("2026-11-01"))).toBe(92);
  });

  it("uses the first weigh-in for days before it, and the fallback with no log", () => {
    expect(lookup(at("2026-09-01"))).toBe(90);
    expect(makeBodyweightLookup([], 80)(at("2026-10-01"))).toBe(80);
    expect(makeBodyweightLookup([], null)(at("2026-10-01"))).toBe(null);
  });
});

describe("session volume with bodyweight", () => {
  it("counts bodyweight exercises at bodyweight ± the logged number", () => {
    let s = addExercise(createSession(), { exerciseName: "Dips" });
    s = addSet(s, s.blocks[0]!.id, { reps: 10, weight: -25 });
    s = addExercise(s, { exerciseName: "Assist machine" });
    s = addSet(s, s.blocks[1]!.id, { reps: 10, weight: 30 });
    s = addExercise(s, { exerciseName: "Bench Press" });
    s = addSet(s, s.blocks[2]!.id, { reps: 5, weight: 100 });

    const types = (ex: { exerciseName: string }) => (ex.exerciseName === "Assist machine" ? "assisted" as const : undefined);
    expect(getSessionVolumeKg(s, { bodyweightKg: 90, exerciseTypeOf: types })).toBe(650 + 600 + 500);
    // Unknown bodyweight: assisted work counts nothing, negative BW sets nothing.
    expect(getSessionVolumeKg(s, { exerciseTypeOf: types })).toBe(500);
  });
});
