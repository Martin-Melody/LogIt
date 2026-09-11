import type {
  MobilityProgressionAlgorithm,
  MobilityProgressionAlgorithmMeta,
  MobilityProgressionAlgorithmRegistry,
} from "@logit/core/domain/mobilityProgression";
import { linearMobility } from "$lib/progression/algorithms/linearMobility";

const BUNDLED: MobilityProgressionAlgorithm[] = [linearMobility];

export function createLocalMobilityAlgorithmRegistry(): MobilityProgressionAlgorithmRegistry {
  return {
    async list(): Promise<MobilityProgressionAlgorithmMeta[]> {
      return BUNDLED.map(({ id, name, description, author }) => ({ id, name, description, author }));
    },

    async get(id: string): Promise<MobilityProgressionAlgorithm | null> {
      return BUNDLED.find((a) => a.id === id) ?? null;
    },
  };
}
