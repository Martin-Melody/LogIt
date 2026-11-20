import { describe, expect, it } from "vitest";
import { guessExerciseSetup, needsSetup } from "./exerciseGuess";

describe("guessExerciseSetup", () => {
  it.each([
    ["SSB Squat (Mine)", ["quads", "glutes"], "barbell"],
    ["Belt Squat Machine", ["quads", "glutes"], "machine"],
    ["Hammer Curl (Cable)", ["biceps"], "cable"],
    ["Seated Leg Curl", ["hamstrings"], undefined],
    ["Trap Bar Deadlift", ["hamstrings", "glutes", "back"], "barbell"],
    ["Incline DB Press", ["chest", "triceps"], "dumbbell"],
    ["Cable Lateral Raise", ["shoulders"], "cable"],
    ["Weighted Pull-Up", ["back", "biceps"], "bodyweight"],
    ["Rope Pushdown", ["triceps"], undefined],
    ["Hanging Leg Raise", ["core"], undefined],
    ["JM Press", ["triceps"], undefined],
    ["45° Back Extension", ["back", "glutes"], undefined],
  ] as const)("%s", (name, muscles, equipment) => {
    expect(guessExerciseSetup(name)).toEqual({ primaryMuscles: muscles, equipment });
  });

  it("guesses nothing rather than something wrong", () => {
    expect(guessExerciseSetup("Zercher Thing")).toEqual({ primaryMuscles: [], equipment: undefined });
  });
});

describe("needsSetup", () => {
  it("is an own exercise with no muscles yet", () => {
    expect(needsSetup({ isCore: false, primaryMuscles: [] })).toBe(true);
    expect(needsSetup({ isCore: false, primaryMuscles: ["quads"] })).toBe(false);
    expect(needsSetup({ isCore: true, primaryMuscles: [] })).toBe(false);
  });
});
