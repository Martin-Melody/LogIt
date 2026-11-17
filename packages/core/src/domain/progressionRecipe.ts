import { createId } from "./ids";
import { nowMs } from "./time";

/**
 * A progression algorithm built from blocks, without code (Settings › Progression › Build).
 * Saved as data and run by the built-in recipe engine (progression/algorithms/recipe.ts), so it
 * syncs and could be shared like an exercise pack. Its algorithm id is `recipe:<id>`.
 */
export type ProgressionRecipe = {
  id: string;
  name: string;
  /**
   * How the weight is picked:
   * - "estimate": every set from the strength estimate (as LogIt Adaptive)
   * - "last": from last session's sets: fill the rep range, then add a step (as Linear)
   * - "wave": a four-week wave on a training max (5s, 3s, 5/3/1, light week)
   */
  weightFrom: "estimate" | "last" | "wave";
  /** Rep range; missing = big lifts 5–8, single-muscle lifts 8–12. Not used by "wave". */
  repRange?: [number, number];
  /** Reps left in the tank ("estimate" only). */
  repsInReserve: number;
  /** "estimate" only: every set at the same weight, a top set then lighter back-offs, or the
   * same reps with the weight coming down a little each set. */
  setLayout: "straight" | "topBackoff" | "dropWeight";
  /** Smallest weight step in kg; an exercise's machine still wins. */
  increment: number;
  /** "last": two sessions under the range means 10% off, or just hold the weight.
   *  "wave": missing the last set's reps resets the training max 10% lower, or holds it. */
  whenStalled: "deload" | "hold";
  /** Fixed working sets, or adjusted to the muscle's weekly target (+1 when it's behind,
   * −1 when it's over). */
  sets: { mode: "fixed" | "weekly"; count: number };
  /** Hold the weight in a calorie deficit (needs a food diary). */
  food: "ignore" | "diary";
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
};

export const RECIPE_ID_PREFIX = "recipe:";

export function recipeAlgorithmId(recipeId: string): string {
  return `${RECIPE_ID_PREFIX}${recipeId}`;
}

export function isRecipeAlgorithmId(id: string): boolean {
  return id.startsWith(RECIPE_ID_PREFIX);
}

export function createProgressionRecipe(name = "My algorithm"): ProgressionRecipe {
  const now = nowMs();
  return {
    id: createId("rcpp"),
    name,
    weightFrom: "estimate",
    repsInReserve: 0,
    setLayout: "straight",
    increment: 2.5,
    whenStalled: "deload",
    sets: { mode: "fixed", count: 3 },
    food: "ignore",
    createdAtMs: now,
    updatedAtMs: now,
  };
}

/** Fills in anything missing or out of range in a saved or pulled recipe. */
export function normalizeRecipe(r: Partial<ProgressionRecipe> & { id: string }): ProgressionRecipe {
  const base = createProgressionRecipe(r.name?.trim() || "My algorithm");
  const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  const n = (v: unknown, d: number, lo: number, hi: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d;
  };
  const range =
    Array.isArray(r.repRange) && r.repRange.length === 2
      ? ([n(r.repRange[0], 5, 1, 50), Math.max(n(r.repRange[0], 5, 1, 50), n(r.repRange[1], 8, 1, 50))] as [number, number])
      : undefined;
  return {
    ...base,
    id: r.id,
    name: r.name?.trim() || base.name,
    weightFrom: pick(r.weightFrom, ["estimate", "last", "wave"] as const, base.weightFrom),
    ...(range ? { repRange: range } : {}),
    repsInReserve: Math.round(n(r.repsInReserve, 0, 0, 5)),
    setLayout: pick(r.setLayout, ["straight", "topBackoff", "dropWeight"] as const, base.setLayout),
    increment: n(r.increment, 2.5, 0.25, 20),
    whenStalled: pick(r.whenStalled, ["deload", "hold"] as const, base.whenStalled),
    sets: {
      mode: pick(r.sets?.mode, ["fixed", "weekly"] as const, "fixed"),
      count: Math.round(n(r.sets?.count, 3, 1, 10)),
    },
    food: pick(r.food, ["ignore", "diary"] as const, "ignore"),
    createdAtMs: r.createdAtMs ?? base.createdAtMs,
    updatedAtMs: r.updatedAtMs ?? base.updatedAtMs,
    ...(r.deletedAtMs ? { deletedAtMs: r.deletedAtMs } : {}),
  };
}

/** One line describing a recipe, for lists: "Strength estimate · 5–8 · close to failure". */
export function describeRecipe(r: ProgressionRecipe): string {
  const parts: string[] = [];
  parts.push(r.weightFrom === "estimate" ? "Strength estimate" : r.weightFrom === "last" ? "From last session" : "Weekly wave");
  if (r.weightFrom !== "wave") parts.push(r.repRange ? `${r.repRange[0]}–${r.repRange[1]} reps` : "default reps");
  if (r.weightFrom === "estimate") parts.push(r.repsInReserve === 0 ? "close to failure" : `${r.repsInReserve} in the tank`);
  parts.push(r.sets.mode === "weekly" ? "sets from weekly targets" : `${r.sets.count} sets`);
  if (r.food === "diary") parts.push("holds in a deficit");
  return parts.join(" · ");
}
