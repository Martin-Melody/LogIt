import {
  createSession, addExercise, addSet, updateSet, removeSet, removeExercise,
  getSessionDurationMs, finishSession, getTopSetHighlight, getExercises,
} from "@logit/core/domain/workout";
import { describe, expect, it } from "vitest";

function seedSession() {
  let s = createSession(1_000);
  s = addExercise(s, { exerciseName: " Bench Press " });
  s = addExercise(s, { exerciseName: "Rows" });
  return s;
}

describe("workout domain", () => {
  it("addExercise trims name and assigns orderIndex", () => {
    const s0 = createSession(1_000);
    const s1 = addExercise(s0, { exerciseName: " Bench Press " });
    const exs1 = getExercises(s1);
    const exs0 = getExercises(s0);

    expect(exs1).toHaveLength(1);
    expect(exs1[0].exerciseName).toBe("Bench Press");
    expect(exs1[0].orderIndex).toBe(0);
    expect(exs0).toHaveLength(0);
  });

  it("addSet applies defaults and assigns orderIndex", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const exId = getExercises(s)[0].id;

    s = addSet(s, exId);
    s = addSet(s, exId, { reps: 5, weight: 100, setType: "normal" });

    const sets = getExercises(s)[0].sets;
    expect(sets).toHaveLength(2);

    expect(sets[0].setType).toBe("normal");
    expect(sets[0].reps).toBe(0);
    expect(sets[0].weight).toBe(0);
    expect(sets[0].orderIndex).toBe(0);

    expect(sets[1].reps).toBe(5);
    expect(sets[1].weight).toBe(100);
    expect(sets[1].orderIndex).toBe(1);
  });

  it("updateSet patches only the target set", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const exId = getExercises(s)[0].id;

    s = addSet(s, exId, { reps: 5, weight: 80 });
    s = addSet(s, exId, { reps: 8, weight: 60 });

    const [a, b] = getExercises(s)[0].sets;
    const s2 = updateSet(s, exId, a.id, { weight: 85 });

    expect(getExercises(s2)[0].sets[0].weight).toBe(85);
    expect(getExercises(s2)[0].sets[1].weight).toBe(b.weight);
  });

  it("removeSet reindexes orderIndex", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const exId = getExercises(s)[0].id;

    s = addSet(s, exId);
    s = addSet(s, exId);
    s = addSet(s, exId);

    const setIds = getExercises(s)[0].sets.map((x) => x.id);
    const s2 = removeSet(s, exId, setIds[1]);
    const exSets = getExercises(s2)[0].sets;

    expect(exSets).toHaveLength(2);
    expect(exSets[0].orderIndex).toBe(0);
    expect(exSets[1].orderIndex).toBe(1);
  });

  it("removeExercise reindexes orderIndex", () => {
    const s = seedSession();
    const ex0 = getExercises(s)[0].id;

    const s2 = removeExercise(s, ex0);
    const exs2 = getExercises(s2);
    expect(exs2).toHaveLength(1);
    expect(exs2[0].orderIndex).toBe(0);
  });

  it("finishSession + getSessionDurationMs", () => {
    const s = createSession(1_000);

    expect(getSessionDurationMs(s)).toBeNull();

    const s2 = finishSession(s, 1_800);
    expect(getSessionDurationMs(s2)).toBe(800);

    const s3 = finishSession(s, 900);
    expect(getSessionDurationMs(s3)).toBe(0);
  });

  it("getTopSetHighlight picks highest weight; tie-breaks by reps", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    s = addExercise(s, { exerciseName: "Rows" });

    const [benchId, rowsId] = getExercises(s).map((e) => e.id);

    s = addSet(s, benchId, { weight: 100, reps: 5 });
    s = addSet(s, rowsId, { weight: 100, reps: 8 });
    s = addSet(s, benchId, { weight: 105, reps: 3 });

    const top = getTopSetHighlight(s);
    expect(top).toEqual({ exerciseName: "Bench", weight: 105, reps: 3 });
  });

  it("getTopSetHighlight returns null if there are no sets", () => {
    const s = createSession(1_000);
    expect(getTopSetHighlight(s)).toBeNull();
  });
});
