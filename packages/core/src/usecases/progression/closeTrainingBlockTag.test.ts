import { describe, expect, it } from "vitest";
import { closeTrainingBlockTag } from "./closeTrainingBlockTag";
import type { TrainingBlockTag } from "../../domain/trainingBlockTag";
import type { TrainingBlockTagRepo } from "../../data/trainingBlockTagRepo";

function deps(initial: TrainingBlockTag[]) {
  const store = new Map(initial.map((t) => [t.id, t]));
  const repo: TrainingBlockTagRepo = {
    listForExercise: async () => [...store.values()],
    create: async (t) => {
      store.set(t.id, t);
    },
    update: async (t) => {
      store.set(t.id, t);
    },
    delete: async (id) => {
      store.delete(id);
    },
  };
  return { trainingBlockTagRepo: repo, store };
}

const openTag: TrainingBlockTag = {
  id: "t1",
  exerciseName: "Bench",
  startMs: 1000,
  reason: "injury",
  createdAtMs: 0,
};

describe("closeTrainingBlockTag", () => {
  it("sets endMs on an open-ended tag", async () => {
    const d = deps([openTag]);
    await closeTrainingBlockTag("bench", "t1", d, 5000);
    expect(d.store.get("t1")!.endMs).toBe(5000);
  });

  it("defaults to now when no endMs is given", async () => {
    const d = deps([openTag]);
    const before = Date.now();
    await closeTrainingBlockTag("bench", "t1", d);
    expect(d.store.get("t1")!.endMs!).toBeGreaterThanOrEqual(before);
  });

  it("is a no-op if the tag is already closed", async () => {
    const closed = { ...openTag, endMs: 2000 };
    const d = deps([closed]);
    await closeTrainingBlockTag("bench", "t1", d, 9999);
    expect(d.store.get("t1")!.endMs).toBe(2000);
  });

  it("is a no-op if the tag doesn't exist", async () => {
    const d = deps([]);
    await expect(closeTrainingBlockTag("bench", "missing", d, 5000)).resolves.toBeUndefined();
  });
});
