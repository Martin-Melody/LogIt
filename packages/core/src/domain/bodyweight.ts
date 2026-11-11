import { usesBodyweightLoad, type ExerciseType } from "./exercise";
import { localDateIso } from "./nutrition";

/**
 * What a logged set weight means for the load actually moved:
 *  - `external`   — the weight itself (barbell, dumbbell, machine stack).
 *  - `bodyweight` — relative to bodyweight: 0 = BW, −25 = BW minus 25 kg of
 *                   assistance, +10 = BW plus 10 kg on a belt.
 *  - `assisted`   — the "assisted" exercise type: the number is the assistance
 *                   itself, so the load is BW minus it.
 */
export type LoadMode = "external" | "bodyweight" | "assisted";

// Movements where the lifter moves their own body. Only used for exercises with
// no type set (the bundled Pull-Up and Dips have none), and never for names that
// say a machine or band is doing part of the work.
const BODYWEIGHT_NAME =
  /\b(pull[- ]?ups?|chin[- ]?ups?|dips?|push[- ]?ups?|press[- ]?ups?|muscle[- ]?ups?|inverted rows?|pistol squats?|nordic (?:hamstring )?curls?)\b/i;
const NOT_BODYWEIGHT_NAME = /\b(assisted|machine|band(?:ed)?)\b/i;

export function looksLikeBodyweightExercise(name: string): boolean {
  return BODYWEIGHT_NAME.test(name) && !NOT_BODYWEIGHT_NAME.test(name);
}

export function getLoadMode(
  exerciseType: ExerciseType | undefined,
  weights: Iterable<number> = [],
  name?: string,
): LoadMode {
  if (exerciseType === "assisted") return "assisted";
  if (usesBodyweightLoad(exerciseType, weights)) return "bodyweight";
  if (name && looksLikeBodyweightExercise(name)) return "bodyweight";
  return "external";
}

/**
 * Kilograms moved per rep. Without a known bodyweight, a bodyweight-relative
 * set counts only the added weight and an assisted one counts nothing, so a
 * total never goes negative or counts the machine's help as lifted weight.
 */
export function effectiveLoadKg(
  weight: number,
  mode: LoadMode,
  bodyweightKg?: number | null,
): number {
  const bw = bodyweightKg != null && bodyweightKg > 0 ? bodyweightKg : null;
  switch (mode) {
    case "external":
      return Math.max(0, weight);
    case "bodyweight":
      return Math.max(0, bw != null ? bw + weight : weight);
    case "assisted":
      return bw != null ? Math.max(0, bw - weight) : 0;
  }
}

/** Bodyweight (kg) on a given moment, or null when nothing is known. */
export type BodyweightLookup = (atMs: number) => number | null;

export type BodyweightSample = { dateIso: string; weightKg: number; deletedAtMs?: number | null };

/**
 * Bodyweight on a given day from the weight log: the last weigh-in on or before
 * that day, else the first one after it (a session logged before the first
 * weigh-in). With no log at all, `fallbackKg` (the profile weight) for every day.
 */
export function makeBodyweightLookup(
  samples: BodyweightSample[],
  fallbackKg: number | null = null,
): BodyweightLookup {
  const live = samples
    .filter((s) => !s.deletedAtMs && s.weightKg > 0)
    .sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));
  const fallback = fallbackKg != null && fallbackKg > 0 ? fallbackKg : null;
  if (live.length === 0) return () => fallback;

  return (atMs) => {
    const day = localDateIso(new Date(atMs));
    let found = live[0]!;
    for (const s of live) {
      if (s.dateIso > day) break;
      found = s;
    }
    return found.weightKg;
  };
}
