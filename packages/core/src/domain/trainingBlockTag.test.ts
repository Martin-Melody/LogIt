import { describe, expect, it } from "vitest";
import { isWithinTrainingBlockTag, isDateTaggedOut, type TrainingBlockTag } from "./trainingBlockTag";

function tag(overrides: Partial<TrainingBlockTag> = {}): TrainingBlockTag {
  return {
    id: "t1",
    exerciseName: "Bench",
    startMs: 1000,
    endMs: 2000,
    reason: "injury",
    createdAtMs: 0,
    ...overrides,
  };
}

describe("isWithinTrainingBlockTag", () => {
  it("is true for a date inside [startMs, endMs)", () => {
    expect(isWithinTrainingBlockTag(1500, tag())).toBe(true);
  });

  it("is inclusive of startMs", () => {
    expect(isWithinTrainingBlockTag(1000, tag())).toBe(true);
  });

  it("is exclusive of endMs", () => {
    expect(isWithinTrainingBlockTag(2000, tag())).toBe(false);
  });

  it("is false before startMs", () => {
    expect(isWithinTrainingBlockTag(999, tag())).toBe(false);
  });

  it("treats an undefined endMs as still in effect indefinitely", () => {
    expect(isWithinTrainingBlockTag(10_000_000, tag({ endMs: undefined }))).toBe(true);
  });
});

describe("isDateTaggedOut", () => {
  it("is true if any tag in the list covers the date", () => {
    const tags = [tag({ startMs: 0, endMs: 100 }), tag({ id: "t2", startMs: 1000, endMs: 2000 })];
    expect(isDateTaggedOut(1500, tags)).toBe(true);
  });

  it("is false if no tag covers the date", () => {
    const tags = [tag({ startMs: 0, endMs: 100 })];
    expect(isDateTaggedOut(1500, tags)).toBe(false);
  });

  it("is false for an empty tag list", () => {
    expect(isDateTaggedOut(1500, [])).toBe(false);
  });
});
