import { describe, expect, it } from "vitest";
import { getSessionPRs } from "./getSessionPRs";
import { createSession, addExercise, addSet, finishSession } from "../../domain/workout";
import type { WorkoutSession } from "../../domain/workout";

function deps(history: WorkoutSession[]) {
  return {
    workoutRepo: { listAllSessions: async () => history } as never,
    exerciseRepo: { getById: async () => null, getByName: async () => null } as never,
  };
}

function sessionWith(name: string, weight: number, reps: number): WorkoutSession {
  let s = createSession(1000);
  s = addExercise(s, { exerciseName: name });
  const id = s.blocks[0]!.id;
  s = addSet(s, id, { weight, reps, setType: "normal" });
  return finishSession(s, 2000);
}

describe("getSessionPRs", () => {
  it("flags a first-time exercise as a debut PR", async () => {
    const cur = sessionWith("Bench", 100, 5);
    const prs = await getSessionPRs(cur, deps([]));
    expect(prs).toEqual([
      { exerciseName: "Bench", exerciseId: undefined, weight: 100, reps: 5, kind: "first" },
    ]);
  });

  it("flags a heavier top set as a weight PR", async () => {
    const prev = sessionWith("Bench", 90, 5);
    const cur = sessionWith("Bench", 95, 3);
    const prs = await getSessionPRs(cur, deps([prev]));
    expect(prs[0]).toMatchObject({ kind: "weight", weight: 95 });
  });

  it("flags more reps at the same weight as a rep PR", async () => {
    const prev = sessionWith("Bench", 100, 5);
    const cur = sessionWith("Bench", 100, 7);
    const prs = await getSessionPRs(cur, deps([prev]));
    expect(prs[0]).toMatchObject({ kind: "reps", reps: 7 });
  });

  it("no PR when the session is not better", async () => {
    const prev = sessionWith("Bench", 100, 8);
    const cur = sessionWith("Bench", 95, 5);
    expect(await getSessionPRs(cur, deps([prev]))).toEqual([]);
  });
});
