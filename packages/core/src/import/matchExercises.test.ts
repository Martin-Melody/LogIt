import { describe, expect, it } from "vitest";
import { matchExercises } from "./matchExercises";

const LIB = [
  { id: "bench", name: "Bench Press" },
  { id: "db-bench", name: "Dumbbell Bench Press" },
  { id: "pullup", name: "Pull-Up" },
  { id: "squat", name: "Squat" },
  { id: "safety", name: "Safety Bar Squat" },
  { id: "cable-hammer", name: "Cable Hammer Curl" },
  { id: "belt", name: "Belt Squat" },
];

describe("matchExercises", () => {
  it("matches names that are the same once tidied, without asking", () => {
    const out = matchExercises(["bench press", "Bench Press (Barbell)", "Bench Press (Dumbbell)", "Pull Ups", "Squat (Barbell)"], LIB);
    expect(out.map((m) => (m.kind === "matched" ? m.exerciseId : null))).toEqual(["bench", "bench", "db-bench", "pullup", "squat"]);
  });

  it("writes out gym shorthand", () => {
    expect(matchExercises(["Incline DB Bench Press", "OHP"], [...LIB, { id: "ohp", name: "Overhead Press" }, { id: "incl", name: "Incline Dumbbell Bench Press" }]).map((m) => m.kind === "matched" && m.exerciseId)).toEqual(["incl", "ohp"]);
  });

  it("suggests the closest for the rest, and never auto-matches a guess", () => {
    const [ssb, hammer, belt, odd] = matchExercises(["SSB Squat (Mine)", "Hammer Curl (Cable)", "Belt Squat Machine", "Zercher Carry"], LIB);
    expect(ssb).toMatchObject({ kind: "matched", exerciseId: "safety" }); // SSB = safety bar

    expect(hammer).toMatchObject({ kind: "matched", exerciseId: "cable-hammer" });
    expect(belt).toMatchObject({ kind: "unknown", suggestion: { exerciseId: "belt" } });
    expect(odd).toEqual({ name: "Zercher Carry", kind: "unknown" });
  });
});
