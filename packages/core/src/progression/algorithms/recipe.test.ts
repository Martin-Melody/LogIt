import { describe, expect, it } from "vitest";
import { recipeAlgorithm } from "./recipe";
import { createProgressionRecipe, type ProgressionRecipe } from "../../domain/progressionRecipe";
import { withRecipes } from "../withRecipes";
import { createLocalAlgorithmRegistry } from "../localAlgorithmRegistry";
import type { ExerciseHistoryEntry, ProgressionInput } from "../../domain/progression";

const DAY = 86_400_000;
const NOW = Date.now();
let id = 0;
function entry(daysAgo: number, pairs: [number, number][], sessionId = `s${++id}`): ExerciseHistoryEntry {
  return {
    sessionId,
    performedAtMs: NOW - daysAgo * DAY,
    sets: pairs.map(([weight, reps], i) => ({ id: `x${++id}`, setType: "normal", weight, reps, orderIndex: i })),
  };
}
const BENCH = { name: "Bench press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"] } as ProgressionInput["exercise"];
const SQUAT = { name: "Squat", primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings"] } as ProgressionInput["exercise"];
const input = (o: Partial<ProgressionInput>): ProgressionInput => ({ exercise: BENCH, history: [], state: null, userPreferences: null, ...o });
const recipe = (o: Partial<ProgressionRecipe>) => ({ ...createProgressionRecipe("Mine"), ...o });

describe("algorithms built from blocks", () => {
  const history = [entry(3, [[95, 7], [95, 6], [95, 5]])];

  it("plans from the strength estimate, with a top set and back-offs", async () => {
    const out = await recipeAlgorithm(recipe({ setLayout: "topBackoff" })).suggest(input({ history }));
    expect(out.sets.map((s) => [s.weight, s.reps])).toEqual([[95, 7], [85, 8], [85, 8]]);
    expect(out.reasoning?.summary?.join(" ")).toMatch(/One top set at 95 kg/);
  });

  it("same reps, a little lighter each set", async () => {
    const out = await recipeAlgorithm(recipe({ setLayout: "dropWeight" })).suggest(input({ history }));
    expect(out.sets.map((s) => [s.weight, s.reps])).toEqual([[95, 7], [92.5, 7], [90, 7]]);
  });

  it("from last session holds instead of deloading when asked", async () => {
    const r = recipe({ weightFrom: "last", whenStalled: "hold", repRange: [5, 8] });
    const missed = [entry(1, [[100, 4], [100, 4], [100, 4]], "m2"), entry(4, [[100, 4], [100, 4], [100, 4]], "m1")];
    const first = await recipeAlgorithm(r).suggest(input({ history: missed.slice(1) }));
    const second = await recipeAlgorithm(r).suggest(input({ history: missed, state: first.nextState }));
    expect(second.sets[0]!.weight).toBe(100);
    expect(second.change?.kind).not.toBe("deload");
  });

  it("runs a four-week wave on a training max", async () => {
    const r = recipeAlgorithm(recipe({ weightFrom: "wave" }));
    const w1 = await r.suggest(input({ exercise: SQUAT, history: [entry(7, [[120, 5]], "a")] }));
    // e1RM 140 → training max 126 (90%, to 2.5) → 65/75/85%.
    expect(w1.sets.map((s) => s.weight)).toEqual([82.5, 95, 107.5]);
    expect(w1.sets[2]!.setType).toBe("amrap");
    const w2 = await r.suggest(input({ exercise: SQUAT, history: [entry(1, [[82.5, 5], [95, 5], [107.5, 8]], "b"), entry(7, [[120, 5]], "a")], state: w1.nextState }));
    expect(w2.change?.text).toBe("Week 2: 3s");
  });

  it("adds a set when the muscle is behind on its weekly target", async () => {
    const out = await recipeAlgorithm(recipe({ sets: { mode: "weekly", count: 3 } })).suggest(
      input({ history, muscleWeek: { muscle: "chest", done: 4, lo: 10, hi: 16 } }),
    );
    expect(out.sets).toHaveLength(4);
    expect(out.reasoning?.summary?.join(" ")).toMatch(/Chest is at 4 of 10–16 sets this week, so one more set/);
  });

  it("holds the weight in a calorie deficit", async () => {
    const up = [entry(3, [[95, 9], [95, 8], [95, 7]])];
    const r = recipe({ food: "diary" });
    const fed = await recipeAlgorithm(r).suggest(input({ history: up, food: { avgKcal: 3200, maintenanceKcal: 2900, daysLogged: 6 } }));
    const cut = await recipeAlgorithm(r).suggest(input({ history: up, food: { avgKcal: 2300, maintenanceKcal: 2900, daysLogged: 6 } }));
    expect(fed.sets[0]!.weight).toBeGreaterThan(95);
    expect(cut.sets.every((s) => s.weight <= 95)).toBe(true);
    expect(cut.change?.text).toBe("Holding");
  });

  it("shows up in the algorithm list next to the built-ins", async () => {
    const mine = recipe({ id: "rcpp_x", name: "My plan" });
    const registry = withRecipes(createLocalAlgorithmRegistry(), async () => [mine, { ...mine, id: "gone", deletedAtMs: 1 }]);
    const list = await registry.list();
    expect(list.map((a) => a.id)).toEqual(["logit-adaptive", "linear-progression", "recipe:rcpp_x"]);
    expect((await registry.get("recipe:rcpp_x"))?.name).toBe("My plan");
    expect(await registry.get("recipe:gone")).toBeNull();
  });
});
