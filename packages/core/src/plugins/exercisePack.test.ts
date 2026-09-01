import { describe, expect, it } from "vitest";
import {
  buildExercisePack,
  packExerciseId,
  parseExercisePack,
  MAX_PACK_EXERCISES,
} from "./exercisePack";

const valid = {
  formatVersion: 1,
  pluginId: "com.example.pack",
  exercises: [
    { name: "Zercher Squat", primaryMuscles: ["quads"], secondaryMuscles: ["core"] },
    { name: "Jefferson Deadlift", primaryMuscles: ["glutes", "quads"], secondaryMuscles: [] },
  ],
};

describe("parseExercisePack", () => {
  it("parses a well-formed pack", () => {
    const pack = parseExercisePack(valid);
    expect(pack.exercises).toHaveLength(2);
    expect(pack.exercises[0]).toMatchObject({
      name: "Zercher Squat",
      primaryMuscles: ["quads"],
      exerciseType: "normal",
      notes: null,
    });
  });

  it("defaults exerciseType and notes", () => {
    const pack = parseExercisePack(valid);
    expect(pack.exercises[1].exerciseType).toBe("normal");
    expect(pack.exercises[1].notes).toBeNull();
  });

  it("enforces the declared pluginId when an expected id is given", () => {
    expect(() => parseExercisePack(valid, "com.other.pack")).toThrow(/does not match/);
    expect(() => parseExercisePack(valid, "com.example.pack")).not.toThrow();
  });

  it("rejects an unknown muscle group", () => {
    expect(() =>
      parseExercisePack({
        ...valid,
        exercises: [{ name: "X", primaryMuscles: ["neck"], secondaryMuscles: [] }],
      }),
    ).toThrow(/unknown muscle group/i);
  });

  it("rejects the wrong format version", () => {
    expect(() => parseExercisePack({ ...valid, formatVersion: 2 })).toThrow(/format/i);
  });

  it("rejects an empty exercise list", () => {
    expect(() => parseExercisePack({ ...valid, exercises: [] })).toThrow(/no exercises/i);
  });

  it("rejects a nameless exercise", () => {
    expect(() =>
      parseExercisePack({ ...valid, exercises: [{ primaryMuscles: [], secondaryMuscles: [] }] }),
    ).toThrow(/name/i);
  });

  it("drops in-pack duplicate names (case-insensitive)", () => {
    const pack = parseExercisePack({
      ...valid,
      exercises: [
        { name: "Row", primaryMuscles: ["back"], secondaryMuscles: [] },
        { name: "row", primaryMuscles: ["back"], secondaryMuscles: [] },
      ],
    });
    expect(pack.exercises).toHaveLength(1);
  });

  it("caps pack size", () => {
    const many = Array.from({ length: MAX_PACK_EXERCISES + 1 }, (_, i) => ({
      name: `Ex ${i}`,
      primaryMuscles: [],
      secondaryMuscles: [],
    }));
    expect(() => parseExercisePack({ ...valid, exercises: many })).toThrow(/limit/i);
  });

  it("dedupes muscle groups within one exercise", () => {
    const pack = parseExercisePack({
      ...valid,
      exercises: [{ name: "X", primaryMuscles: ["quads", "quads"], secondaryMuscles: [] }],
    });
    expect(pack.exercises[0].primaryMuscles).toEqual(["quads"]);
  });
});

describe("packExerciseId", () => {
  it("is stable and namespaced", () => {
    expect(packExerciseId("com.example.pack", "Zercher Squat!")).toBe(
      "pack:com.example.pack:zercher-squat",
    );
  });
});

describe("buildExercisePack", () => {
  it("round-trips through validation", () => {
    const pack = buildExercisePack("com.example.pack", [
      {
        name: "Sissy Squat",
        primaryMuscles: ["quads"],
        secondaryMuscles: [],
        exerciseType: "bodyweight",
        notes: null,
      },
    ]);
    expect(pack.pluginId).toBe("com.example.pack");
    expect(pack.exercises[0].exerciseType).toBe("bodyweight");
  });
});
