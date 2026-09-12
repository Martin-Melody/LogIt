import { describe, expect, it } from "vitest";
import { createTrainingBlockTag } from "./createTrainingBlockTag";
import type { TrainingBlockTag } from "../../domain/trainingBlockTag";
import type { TrainingBlockTagRepo } from "../../data/trainingBlockTagRepo";

function deps() {
  const saved: TrainingBlockTag[] = [];
  const repo: TrainingBlockTagRepo = {
    listForExercise: async () => saved,
    create: async (t) => {
      saved.push(t);
    },
    update: async () => {},
    delete: async () => {},
  };
  return { trainingBlockTagRepo: repo, saved };
}

describe("createTrainingBlockTag", () => {
  it("creates a tag with the given fields", async () => {
    const d = deps();
    const tag = await createTrainingBlockTag(
      { exerciseId: "bench", exerciseName: "Bench", startMs: 100, endMs: 200, reason: "injury" },
      d,
    );
    expect(tag.exerciseId).toBe("bench");
    expect(tag.reason).toBe("injury");
    expect(d.saved).toEqual([tag]);
  });

  it("requires a note when the reason is 'other'", async () => {
    const d = deps();
    await expect(
      createTrainingBlockTag({ exerciseName: "Bench", startMs: 100, reason: "other" }, d),
    ).rejects.toThrow(/note is required/);
  });

  it("accepts 'other' with a note", async () => {
    const d = deps();
    const tag = await createTrainingBlockTag(
      { exerciseName: "Bench", startMs: 100, reason: "other", note: "switched gyms" },
      d,
    );
    expect(tag.note).toBe("switched gyms");
  });

  it("trims whitespace-only notes and treats them as missing", async () => {
    const d = deps();
    await expect(
      createTrainingBlockTag({ exerciseName: "Bench", startMs: 100, reason: "other", note: "   " }, d),
    ).rejects.toThrow(/note is required/);
  });

  it("rejects an endMs at or before startMs", async () => {
    const d = deps();
    await expect(
      createTrainingBlockTag({ exerciseName: "Bench", startMs: 100, endMs: 100, reason: "injury" }, d),
    ).rejects.toThrow(/endMs must be after startMs/);
  });

  it("allows an open-ended tag (no endMs)", async () => {
    const d = deps();
    const tag = await createTrainingBlockTag({ exerciseName: "Bench", startMs: 100, reason: "injury" }, d);
    expect(tag.endMs).toBeUndefined();
  });
});
