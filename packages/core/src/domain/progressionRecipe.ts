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

// ── Sharing ───────────────────────────────────────────────────────────────────

/** What's shared: the blocks and the name, nothing about the sharer's lifts. */
export type SharedRecipe = Omit<ProgressionRecipe, "id" | "createdAtMs" | "updatedAtMs" | "deletedAtMs">;

export function toSharedRecipe(r: ProgressionRecipe): SharedRecipe {
  const { id: _id, createdAtMs: _c, updatedAtMs: _u, deletedAtMs: _d, ...blocks } = normalizeRecipe(r);
  void _id;
  void _c;
  void _u;
  void _d;
  return blocks;
}

/** A shared recipe as a new one of your own (new id), named `name` when given. */
export function recipeFromShared(shared: Partial<SharedRecipe>, name?: string): ProgressionRecipe {
  const fresh = createProgressionRecipe();
  return normalizeRecipe({ ...shared, id: fresh.id, name: name ?? shared.name, createdAtMs: fresh.createdAtMs, updatedAtMs: fresh.updatedAtMs });
}

/** A name that doesn't clash with one you already have: "Top sets", "Top sets (2)", … */
export function uniqueRecipeName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!lower.has(name.trim().toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

const CODE_PREFIX = "logit-alg1:";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** A recipe as a code to paste anywhere: "logit-alg1:" + base64url JSON of its blocks. */
export function recipeShareCode(r: ProgressionRecipe): string {
  return CODE_PREFIX + toBase64Url(JSON.stringify(toSharedRecipe(r)));
}

/** The message sent with a code, so whoever gets it knows what to do with it. */
export function recipeShareMessage(r: ProgressionRecipe): string {
  return `"${r.name}", a LogIt progression algorithm. To add it: Settings › Progression › Add from a code, and paste this:\n${recipeShareCode(r)}`;
}

/**
 * The shared recipe in a code, or in a whole pasted message containing one. Null when there's
 * no valid code in the text.
 */
export function parseRecipeShareCode(text: string): SharedRecipe | null {
  const match = text.match(/logit-alg1:([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const raw = JSON.parse(fromBase64Url(match[1]!)) as Partial<SharedRecipe>;
    if (!raw || typeof raw !== "object" || typeof raw.weightFrom !== "string") return null;
    return toSharedRecipe(normalizeRecipe({ ...raw, id: "shared" }));
  } catch {
    return null;
  }
}

/** The blocks as label/value lines, for showing a shared or pasted algorithm. */
export function recipeBlockLines(r: SharedRecipe): [string, string][] {
  const lines: [string, string][] = [
    ["Weight from", r.weightFrom === "estimate" ? "Strength estimate" : r.weightFrom === "last" ? "Last session's sets" : "Weekly wave (5/3/1)"],
  ];
  if (r.weightFrom !== "wave") lines.push(["Rep range", r.repRange ? `${r.repRange[0]}–${r.repRange[1]}` : "Default (5–8 big lifts, 8–12 others)"]);
  if (r.weightFrom === "estimate") {
    lines.push(["How hard", r.repsInReserve === 0 ? "Close to failure" : `${r.repsInReserve} left in the tank`]);
    lines.push(["Set layout", r.setLayout === "straight" ? "Same weight" : r.setLayout === "topBackoff" ? "Top set + back-offs" : "Same reps, drop weight"]);
  } else {
    lines.push(["When it stalls", r.whenStalled === "deload" ? "Deload 10%" : "Hold"]);
  }
  lines.push(["Sets", `${r.sets.count}${r.sets.mode === "weekly" ? ", adjusted to weekly targets" : ""}`]);
  if (r.food === "diary") lines.push(["Food", "Holds in a calorie deficit"]);
  return lines;
}
