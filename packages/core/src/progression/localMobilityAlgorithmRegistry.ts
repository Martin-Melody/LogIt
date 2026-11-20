import type {
  MobilityProgressionAlgorithm,
  MobilityProgressionAlgorithmMeta,
  MobilityProgressionAlgorithmRegistry,
} from "../domain/mobilityProgression";
import { linearMobility } from "./algorithms/linearMobility";
import { sameEveryTime } from "./algorithms/sameEveryTime";

const BUNDLED: MobilityProgressionAlgorithm[] = [linearMobility, sameEveryTime];

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
