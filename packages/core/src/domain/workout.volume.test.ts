import { describe, it, expect } from "vitest";
import { createSession, addExercise, addSet, getSessionVolumeKg, getExerciseVolumeKg, getExercises } from "./workout";

describe("session volume", () => {
  it("counts assisted (negative-weight) sets as zero instead of subtracting them", () => {
    let s = addExercise(createSession(), { exerciseName: "Dips" });
    const dips = s.blocks[0]!.id;
    s = addSet(s, dips, { reps: 5, weight: 2.5 });
    s = addSet(s, dips, { reps: 7, weight: 0 });
    s = addSet(s, dips, { reps: 5, weight: -22.5 });
    s = addSet(s, dips, { reps: 8, weight: -25 });
    s = addExercise(s, { exerciseName: "Pec Deck" });
    const pec = s.blocks[1]!.id;
    s = addSet(s, pec, { reps: 8, weight: 77 });

    expect(getExerciseVolumeKg(getExercises(s)[0]!)).toBe(12.5);
    expect(getSessionVolumeKg(s)).toBe(12.5 + 616);
  });
});
