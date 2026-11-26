import { describe, expect, it } from "vitest";
import { exerciseIndex, findExercises } from "./exerciseIndex";
import type { WorkoutSession } from "./workout";

const set = (weight: number, reps: number, i: number) => ({ id: `s${i}`, setType: "working" as const, reps, weight, orderIndex: i, completed: true });
const session = (id: string, at: number, blocks: [string, string, [number, number][]][]): WorkoutSession =>
  ({
    id,
    startedAtMs: at,
    endedAtMs: at + 3_600_000,
    blocks: blocks.map(([exerciseId, exerciseName, sets], i) => ({
      id: `${id}-b${i}`,
      type: "strength",
      orderIndex: i,
      data: { exerciseId, exerciseName, sets: sets.map(([w, r], j) => set(w, r, j)) },
    })),
  }) as unknown as WorkoutSession;

describe("exercise index for ⌘K", () => {
  const index = exerciseIndex([
    session("a", 1_000, [["bench", "Bench Press", [[95, 5], [97.5, 5]]], ["squat", "Back Squat", [[140, 5]]]]),
    session("b", 2_000, [["bench", "Bench Press", [[100, 5]]], ["incline", "Incline Bench Press", [[80, 6]]]]),
  ]);

  it("keeps each exercise's best set and when it was last done", () => {
    const bench = index.find((e) => e.id === "bench")!;
    expect([bench.weight, bench.reps, bench.lastMs]).toEqual([100, 5, 2_000]);
    expect(index[index.length - 1]!.id).toBe("squat"); // most recent first
  });

  it("finds by every word, names starting with it first", () => {
    expect(findExercises(index, "bench").map((e) => e.id)).toEqual(["bench", "incline"]);
    expect(findExercises(index, "incline bench").map((e) => e.id)).toEqual(["incline"]);
    expect(findExercises(index, "  ")).toEqual([]);
  });
});
