import type {
  MuscleGroupInsightAlgorithm,
  MuscleGroupInsightAlgorithmMeta,
  MuscleGroupInsightAlgorithmRegistry,
} from "@logit/core/domain/muscleGroupInsight";
import { learnedMuscleGroupInsight } from "$lib/progression/algorithms/learnedMuscleGroupInsight";

const BUNDLED: MuscleGroupInsightAlgorithm[] = [learnedMuscleGroupInsight];

export function createLocalMuscleGroupInsightAlgorithmRegistry(): MuscleGroupInsightAlgorithmRegistry {
  return {
    async list(): Promise<MuscleGroupInsightAlgorithmMeta[]> {
      return BUNDLED.map(({ id, name, description, author }) => ({ id, name, description, author }));
    },

    async get(id: string): Promise<MuscleGroupInsightAlgorithm | null> {
      return BUNDLED.find((a) => a.id === id) ?? null;
    },
  };
}
