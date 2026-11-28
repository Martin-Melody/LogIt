import { describe, expect, it } from "vitest";
import { parseBlockDeclaration, newPluginBlockData, pluginBlockType } from "./blockPlugin";
import { loggedExercises } from "./loggedSets";
import { getExerciseHistory } from "../usecases/progression/getExerciseHistory";
import type { WorkoutSession } from "./workout";

// A "Weight finder" block (canvas SP6/SP9): jumps of kg × reps with "how many more could you have
// done", counting as sets of the lift picked for the block.
const finder = parseBlockDeclaration({
  id: "weight-finder",
  name: "Weight finder",
  entry: { one: "jump", many: "jumps" },
  blockFields: [{ key: "lift", type: "exercise", label: "Lift" }],
  fields: [
    { key: "kg", type: "weight", label: "kg" },
    { key: "reps", type: "number", label: "Reps" },
    { key: "left", type: "choice", label: "Left in you", options: ["0", "1", "2", "3", "4+"] },
  ],
  countsAs: { sets: { exercise: "lift", weight: "kg", reps: "reps", rir: "left" } },
});

function session(id: string, at: number, blocks: WorkoutSession["blocks"]): WorkoutSession {
  return { id, startedAtMs: at, endedAtMs: at + 3600_000, blocks } as WorkoutSession;
}

describe("sets from a plugin block", () => {
  it("reads the mapping and keeps it with the data", () => {
    expect(finder.countsAs?.sets).toEqual({ exercise: "lift", weight: "kg", reps: "reps", rir: "left" });
    expect(newPluginBlockData(finder).sets?.exercise).toBe("lift");
  });

  it("rejects a mapping that names the wrong kind of field", () => {
    expect(() => parseBlockDeclaration({ ...JSON.parse(JSON.stringify({ id: "x", name: "X", entry: { one: "a", many: "b" }, fields: [{ key: "kg", type: "weight", label: "kg" }] })), countsAs: { sets: { exercise: "kg" } } })).toThrow(/exercise/);
  });

  it("turns entries into sets of the exercise, effort from reps in reserve", () => {
    const data = { ...newPluginBlockData(finder), blockFields: { lift: "Back squat" }, entries: [
      { id: "e1", done: true, values: { kg: 60, reps: 6, left: "4+" } },
      { id: "e2", done: true, values: { kg: 100, reps: 6, left: "1" } },
      { id: "e3", done: false, values: { kg: null, reps: null, left: null } },
    ] };
    const s = session("s1", 1000, [{ id: "b1", type: pluginBlockType("weight-finder"), orderIndex: 0, data }]);
    const logged = loggedExercises(s);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ exerciseName: "Back squat", from: "Weight finder" });
    expect(logged[0]!.sets.map((x) => [x.weight, x.reps, x.rpe])).toEqual([[60, 6, 6], [100, 6, 9]]);
  });

  it("counts in the exercise's history, with where it came from", async () => {
    const data = { ...newPluginBlockData(finder), blockFields: { lift: "Back squat" }, entries: [{ id: "e1", done: true, values: { kg: 100, reps: 6, left: "2" } }] };
    const sessions = [session("s1", 1000, [{ id: "b1", type: pluginBlockType("weight-finder"), orderIndex: 0, data }])];
    const deps = { workoutRepo: { listAllSessions: async () => sessions }, exerciseRepo: { getById: async () => null, getByName: async () => null } } as never;
    const { history } = await getExerciseHistory({ name: "back squat" }, deps);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ from: "Weight finder" });
    expect(history[0]!.sets[0]).toMatchObject({ weight: 100, reps: 6, rpe: 8 });
  });
});
