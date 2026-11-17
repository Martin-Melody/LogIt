import type { AlgorithmRegistry } from "./algorithmRegistry";
import type { ProgressionAlgorithm, ProgressionAlgorithmMeta } from "../domain/progression";
import { linearProgression } from "./algorithms/linearProgression";
import { adaptiveProgression } from "./algorithms/adaptiveProgression";

/** The default for new accounts. Linear Progression stays as the simple option. */
export const DEFAULT_PROGRESSION_ALGORITHM_ID = adaptiveProgression.id;

const BUNDLED: ProgressionAlgorithm[] = [adaptiveProgression, linearProgression];

export function createLocalAlgorithmRegistry(): AlgorithmRegistry {
  return {
    async list(): Promise<ProgressionAlgorithmMeta[]> {
      return BUNDLED.map(({ id, name, description, author }) => ({
        id,
        name,
        description,
        author,
      }));
    },

    async get(id: string): Promise<ProgressionAlgorithm | null> {
      return BUNDLED.find((a) => a.id === id) ?? null;
    },
  };
}
