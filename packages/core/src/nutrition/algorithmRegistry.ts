import type {
  NutritionAlgorithm,
  NutritionAlgorithmMeta,
  NutritionAlgorithmRegistry,
} from "../domain/nutritionAlgorithm";
import { standardAdaptive } from "./algorithms/standardAdaptive";

const BUILTIN: NutritionAlgorithm[] = [standardAdaptive];

/** Registry of the algorithms bundled with the app. The plugin runtime wraps this to add
 * community-installed algorithms (see plugins/runtime.ts). */
export function createLocalNutritionAlgorithmRegistry(): NutritionAlgorithmRegistry {
  return {
    async list(): Promise<NutritionAlgorithmMeta[]> {
      return BUILTIN.map(({ id, name, description, author }) => ({ id, name, description, author }));
    },
    async get(id: string): Promise<NutritionAlgorithm | null> {
      return BUILTIN.find((a) => a.id === id) ?? null;
    },
  };
}
