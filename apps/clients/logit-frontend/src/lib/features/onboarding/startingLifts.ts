// Best lifts typed in during onboarding ("Your best lifts", design canvas E1m). Kept on the
// exercise's progression settings row, so they sync; the planner reads one as the exercise's
// history until it's first logged (core domain/startingLift.ts).
import { getExerciseRepo } from "$lib/data/repoProvider";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { pushExerciseSetting } from "$lib/sync/syncService";
import { getExerciseProgressionSettings, saveExerciseProgressionSettings } from "@logit/core/usecases/progression/exerciseProgressionSettings";

type ExerciseRef = { id?: string; name: string };

/** The library exercise's id when only a name is known, so the row is the one the plan uses. */
async function withId(ex: ExerciseRef): Promise<{ id?: string; name: string }> {
  if (ex.id) return ex;
  const found = await getExerciseRepo().getByName(ex.name).catch(() => null);
  return { id: found?.id, name: found?.name ?? ex.name };
}

/** Saves a best lift (in kg), or clears it with null. */
export async function saveStartingLift(ex: ExerciseRef, lift: { weightKg: number; reps: number } | null): Promise<void> {
  const exercise = await withId(ex);
  const deps = getProgressionDeps();
  if (!lift && !(await getExerciseProgressionSettings(exercise, deps))?.startingLift) return;
  const row = await saveExerciseProgressionSettings(exercise, { startingLift: lift ? { ...lift, enteredAtMs: Date.now() } : undefined }, deps);
  if (row) pushExerciseSetting(row);
}

export async function hasStartingLift(ex: ExerciseRef): Promise<boolean> {
  return !!(await getExerciseProgressionSettings(await withId(ex), getProgressionDeps()))?.startingLift;
}
