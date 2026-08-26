import type { AlgorithmRegistry } from "@logit/core/progression/algorithmRegistry";
import type { ProgressionAlgorithm, ProgressionAlgorithmMeta } from "@logit/core/domain/progression";
import { linearProgression } from "$lib/progression/algorithms/linearProgression";

const BUNDLED: ProgressionAlgorithm[] = [linearProgression];

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
