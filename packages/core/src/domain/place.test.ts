import { describe, expect, it } from "vitest";
import {
  effectiveMachine, activePlaces, atTheTop, defaultPlaceFor, dumbbellWeightsKg, machinesFor, newPlace,
  barbellFor, mergeExerciseMachines, placeFromExerciseMachines, specialtyBarFor, usesMachine, runsFromStack, stackFromRuns, stackWeights, type Place,
} from "./place";

describe("weight stacks in runs (X7)", () => {
  it("5 kg jumps for the first plates, then 10 kg (Martin's example)", () => {
    expect(stackFromRuns(5, [{ step: 5, to: 25 }, { step: 10, to: 95 }])).toEqual([5, 10, 15, 20, 25, 35, 45, 55, 65, 75, 85, 95]);
  });

  it("a plain linear stack is one run", () => {
    const lb = stackFromRuns(15, [{ step: 15, to: 240 }]);
    expect(lb).toHaveLength(16);
    expect(lb.at(-1)).toBe(240);
  });

  it("ignores runs that go nowhere and never runs away", () => {
    expect(stackFromRuns(10, [{ step: 0, to: 50 }, { step: 5, to: 5 }])).toEqual([10]);
    expect(stackFromRuns(0, [{ step: 0.5, to: 1000 }], 50)).toHaveLength(50);
  });

  it("reads runs back from the settings, for editing", () => {
    expect(runsFromStack([5, 10, 15, 20, 25, 35, 45, 55])).toEqual({
      start: 5, runs: [{ step: 5, to: 25 }, { step: 10, to: 55 }],
    });
    expect(runsFromStack([])).toBeNull();
  });

  it("add-ons fill in between the plates", () => {
    expect((stackWeights(10, [{ step: 10, to: 30 }], [2.5]) as { values: number[] }).values).toEqual([10, 12.5, 20, 22.5, 30, 32.5]);
  });
});

describe("dumbbells", () => {
  it("adjustable range and fixed pairs", () => {
    expect(dumbbellWeightsKg({ kind: "adjustable", minKg: 2.5, stepKg: 2.5, maxKg: 10 })).toEqual([2.5, 5, 7.5, 10]);
    expect(dumbbellWeightsKg({ kind: "pairs", kg: [12, 8, 16, 8] })).toEqual([8, 12, 16]);
    expect(dumbbellWeightsKg(undefined)).toEqual([]);
  });
});

describe("templates (G10)", () => {
  it("home rack has a bar, dumbbells and a rack; bodyweight has none of them", () => {
    const rack = newPlace("Home", "home", "home-rack", 1);
    expect(rack.barbell?.barKg).toBe(20);
    expect(rack.kit).toContain("squat-rack");
    const bw = newPlace("Home", "home", "bodyweight", 1);
    expect(bw.barbell).toBeUndefined();
    expect(bw.dumbbells).toBeUndefined();
  });
});

describe("moving today's machines into a place", () => {
  it("one place, each machine serving its exercise; identical machines merge", () => {
    const cable = { id: "m1", name: "Cable station", incrementKg: 2.5, weights: { kind: "linear" as const, min: 2.5, step: 2.5, max: 50 } };
    const place = placeFromExerciseMachines([
      { id: "fly", machines: [cable] },
      { id: "pushdown", machines: [{ ...cable, id: "m2", name: "cable station" }] },
      { id: "press", machines: [{ id: "m3", name: "Chest press", incrementKg: 5 }] },
      { id: "squat", machines: [] },
    ], 1)!;
    expect(place.name).toBe("My gym");
    expect(place.machines).toHaveLength(2);
    expect(place.machines[0]!.exerciseIds).toEqual(["fly", "pushdown"]);
    expect(place.machines[1]!.exerciseIds).toEqual(["press"]);
  });

  it("nobody with machines gets no place", () => {
    expect(placeFromExerciseMachines([{ id: "squat" }], 1)).toBeNull();
  });

  it("with places already, new exercise machines join the first one, keeping their ids and the usual pick", () => {
    const gym: Place = { ...newPlace("Northside", "gym", "gym", 1), machines: [
      { id: "m1", name: "Cable station", incrementKg: 2.5, loading: "stack", status: "in", exerciseIds: ["fly"] },
    ] };
    const merged = mergeExerciseMachines([gym], [
      { id: "fly", machines: [{ id: "m1", name: "Cable station", incrementKg: 2.5 }] },
      { id: "row", machines: [{ id: "m7", name: "Seated row", incrementKg: 5 }, { id: "m8", name: "Low cable", incrementKg: 2.5 }], defaultMachineId: "m8" },
    ], 9)!;
    expect(merged.id).toBe(gym.id);
    expect(merged.machines.map((m) => m.id)).toEqual(["m1", "m7", "m8"]);
    expect(merged.choices).toEqual({ row: "m8" });
    expect(merged.updatedAtMs).toBe(9);
    expect(gym.machines).toHaveLength(1);
  });

  it("nothing new to move: no change", () => {
    const gym: Place = { ...newPlace("Northside", "gym", "gym", 1), machines: [
      { id: "m1", name: "Cable station", incrementKg: 2.5, loading: "stack", status: "in", exerciseIds: ["fly"] },
    ] };
    expect(mergeExerciseMachines([gym], [{ id: "fly", machines: [{ id: "m1", name: "Cable station", incrementKg: 2.5 }] }])).toBeNull();
  });

  it("only archived places: a new My gym", () => {
    const old: Place = { ...newPlace("Old gym", "gym", "gym", 0), archivedAtMs: 5 };
    const merged = mergeExerciseMachines([old], [{ id: "press", machines: [{ id: "m3", name: "Chest press", incrementKg: 5 }] }], 9)!;
    expect(merged.name).toBe("My gym");
    expect(merged.id).not.toBe(old.id);
  });
});

describe("which place a workout starts at", () => {
  const gym: Place = { ...newPlace("Northside", "gym", "gym", 1), usualDays: [1, 4] };
  const home: Place = { ...newPlace("Home", "home", "dumbbells", 2), usualDays: [6] };
  const old: Place = { ...newPlace("Old gym", "gym", "gym", 0), archivedAtMs: 5 };

  it("the usual place for the weekday, else the last used, never an archived one", () => {
    expect(defaultPlaceFor([gym, home, old], 1, home.id)?.id).toBe(gym.id);
    expect(defaultPlaceFor([gym, home, old], 6, gym.id)?.id).toBe(home.id);
    expect(defaultPlaceFor([gym, home, old], 3, home.id)?.id).toBe(home.id);
    expect(defaultPlaceFor([gym, home, old], 3, old.id)?.id).toBe(gym.id);
    expect(activePlaces([gym, home, old]).map((p) => p.name)).toEqual(["Northside", "Home"]);
  });

  it("no places: no default, and no machines", () => {
    expect(defaultPlaceFor([], 1, null)).toBeNull();
    expect(machinesFor(null, "x")).toEqual([]);
  });

  it("removed and coming machines aren't offered", () => {
    const p: Place = {
      ...gym,
      machines: [
        { id: "a", name: "Pulldown", incrementKg: 5, loading: "stack", status: "in", exerciseIds: ["lat"] },
        { id: "b", name: "Old pulldown", incrementKg: 5, loading: "stack", status: "removed", exerciseIds: ["lat"] },
        { id: "c", name: "New pulldown", incrementKg: 5, loading: "stack", status: "coming", exerciseIds: ["lat"] },
        { id: "d", name: "Broken row", incrementKg: 5, loading: "stack", status: "out", exerciseIds: ["lat"] },
      ],
    };
    expect(machinesFor(p, "lat").map((m) => m.id)).toEqual(["a", "d"]);
  });
});

describe("at the heaviest weight a place has", () => {
  it("asks once, then adds load the person has or suggests a harder variation", () => {
    expect(atTheTop(undefined)).toBe("ask");
    expect(atTheTop(["addons"])).toBe("add-load");
    expect(atTheTop([])).toBe("harder");
  });
});

describe("add-ons", () => {
  it("fill in between every setting, without changing what's stored", () => {
    const m = { id: "a", name: "Pulldown", incrementKg: 5, loading: "stack" as const, status: "in" as const, exerciseIds: [],
      weights: { kind: "stack" as const, values: [10, 20, 30] }, addOns: [2.5] };
    expect((effectiveMachine(m).weights as { values: number[] }).values).toEqual([10, 12.5, 20, 22.5, 30, 32.5]);
    expect(m.weights.values).toEqual([10, 20, 30]);
  });
});

describe("machines are what decide the number", () => {
  it("machine, cable and Smith exercises use machines; free weights never do", () => {
    expect(["machine", "cable", "smith", "other", undefined].map((e) => usesMachine(e as never))).toEqual([true, true, true, true, true]);
    expect(["barbell", "dumbbell", "kettlebell", "bodyweight", "band"].map((e) => usesMachine(e as never))).toEqual([false, false, false, false, false]);
  });

  it("a specialty bar's own weight, when the place has one", () => {
    expect(specialtyBarFor("EZ-Bar Curl")).toBe("ez-bar");
    expect(specialtyBarFor("Trap Bar Deadlift")).toBe("trap-bar");
    expect(specialtyBarFor("Hex bar deadlift")).toBe("trap-bar");
    expect(specialtyBarFor("Bench Press")).toBeNull();
    const gym: Place = { ...newPlace("Northside", "gym", "gym", 1) };
    expect(barbellFor(gym, "EZ-Bar Curl")?.barKg).toBe(20);
    const withEz: Place = { ...gym, kit: [...gym.kit, "ez-bar"], barWeightsKg: { "ez-bar": 7.5 } };
    expect(barbellFor(withEz, "EZ-Bar Curl")?.barKg).toBe(7.5);
    expect(barbellFor(withEz, "Bench Press")?.barKg).toBe(20);
    expect(barbellFor({ ...gym, kit: [...gym.kit, "trap-bar"] }, "Trap Bar Deadlift")?.barKg).toBe(25);
    expect(barbellFor({ ...gym, barbell: undefined }, "Bench Press")).toBeUndefined();
  });
});
