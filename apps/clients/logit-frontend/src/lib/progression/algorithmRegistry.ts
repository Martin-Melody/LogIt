import type {
  ProgressionAlgorithm,
  ProgressionAlgorithmMeta,
} from "$lib/domain/progression";

export interface AlgorithmRegistry {
  list(): Promise<ProgressionAlgorithmMeta[]>;
  get(id: string): Promise<ProgressionAlgorithm | null>;
}
