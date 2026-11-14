import { describe, expect, it } from "vitest";
import { clearOtherRests, getRunningRests, type WorkoutSession } from "./workout";

const set = (id: string, restStartedAtMs: number | null) => ({
  id, setType: "normal", reps: 5, weight: 100, orderIndex: 0, completed: true, restStartedAtMs,
});

const session = (): WorkoutSession =>
  ({
    id: "s",
    startedAtMs: 0,
    blocks: [
      { id: "a", type: "strength", orderIndex: 0, data: { exerciseName: "Bench", sets: [set("a1", 1000), set("a2", 2000)] } },
      { id: "b", type: "strength", orderIndex: 1, data: { exerciseName: "Row", sets: [set("b1", 1500)] } },
    ],
  }) as unknown as WorkoutSession;

describe("one rest at a time", () => {
  it("starting a rest ends the others, in every block", () => {
    const next = clearOtherRests(session(), "a2");
    expect(getRunningRests(next, { normal: 90_000 }).map((r) => r.setId)).toEqual(["a2"]);
  });

  it("returns the same session when nothing else is resting", () => {
    const only = clearOtherRests(session(), "a2");
    expect(clearOtherRests(only, "a2")).toBe(only);
  });
});
