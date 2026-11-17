import {
  MUSCLE_SETTINGS_PREFIX,
  PROGRESSION_OFF,
  exerciseKey,
  isDefaultExerciseSettings,
  type ExerciseProgressionSettings,
} from "../../domain/progression";
import { nowMs } from "../../domain/time";
import type { MuscleGroup } from "../../domain/exercise";
import type { ProgressionDeps } from "./deps";

type Exercise = { id?: string; name: string };
type Deps = Pick<ProgressionDeps, "progressionRepo"> & Partial<Pick<ProgressionDeps, "exerciseRepo">>;

/**
 * The lifter's settings for an exercise, or null. By id; then by name (rows saved before the
 * exercise had an id); then by the library exercise's id for that name (a block with only a
 * name, or an older id).
 */
export async function getExerciseProgressionSettings(exercise: Exercise, deps: Deps): Promise<ExerciseProgressionSettings | null> {
  const repo = deps.progressionRepo;
  if (!repo.getExerciseSettings) return null;
  const key = exerciseKey(exercise);
  let row = await repo.getExerciseSettings(key);
  const nameKey = exercise.name.toLowerCase().trim();
  if (!row && exercise.id && nameKey !== key) row = await repo.getExerciseSettings(nameKey);
  // A block with only a name, or with an older id for the same library exercise.
  if (!row && deps.exerciseRepo) {
    const found = await deps.exerciseRepo.getByName(exercise.name).catch(() => null);
    if (found?.id && found.id !== exercise.id) row = await repo.getExerciseSettings(found.id);
  }
  return row && !row.deletedAtMs ? row : null;
}

export type ExerciseSettingsPatch = Partial<Pick<ExerciseProgressionSettings, "algorithmId" | "repRange" | "behindPace" | "setTarget">>;

/**
 * Change an exercise's settings. A field set to undefined goes back to "same as every
 * other exercise"; once nothing is left the row becomes a tombstone so the reset syncs.
 * Returns the row as saved (for pushing).
 */
export async function saveExerciseProgressionSettings(
  exercise: Exercise,
  patch: ExerciseSettingsPatch,
  deps: Deps,
): Promise<ExerciseProgressionSettings | null> {
  const repo = deps.progressionRepo;
  if (!repo.saveExerciseSettings || !repo.getExerciseSettings) return null;
  const key = exerciseKey(exercise);
  const existing = await repo.getExerciseSettings(key);
  const now = nowMs();
  const merged: ExerciseProgressionSettings = {
    key,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    createdAtMs: existing?.createdAtMs ?? now,
    algorithmId: existing && !existing.deletedAtMs ? existing.algorithmId : undefined,
    repRange: existing && !existing.deletedAtMs ? existing.repRange : undefined,
    behindPace: existing && !existing.deletedAtMs ? existing.behindPace : undefined,
    setTarget: existing && !existing.deletedAtMs ? existing.setTarget : undefined,
    ...patch,
    updatedAtMs: Math.max(now, (existing?.updatedAtMs ?? 0) + 1),
  };
  if (merged.repRange) {
    const [a, b] = merged.repRange;
    const lo = Math.max(1, Math.round(Math.min(a, b)));
    merged.repRange = [lo, Math.max(lo, Math.round(Math.max(a, b)))];
  }
  const row: ExerciseProgressionSettings = isDefaultExerciseSettings(merged)
    ? { key, exerciseId: exercise.id, exerciseName: exercise.name, createdAtMs: merged.createdAtMs, updatedAtMs: merged.updatedAtMs, deletedAtMs: now }
    : stripUndefined({ ...merged, deletedAtMs: undefined });
  await repo.saveExerciseSettings(row);
  return row;
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Every exercise set differently from the rest (live rows only; muscle targets left out). */
export async function listExerciseProgressionSettings(deps: Deps): Promise<ExerciseProgressionSettings[]> {
  const rows = (await deps.progressionRepo.listExerciseSettings?.()) ?? [];
  return rows.filter((r) => !r.deletedAtMs && !r.key.startsWith(MUSCLE_SETTINGS_PREFIX));
}

// ── A muscle's weekly set target ─────────────────────────────────────────────

/** The lifter's own weekly set targets, by muscle. */
export async function getMuscleSetTargets(deps: Deps): Promise<Partial<Record<MuscleGroup, { lo: number; hi: number }>>> {
  const out: Partial<Record<MuscleGroup, { lo: number; hi: number }>> = {};
  for (const r of (await deps.progressionRepo.listExerciseSettings?.()) ?? []) {
    if (r.deletedAtMs || !r.setTarget || !r.key.startsWith(MUSCLE_SETTINGS_PREFIX)) continue;
    out[r.key.slice(MUSCLE_SETTINGS_PREFIX.length) as MuscleGroup] = r.setTarget;
  }
  return out;
}

/** Set a muscle's weekly target, or null to go back to the default. Returns the row, for pushing. */
export async function saveMuscleSetTarget(muscle: MuscleGroup, target: { lo: number; hi: number } | null, deps: Deps) {
  const t = target ? { lo: Math.max(0, Math.round(target.lo)), hi: Math.max(Math.round(target.lo), Math.round(target.hi)) } : undefined;
  return saveExerciseProgressionSettings(
    { id: `${MUSCLE_SETTINGS_PREFIX}${muscle}`, name: muscle },
    { setTarget: t },
    { progressionRepo: deps.progressionRepo },
  );
}

/**
 * Which algorithm plans this exercise: its own, else the general one. Null when
 * suggestions are off (for this exercise, or everywhere with no override).
 */
export async function resolveAlgorithmId(
  exercise: Exercise,
  deps: Deps,
  settings?: ExerciseProgressionSettings | null,
): Promise<string | null> {
  const own = settings === undefined ? await getExerciseProgressionSettings(exercise, deps) : settings;
  if (own?.algorithmId === PROGRESSION_OFF) return null;
  if (own?.algorithmId) return own.algorithmId;
  return (await deps.progressionRepo.getConfig())?.algorithmId ?? null;
}
