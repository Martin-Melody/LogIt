import {
  DEFAULT_NUTRITION_ALGORITHM_ID,
  algorithmPrefsFor,
  resolveAlgorithmId,
  withAlgorithm,
  withAlgorithmPrefs,
  type NutritionGoal,
} from "../../domain/nutrition";
import type {
  AlgorithmPreferencesField,
  NutritionAlgorithmMeta,
} from "../../domain/nutritionAlgorithm";
import type { NutritionDeps } from "./deps";

export { DEFAULT_NUTRITION_ALGORITHM_ID };

export type NutritionAlgorithmEntry = NutritionAlgorithmMeta & {
  hasPreferences: boolean;
};

export type NutritionAlgorithmConfigView = {
  selectedId: string;
  algorithms: NutritionAlgorithmEntry[];
};

export async function getNutritionAlgorithmConfig(
  goal: NutritionGoal | null,
  deps: Pick<NutritionDeps, "nutritionAlgorithmRegistry">,
): Promise<NutritionAlgorithmConfigView> {
  const registry = deps.nutritionAlgorithmRegistry;
  const metas = await registry.list();
  const algorithms: NutritionAlgorithmEntry[] = await Promise.all(
    metas.map(async (meta) => {
      const full = await registry.get(meta.id);
      return { ...meta, hasPreferences: !!full?.preferencesSchema?.length };
    }),
  );
  return { selectedId: resolveAlgorithmId(goal), algorithms };
}

/** Full algorithm (incl. its preferences schema) + the effective stored preferences. */
export async function getNutritionAlgorithmPreferences(
  goal: NutritionGoal | null,
  algorithmId: string,
  deps: Pick<NutritionDeps, "nutritionAlgorithmRegistry">,
): Promise<{
  schema: AlgorithmPreferencesField[];
  values: Record<string, unknown>;
} | null> {
  const algorithm = await deps.nutritionAlgorithmRegistry.get(algorithmId);
  if (!algorithm) return null;
  const schema = algorithm.preferencesSchema ?? [];
  const defaults: Record<string, unknown> = {};
  for (const f of schema) defaults[f.key] = f.default;
  return {
    schema,
    values: { ...defaults, ...algorithmPrefsFor(goal, algorithmId) },
  };
}

/** Return the goal with the selected algorithm set — caller saves + pushes it. */
export function setNutritionAlgorithm(goal: NutritionGoal, algorithmId: string): NutritionGoal {
  return withAlgorithm(goal, algorithmId || DEFAULT_NUTRITION_ALGORITHM_ID);
}

/** Return the goal with one algorithm's preferences replaced — caller saves + pushes it. */
export function setNutritionAlgorithmPreferences(
  goal: NutritionGoal,
  algorithmId: string,
  prefs: Record<string, unknown>,
): NutritionGoal {
  return withAlgorithmPrefs(goal, algorithmId, prefs);
}
