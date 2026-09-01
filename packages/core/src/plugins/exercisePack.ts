import type { MuscleGroup, ExerciseType } from "../domain/exercise";

/**
 * Exercise pack — a content plugin. Pure data: a list of exercise definitions a
 * user can install into their catalog. No executable code, so it installs
 * regardless of Restricted Mode.
 *
 * The pack file is fetched from the manifest's artifact URL, hash-verified
 * against `manifest.integrity` when present, then parsed here.
 */

export const EXERCISE_PACK_FORMAT_VERSION = 1 as const;

/** Hard cap so a hostile or broken pack can't blow up the catalog. */
export const MAX_PACK_EXERCISES = 500;

const MUSCLE_GROUPS: ReadonlySet<string> = new Set<MuscleGroup>([
  "chest", "back", "shoulders", "biceps", "triceps", "quads",
  "hamstrings", "glutes", "calves", "core", "forearms",
]);

const EXERCISE_TYPES: ReadonlySet<string> = new Set<ExerciseType>([
  "normal", "assisted", "bodyweight",
]);

export type ExercisePackExercise = {
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  exerciseType: ExerciseType;
  notes: string | null;
};

export type ExercisePack = {
  formatVersion: typeof EXERCISE_PACK_FORMAT_VERSION;
  pluginId: string;
  exercises: ExercisePackExercise[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function coerceMuscles(raw: unknown, field: string, exerciseName: string): MuscleGroup[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`Exercise "${exerciseName}": ${field} must be an array.`);
  }
  const out: MuscleGroup[] = [];
  for (const m of raw) {
    if (typeof m !== "string" || !MUSCLE_GROUPS.has(m)) {
      throw new Error(`Exercise "${exerciseName}": unknown muscle group "${String(m)}".`);
    }
    if (!out.includes(m as MuscleGroup)) out.push(m as MuscleGroup);
  }
  return out;
}

/**
 * Parse and validate a raw exercise-pack payload. Throws a human-readable error
 * on any structural problem. `expectedPluginId`, when given, must match the
 * pack's declared `pluginId` (guards against a manifest pointing at the wrong
 * data file).
 */
export function parseExercisePack(raw: unknown, expectedPluginId?: string): ExercisePack {
  if (!isObject(raw)) {
    throw new Error("Exercise pack must be a JSON object.");
  }
  if (raw.formatVersion !== EXERCISE_PACK_FORMAT_VERSION) {
    throw new Error(
      `Unsupported exercise pack format (expected ${EXERCISE_PACK_FORMAT_VERSION}).`,
    );
  }
  if (!isNonEmptyString(raw.pluginId)) {
    throw new Error("Exercise pack is missing a pluginId.");
  }
  if (expectedPluginId && raw.pluginId !== expectedPluginId) {
    throw new Error(
      `Exercise pack pluginId "${raw.pluginId}" does not match manifest "${expectedPluginId}".`,
    );
  }
  if (!Array.isArray(raw.exercises) || raw.exercises.length === 0) {
    throw new Error("Exercise pack has no exercises.");
  }
  if (raw.exercises.length > MAX_PACK_EXERCISES) {
    throw new Error(`Exercise pack exceeds the ${MAX_PACK_EXERCISES}-exercise limit.`);
  }

  const seen = new Set<string>();
  const exercises: ExercisePackExercise[] = [];

  for (const entry of raw.exercises) {
    if (!isObject(entry) || !isNonEmptyString(entry.name)) {
      throw new Error("Every exercise needs a non-empty name.");
    }
    const name = entry.name.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // silently drop in-pack duplicates
    seen.add(key);

    const exerciseType =
      entry.exerciseType === undefined
        ? "normal"
        : typeof entry.exerciseType === "string" && EXERCISE_TYPES.has(entry.exerciseType)
          ? (entry.exerciseType as ExerciseType)
          : (() => {
              throw new Error(`Exercise "${name}": invalid exerciseType.`);
            })();

    exercises.push({
      name,
      primaryMuscles: coerceMuscles(entry.primaryMuscles, "primaryMuscles", name),
      secondaryMuscles: coerceMuscles(entry.secondaryMuscles, "secondaryMuscles", name),
      exerciseType,
      notes: isNonEmptyString(entry.notes) ? entry.notes.trim() : null,
    });
  }

  if (exercises.length === 0) {
    throw new Error("Exercise pack has no usable exercises.");
  }

  return {
    formatVersion: EXERCISE_PACK_FORMAT_VERSION,
    pluginId: raw.pluginId,
    exercises,
  };
}

/** Stable, collision-resistant id for a pack-provided exercise. */
export function packExerciseId(pluginId: string, exerciseName: string): string {
  const slug = exerciseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `pack:${pluginId}:${slug}`;
}

/** Build an exercise-pack payload from a set of exercises (used by "export as pack"). */
export function buildExercisePack(
  pluginId: string,
  exercises: ExercisePackExercise[],
): ExercisePack {
  return parseExercisePack(
    { formatVersion: EXERCISE_PACK_FORMAT_VERSION, pluginId, exercises },
    pluginId,
  );
}
