import {
  createSession, addExercise, addSet, updateSet, removeSet, removeExercise,
  getSessionDurationMs, finishSession, getTopSetHighlight, getExercises,
  SET_TYPE_META, setTypeMeta, isContinuationSet, swapExercise,
  groupIntoSuperset, ungroupSuperset, addSupersetRound, supersetMembers,
  setSessionNote,
} from "@logit/core/domain/workout";
import type { StrengthBlockData } from "@logit/core/domain/workout";
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

  it("swapExercise changes the exercise but keeps the sets", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Flat Bench", exerciseId: "ex-flat" });
    const blockId = getExercises(s)[0].id;
    s = addSet(s, blockId, { reps: 8, weight: 60 });
    s = addSet(s, blockId, { reps: 8, weight: 60 });

    s = swapExercise(s, blockId, { exerciseName: " Incline Bench ", exerciseId: "ex-incline" });

    const ex = getExercises(s)[0];
    expect(ex.id).toBe(blockId); // same block
    expect(ex.exerciseName).toBe("Incline Bench");
    expect(ex.exerciseId).toBe("ex-incline");
    expect(ex.sets.map((x) => [x.reps, x.weight])).toEqual([[8, 60], [8, 60]]);
  });

  it("setSessionNote trims and clears", () => {
    let s = createSession(1_000);
    s = setSessionNote(s, "  felt strong  ");
    expect(s.note).toBe("felt strong");
    s = setSessionNote(s, "   ");
    expect(s.note).toBeNull();
  });

  it("swapExercise is a no-op for an unknown block", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const before = JSON.stringify(s);
    s = swapExercise(s, "nope", { exerciseName: "Squat" });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("supersets", () => {
  function seedThree() {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "A" });
    s = addExercise(s, { exerciseName: "B" });
    s = addExercise(s, { exerciseName: "C" });
    return { s, ids: getExercises(s).map((e) => e.id) };
  }

  it("groups two blocks under a shared id and makes them contiguous", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[2]]); // group A and C (non-adjacent)

    const members = supersetMembers(s, superId(s, ids[0]));
    expect(members.map((m) => (m.data as StrengthBlockData).exerciseName)).toEqual(["A", "C"]);
    // A, C now sit together; B is pushed out.
    const order = getExercises(s).map((e) => e.exerciseName);
    expect(order).toEqual(["A", "C", "B"]);
  });

  it("needs at least two blocks", () => {
    let { s, ids } = seedThree();
    const before = JSON.stringify(s);
    s = groupIntoSuperset(s, [ids[0]]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("addSupersetRound appends one set to every strength member", () => {
    let { s, ids } = seedThree();
    s = addSet(s, ids[0], { reps: 8, weight: 50 });
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    const supersetId = superId(s, ids[0]);

    s = addSupersetRound(s, supersetId);

    const [a, b] = getExercises(s);
    expect(a.sets).toHaveLength(2);
    expect(a.sets[1].weight).toBe(50); // carried from the previous set
    expect(b.sets).toHaveLength(1);
  });

  it("ungroupSuperset clears the tag", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    const supersetId = superId(s, ids[0]);
    s = ungroupSuperset(s, supersetId);
    expect(supersetMembers(s, supersetId)).toHaveLength(0);
  });

  it("removing a member down to one dissolves the superset", () => {
    let { s, ids } = seedThree();
    s = groupIntoSuperset(s, [ids[0], ids[1]]);
    const supersetId = superId(s, ids[0]);
    s = removeExercise(s, ids[1]);
    expect(supersetMembers(s, supersetId)).toHaveLength(0);
  });

  function superId(s: ReturnType<typeof createSession>, blockId: string): string {
    const block = s.blocks.find((b) => b.id === blockId)!;
    return (block.data as StrengthBlockData).superset!.id;
  }
});

describe("set types", () => {
  it("every meta entry has a label and hint", () => {
    for (const m of SET_TYPE_META) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.hint.length).toBeGreaterThan(0);
    }
  });

  it("setTypeMeta falls back to normal for an unknown type", () => {
    expect(setTypeMeta("does-not-exist").type).toBe("normal");
  });

  it("drop / rest-pause / myo-reps are continuation sets, others are not", () => {
    expect(isContinuationSet("dropset")).toBe(true);
    expect(isContinuationSet("rest-pause")).toBe(true);
    expect(isContinuationSet("myo-reps")).toBe(true);
    expect(isContinuationSet("normal")).toBe(false);
    expect(isContinuationSet("warmup")).toBe(false);
    expect(isContinuationSet("amrap")).toBe(false);
  });

  it("normal has no badge glyph; the rest do", () => {
    expect(setTypeMeta("normal").short).toBe("");
    expect(setTypeMeta("warmup").short).toBe("W");
    expect(setTypeMeta("rest-pause").short).toBe("RP");
  });

  it("updateSet can record and clear an RPE", () => {
    let s = createSession(1_000);
    s = addExercise(s, { exerciseName: "Bench" });
    const exId = getExercises(s)[0].id;
    s = addSet(s, exId, { weight: 100, reps: 5 });
    const setId = getExercises(s)[0].sets[0].id;

    s = updateSet(s, exId, setId, { rpe: 8.5 });
    expect(getExercises(s)[0].sets[0].rpe).toBe(8.5);

    s = updateSet(s, exId, setId, { rpe: null });
    expect(getExercises(s)[0].sets[0].rpe).toBeNull();
  });
});
