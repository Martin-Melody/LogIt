import { normalizeRecipe, recipeAlgorithmId, type ProgressionRecipe } from "../../domain/progressionRecipe";
import { nowMs } from "../../domain/time";
import { recipeAlgorithm } from "../../progression/algorithms/recipe";
import { DEFAULT_PROGRESSION_ALGORITHM_ID } from "../../progression/localAlgorithmRegistry";
import { getSuggestion } from "./getSuggestion";
import type { ProgressionDeps } from "./deps";

type Deps = Pick<ProgressionDeps, "progressionRepo">;

/** The lifter's own block-built algorithms, newest first. */
export async function listProgressionRecipes(deps: Deps): Promise<ProgressionRecipe[]> {
  const rows = (await deps.progressionRepo.listRecipes?.()) ?? [];
  return rows.filter((r) => !r.deletedAtMs).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export async function getProgressionRecipe(id: string, deps: Deps): Promise<ProgressionRecipe | null> {
  return (await listProgressionRecipes(deps)).find((r) => r.id === id) ?? null;
}

/** Save (create or change) one; returns the saved row, for pushing. */
export async function saveProgressionRecipe(recipe: ProgressionRecipe, deps: Deps): Promise<ProgressionRecipe> {
  const row = normalizeRecipe({ ...recipe, updatedAtMs: Math.max(nowMs(), recipe.updatedAtMs + 1) });
  await deps.progressionRepo.saveRecipe?.(row);
  return row;
}

/**
 * Delete one (a tombstone, so it syncs). Anything set to use it goes back to a working
 * algorithm: the general setting to LogIt Adaptive, an exercise to the general one.
 * Returns the tombstone and the exercise rows that changed, for pushing.
 */
export async function deleteProgressionRecipe(id: string, deps: Deps) {
  const repo = deps.progressionRepo;
  const existing = (await repo.listRecipes?.())?.find((r) => r.id === id);
  if (!existing) return { tombstone: null, exercises: [] };
  const now = nowMs();
  const tombstone: ProgressionRecipe = { ...existing, deletedAtMs: now, updatedAtMs: Math.max(now, existing.updatedAtMs + 1) };
  await repo.saveRecipe?.(tombstone);

  const algoId = recipeAlgorithmId(id);
  if ((await repo.getConfig())?.algorithmId === algoId) await repo.saveConfig({ algorithmId: DEFAULT_PROGRESSION_ALGORITHM_ID });
  const exercises = [];
  for (const s of (await repo.listExerciseSettings?.()) ?? []) {
    if (s.deletedAtMs || s.algorithmId !== algoId) continue;
    const { algorithmId: _gone, ...rest } = s;
    void _gone;
    const changed = { ...rest, updatedAtMs: now };
    await repo.saveExerciseSettings?.(changed);
    exercises.push(changed);
  }
  return { tombstone, exercises };
}

/** What a recipe would plan for an exercise's next session, from the lifter's real history. */
export function previewProgressionRecipe(
  recipe: ProgressionRecipe,
  exercise: { id?: string; name: string },
  deps: Parameters<typeof getSuggestion>[1],
) {
  return getSuggestion(exercise, deps, undefined, undefined, undefined, recipeAlgorithm(normalizeRecipe(recipe)));
}

