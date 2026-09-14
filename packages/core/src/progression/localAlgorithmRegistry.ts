import type { AlgorithmRegistry } from "./algorithmRegistry";
import type { ProgressionAlgorithm, ProgressionAlgorithmMeta } from "../domain/progression";
import { linearProgression } from "./algorithms/linearProgression";

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
