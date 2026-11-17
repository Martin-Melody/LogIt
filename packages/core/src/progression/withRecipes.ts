import type { AlgorithmRegistry } from "./algorithmRegistry";
import type { ProgressionAlgorithm, ProgressionAlgorithmMeta } from "../domain/progression";
import { isRecipeAlgorithmId, RECIPE_ID_PREFIX, type ProgressionRecipe } from "../domain/progressionRecipe";
import { recipeAlgorithm } from "./algorithms/recipe";

/** Adds the lifter's own block-built algorithms (live ones) to a registry. */
export function withRecipes(base: AlgorithmRegistry, listRecipes: () => Promise<ProgressionRecipe[]>): AlgorithmRegistry {
  const live = async () => (await listRecipes().catch(() => [])).filter((r) => !r.deletedAtMs);
  return {
    async list(): Promise<ProgressionAlgorithmMeta[]> {
      const recipes = (await live()).map(recipeAlgorithm).map(({ id, name, description, author }) => ({ id, name, description, author }));
      return [...(await base.list()), ...recipes];
    },
    async get(id: string): Promise<ProgressionAlgorithm | null> {
      if (!isRecipeAlgorithmId(id)) return base.get(id);
      const recipe = (await live()).find((r) => r.id === id.slice(RECIPE_ID_PREFIX.length));
      return recipe ? recipeAlgorithm(recipe) : null;
    },
  };
}
