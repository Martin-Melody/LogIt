import { describe, expect, it } from "vitest";
import { getExerciseHistory } from "./getExerciseHistory";
import { createSession, addExercise, addSet, finishSession } from "../../domain/workout";
import type { WorkoutSession } from "../../domain/workout";
import type { ProgressionDeps } from "./deps";

function deps(sessions: WorkoutSession[]): Pick<ProgressionDeps, "workoutRepo" | "exerciseRepo"> {
  return {
    workoutRepo: { listAllSessions: async () => sessions, listRecentSessions: async () => sessions },
    exerciseRepo: { getById: async () => null, getByName: async () => null },
  };
}

describe("getExerciseHistory", () => {
  it("records sessionPosition 0 when the exercise is done first", async () => {
    let s = createSession(1000);
    s = addExercise(s, { exerciseName: "Bench" });
    s = addSet(s, s.blocks[0]!.id, { weight: 100, reps: 5 });
    s = finishSession(s, 2000);

    const { history } = await getExerciseHistory({ name: "Bench" }, deps([s]));
    expect(history[0]!.sessionPosition).toBe(0);
  });

  it("records the actual position when other exercises come first", async () => {
    let s = createSession(1000);
    s = addExercise(s, { exerciseName: "Squat" });
    s = addSet(s, s.blocks[0]!.id, { weight: 120, reps: 5 });
    s = addExercise(s, { exerciseName: "Leg press" });
    s = addSet(s, s.blocks[1]!.id, { weight: 150, reps: 8 });
    s = addExercise(s, { exerciseName: "Bench" });
    s = addSet(s, s.blocks[2]!.id, { weight: 100, reps: 5 });
    s = finishSession(s, 2000);

    const { history } = await getExerciseHistory({ name: "Bench" }, deps([s]));
    expect(history[0]!.sessionPosition).toBe(2);
  });

  it("excludes sessions the exercise wasn't performed in, without throwing on the position lookup", async () => {
    let s = createSession(1000);
    s = addExercise(s, { exerciseName: "Squat" });
    s = addSet(s, s.blocks[0]!.id, { weight: 120, reps: 5 });
    s = finishSession(s, 2000);

    const { history } = await getExerciseHistory({ name: "Bench" }, deps([s]));
    expect(history).toHaveLength(0);
  });
});
